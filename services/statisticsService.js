/**
 * statisticsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND ANALYTICS LAYER.
 *
 * Turns the raw data already in Firestore (Primary/Secondary/Tertiary products +
 * the ActivityLog event stream) into the production & inventory insights shown on
 * the Statistics page, and powers the Purchase-Order and Daily-Production-Task
 * recommendation engines.
 *
 * IMPORTANT — how consumption of PRIMARY products is derived
 * ----------------------------------------------------------
 * Primary stock is consumed when a Secondary product is produced. The system
 * does not store a dedicated "primary consumed" log, so we reconstruct it:
 *   For every "Secondary Product Credit Added" event we look up the matching
 *   secondary product's current recipe (components) and multiply each component
 *   quantity by the produced amount. This is the best available estimate from
 *   existing records and is clearly labelled as "derived" in the UI.
 *
 * Everything degrades gracefully: missing fields, empty logs, deleted products,
 * and incomplete history never throw — they just produce zeros/empty lists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PrimaryProduct = require("../models/primaryProduct");
const SecondaryProduct = require("../models/secondaryProduct");
const TertiaryProduct = require("../models/tertiaryProduct");
const ActivityLog = require("../models/activityLog");
const costService = require("./costService");

const { toNumber, round2 } = costService;

// Default safe-stock horizon (days) used for low-stock + production tasks.
const SAFE_STOCK_DAYS = 14;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  if (value.seconds) return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function dayKey(date) {
  // YYYY-MM-DD in local time — used to bucket events by day.
  const d = toDate(date);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Load every dataset the analytics need in one shot.
 */
async function loadData() {
  const OverheadCost = require("../models/overheadCost");
  const Worker = require("../models/worker");
  const Attendance = require("../models/attendance");
  const [primary, secondary, tertiary, logs, overheads, workers, attendance] =
    await Promise.all([
      PrimaryProduct.getAll().catch(() => []),
      SecondaryProduct.getAll().catch(() => []),
      TertiaryProduct.getAll().catch(() => []),
      ActivityLog.getAll().catch(() => []),
      OverheadCost.getAll().catch(() => []),
      Worker.getAll().catch(() => []),
      Attendance.getRecent(60).catch(() => []),
    ]);
  return { primary, secondary, tertiary, logs, overheads, workers, attendance };
}

/**
 * Build a name -> product map (case-insensitive) so we can match the itemName
 * recorded on a log back to a recipe. Falls back to id match.
 */
function buildNameIndex(products) {
  const byName = {};
  const byId = {};
  for (const p of products || []) {
    byId[p.id] = p;
    if (p.name) byName[p.name.trim().toLowerCase()] = p;
  }
  return { byName, byId };
}

/**
 * Reconstruct consumption across ALL tiers from the activity log.
 *
 * Consumption (a.k.a. demand) is derived per tier from the events that draw
 * each tier down:
 *   • PRIMARY   is consumed when a SECONDARY product is produced
 *               (secondary credit × secondary recipe).
 *   • SECONDARY is consumed when a TERTIARY product is produced
 *               (tertiary credit × tertiary recipe).
 *   • TERTIARY  is consumed when it is SOLD ("Tertiary Product Sold" events).
 *
 * This is the "smart" sold/consumed analysis: every tier's real draw-down is
 * reconstructed from existing records, so production planning for secondary and
 * tertiary products reflects what is actually being used and sold.
 *
 * Returns consumptionBy{Primary,Secondary,Tertiary}, productionByTier,
 * damageByTier, and the observed window.
 */
function analyzeLogs(logs, secondary, primary, tertiary) {
  const secIndex = buildNameIndex(secondary);
  const terIndex = buildNameIndex(tertiary);
  const priIndex = buildNameIndex(primary);

  const consumptionByPrimary = {};
  const consumptionBySecondary = {};
  const consumptionByTertiary = {};
  const productionByTier = { Primary: {}, Secondary: {}, Tertiary: {} };
  const damageByTier = { Primary: {}, Secondary: {}, Tertiary: {} };

  let firstDate = null;
  let lastDate = null;

  // Generic accumulator factory for any consumption ledger.
  const ensure = (ledger, index, id, name) => {
    if (!ledger[id]) {
      ledger[id] = {
        id,
        name: name || (index.byId[id] && index.byId[id].name) || id,
        totalConsumed: 0,
        daily: {},
      };
    }
    return ledger[id];
  };

  const addConsumption = (ledger, index, components, multiplier, key) => {
    if (!Array.isArray(components)) return;
    for (const comp of components) {
      if (!comp.productId) continue;
      const used = round2(toNumber(comp.quantity, 0) * multiplier);
      if (used <= 0) continue;
      const rec = ensure(ledger, index, comp.productId);
      rec.totalConsumed = round2(rec.totalConsumed + used);
      rec.daily[key] = round2((rec.daily[key] || 0) + used);
    }
  };

  for (const log of logs) {
    const d = toDate(log.timestamp);
    if (d) {
      if (!firstDate || d < firstDate) firstDate = d;
      if (!lastDate || d > lastDate) lastDate = d;
    }
    const key = dayKey(log.timestamp);
    const qty = toNumber(log.quantity, 0);
    const action = String(log.action || "");
    const tier = log.itemType;

    // ── Production credit events ────────────────────────────────────────────
    if (action.includes("Credit Added") && qty > 0) {
      if (productionByTier[tier]) {
        productionByTier[tier][key] = round2(
          (productionByTier[tier][key] || 0) + qty,
        );
      }

      const isDamaged = log.status === "Damaged" || action.includes("Damaged");
      if (isDamaged && damageByTier[tier]) {
        damageByTier[tier][key] = round2((damageByTier[tier][key] || 0) + qty);
      }

      // PRIMARY consumption ← secondary production × secondary recipe.
      if (tier === "Secondary") {
        const match =
          secIndex.byName[
            String(log.itemName || "")
              .trim()
              .toLowerCase()
          ] || null;
        if (match)
          addConsumption(
            consumptionByPrimary,
            priIndex,
            match.components,
            qty,
            key,
          );
      }

      // SECONDARY consumption ← tertiary production × tertiary recipe.
      if (tier === "Tertiary") {
        const match =
          terIndex.byName[
            String(log.itemName || "")
              .trim()
              .toLowerCase()
          ] || null;
        if (match)
          addConsumption(
            consumptionBySecondary,
            secIndex,
            match.components,
            qty,
            key,
          );
      }
    }

    // ── Sale events: TERTIARY consumption (demand) ────────────────────────────
    if (action.includes("Sold") && qty > 0 && tier === "Tertiary") {
      const match =
        terIndex.byName[
          String(log.itemName || "")
            .trim()
            .toLowerCase()
        ] || null;
      const id = match ? match.id : String(log.itemName || "unknown");
      const rec = ensure(consumptionByTertiary, terIndex, id, log.itemName);
      rec.totalConsumed = round2(rec.totalConsumed + qty);
      rec.daily[key] = round2((rec.daily[key] || 0) + qty);
    }
  }

  return {
    consumptionByPrimary,
    consumptionBySecondary,
    consumptionByTertiary,
    productionByTier,
    damageByTier,
    firstDate,
    lastDate,
  };
}

/** Sum the values of a { day: qty } map. */
function sumMap(map) {
  return round2(Object.values(map || {}).reduce((s, v) => s + toNumber(v), 0));
}

/** Sum a { day: qty } map but only for days within the last N days. */
function sumLastDays(map, days, refDate) {
  const cutoff = new Date(toDate(refDate).getTime() - days * 86400000);
  let total = 0;
  for (const [day, qty] of Object.entries(map || {})) {
    const d = toDate(day);
    if (d && d >= cutoff) total += toNumber(qty);
  }
  return round2(total);
}

/**
 * Build per-product consumption & coverage stats for one tier.
 * Reused for primary, secondary, and tertiary so the metrics are consistent.
 *
 * @param products       array of product docs (need id, name, quantity, price?)
 * @param ledger         consumptionBy{Tier} map from analyzeLogs
 * @param windowDays     observed analysis window
 * @param today          reference date
 */
function buildProductStats(products, ledger, windowDays, today) {
  return products.map((p) => {
    const cons = ledger[p.id] || { totalConsumed: 0, daily: {} };
    const totalConsumed = round2(cons.totalConsumed);
    const avgDaily = round2(totalConsumed / windowDays);
    const currentStock = toNumber(p.quantity, 0);
    const damaged = toNumber(p.damagedQuantity, 0);
    const price = toNumber(p.price, 0);
    const coverageDays =
      avgDaily > 0 ? Math.floor(currentStock / avgDaily) : null;
    return {
      id: p.id,
      name: p.name,
      price,
      hasPrice: price > 0,
      currentStock,
      damaged,
      totalConsumed,
      avgDaily,
      consumed7: sumLastDays(cons.daily, 7, today),
      consumed30: sumLastDays(cons.daily, 30, today),
      coverageDays,
      belowSafe: avgDaily > 0 && currentStock < avgDaily * SAFE_STOCK_DAYS,
      consumedCost: round2(totalConsumed * price),
    };
  });
}

/**
 * Core builder — produces the full statistics object consumed by the view and
 * the recommendation endpoints.
 */
async function getStatistics() {
  const { primary, secondary, tertiary, logs, overheads, workers, attendance } =
    await loadData();
  const analysis = analyzeLogs(logs, secondary, primary, tertiary);
  const costs = costService.calculateAll(primary, secondary, tertiary);

  const today = new Date();
  const windowDays = analysis.firstDate
    ? daysBetween(analysis.firstDate, today)
    : 1;

  // ── Per-tier consumption / coverage metrics ─────────────────────────────────
  const primaryStats = buildProductStats(
    primary,
    analysis.consumptionByPrimary,
    windowDays,
    today,
  );
  // Secondary & tertiary stats drive the production-task planner (these tiers
  // only — primary is replenished via purchase orders, not production tasks).
  const secondaryStats = buildProductStats(
    secondary,
    analysis.consumptionBySecondary,
    windowDays,
    today,
  );
  const tertiaryStats = buildProductStats(
    tertiary,
    analysis.consumptionByTertiary,
    windowDays,
    today,
  );

  // Most-consumed primary products (top first).
  const mostConsumed = [...primaryStats]
    .filter((p) => p.totalConsumed > 0)
    .sort((a, b) => b.totalConsumed - a.totalConsumed);

  // Products below the safe-stock level (need attention).
  const belowSafe = primaryStats.filter((p) => p.belowSafe);

  // ── Daily production series (last 30 days, all tiers) ───────────────────────
  const allDays = new Set();
  ["Primary", "Secondary", "Tertiary"].forEach((tier) => {
    Object.keys(analysis.productionByTier[tier]).forEach((d) => allDays.add(d));
    Object.keys(analysis.damageByTier[tier]).forEach((d) => allDays.add(d));
  });
  const dailyProduction = [...allDays]
    .sort()
    .slice(-30)
    .map((day) => ({
      day,
      primary: analysis.productionByTier.Primary[day] || 0,
      secondary: analysis.productionByTier.Secondary[day] || 0,
      tertiary: analysis.productionByTier.Tertiary[day] || 0,
      damaged:
        (analysis.damageByTier.Primary[day] || 0) +
        (analysis.damageByTier.Secondary[day] || 0) +
        (analysis.damageByTier.Tertiary[day] || 0),
    }));

  // ── Consumption rate roll-ups (all primaries combined) ──────────────────────
  const consumptionRates = {
    daily: round2(primaryStats.reduce((s, p) => s + p.avgDaily, 0)),
    weekly: round2(primaryStats.reduce((s, p) => s + p.consumed7, 0)),
    monthly: round2(primaryStats.reduce((s, p) => s + p.consumed30, 0)),
  };

  // ── Damage / waste summary ──────────────────────────────────────────────────
  const damageTotals = {
    primary: round2(
      primary.reduce((s, p) => s + toNumber(p.damagedQuantity, 0), 0),
    ),
    secondary: round2(
      secondary.reduce((s, p) => s + toNumber(p.damagedQuantity, 0), 0),
    ),
    tertiary: round2(
      tertiary.reduce((s, p) => s + toNumber(p.damagedQuantity, 0), 0),
    ),
  };
  // Cost of damaged primary material (qty × price).
  const damageCost = round2(
    primary.reduce(
      (s, p) => s + toNumber(p.damagedQuantity, 0) * toNumber(p.price, 0),
      0,
    ),
  );

  // ── Cost of consumed materials (Σ consumed × price across primaries) ────────
  const consumedMaterialCost = round2(
    primaryStats.reduce((s, p) => s + p.consumedCost, 0),
  );

  // ── Current stock levels snapshot ───────────────────────────────────────────
  const stockLevels = {
    primary: primary.map((p) => ({
      name: p.name,
      quantity: toNumber(p.quantity, 0),
    })),
    secondaryTotal: round2(
      secondary.reduce((s, p) => s + toNumber(p.quantity, 0), 0),
    ),
    tertiaryTotal: round2(
      tertiary.reduce((s, p) => s + toNumber(p.quantity, 0), 0),
    ),
    primaryTotal: round2(
      primary.reduce((s, p) => s + toNumber(p.quantity, 0), 0),
    ),
  };

  // ── Units produced in the window (for overhead/labour allocation) ──────────
  // Allocate shared costs across all finished secondary + tertiary units made.
  const unitsProduced =
    sumMap(analysis.productionByTier.Secondary) +
    sumMap(analysis.productionByTier.Tertiary);

  // ── Overhead (fixed + variable, non-material) over the window ──────────────
  const OverheadCost = require("../models/overheadCost");
  const overheadSummary = OverheadCost.summarize(
    overheads || [],
    windowDays,
    unitsProduced,
  );

  // ── Labour cost over the window, from wages × attendance ───────────────────
  // For each recorded attendance day, add each present worker's day-equivalent
  // wage. Hourly assumes an 8-hour day; monthly is spread over 30 days.
  const wageById = {};
  (workers || []).forEach((w) => {
    wageById[w.id] = {
      wage: toNumber(w.wage, 0),
      type: w.wageType || "daily",
      name: w.name,
    };
  });
  const dayEquivalent = (info) => {
    if (!info) return 0;
    if (info.type === "hourly") return info.wage * 8;
    if (info.type === "monthly") return info.wage / 30;
    return info.wage; // daily
  };
  let laborCost = 0;
  let attendanceDays = 0;
  (attendance || []).forEach((day) => {
    const present = (day.records || []).filter((r) => r.present);
    if (present.length) attendanceDays += 1;
    present.forEach((r) => {
      laborCost += dayEquivalent(wageById[r.workerId]);
    });
  });
  laborCost = round2(laborCost);
  const laborPerUnit =
    unitsProduced > 0 ? round2(laborCost / unitsProduced) : 0;

  // ── Fully-loaded cost per unit = materials + overhead + labour ─────────────
  // Material cost per unit is averaged across produced secondary+tertiary units.
  const materialCostInStock =
    costs.totals.secondaryStockValue + costs.totals.tertiaryStockValue;
  const avgMaterialPerUnit = round2(
    costService.toNumber(
      (costs.secondaryCosts.reduce((s, c) => s + c.unitCost, 0) +
        costs.tertiaryCosts.reduce((s, c) => s + c.unitCost, 0)) /
        Math.max(1, costs.secondaryCosts.length + costs.tertiaryCosts.length),
    ),
  );
  const overheadPerUnit = overheadSummary.perUnitTotal;
  const fullyLoadedPerUnit = round2(
    avgMaterialPerUnit + overheadPerUnit + laborPerUnit,
  );

  // Attach a fully-loaded unit cost to each secondary/tertiary cost row so the
  // statistics page can show materials vs. fully-loaded side by side.
  const addLoaded = (rows) =>
    rows.map((r) => ({
      ...r,
      fullyLoadedUnitCost: round2(r.unitCost + overheadPerUnit + laborPerUnit),
    }));
  costs.secondaryCosts = addLoaded(costs.secondaryCosts);
  costs.tertiaryCosts = addLoaded(costs.tertiaryCosts);

  const costing = {
    unitsProduced: round2(unitsProduced),
    overhead: overheadSummary,
    labor: { total: laborCost, perUnit: laborPerUnit, attendanceDays },
    perUnit: {
      material: avgMaterialPerUnit,
      overhead: overheadPerUnit,
      labor: laborPerUnit,
      fullyLoaded: fullyLoadedPerUnit,
    },
  };

  return {
    generatedAt: today,
    windowDays,
    firstDate: analysis.firstDate,
    safeStockDays: SAFE_STOCK_DAYS,
    primaryStats,
    secondaryStats,
    tertiaryStats,
    mostConsumed,
    belowSafe,
    dailyProduction,
    consumptionRates,
    damageTotals,
    damageCost,
    consumedMaterialCost,
    stockLevels,
    costs, // full cost breakdown from costService (+ fullyLoadedUnitCost)
    costing, // overhead, labour, fully-loaded cost-per-unit
    workerRanking: rankWorkers(workers),
    counts: {
      primary: primary.length,
      secondary: secondary.length,
      tertiary: tertiary.length,
      logs: logs.length,
    },
  };
}

/** Rank workers by performance score (see Worker.computeRank). */
function rankWorkers(workers) {
  const Worker = require("../models/worker");
  return (workers || [])
    .map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      wage: toNumber(w.wage, 0),
      wageType: w.wageType || "daily",
      ...Worker.computeRank(w),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * PURCHASE-ORDER RECOMMENDATION (primary products only).
 *
 * Required quantity = (avg daily consumption × coverage days) − current stock
 * Clamped at 0 — if stock already covers the period, no order is suggested.
 *
 * @param {number} coverageDays  target coverage period in days
 */
async function getPurchaseOrder(coverageDays = 30) {
  const days = Math.max(1, toNumber(coverageDays, 30));
  const stats = await getStatistics();

  const items = stats.primaryStats.map((p) => {
    const needed = round2(p.avgDaily * days); // expected consumption over period
    const orderQty = Math.max(0, round2(needed - p.currentStock));
    const estCost = round2(orderQty * p.price);
    return {
      id: p.id,
      name: p.name,
      avgDaily: p.avgDaily,
      currentStock: p.currentStock,
      requiredForPeriod: needed,
      recommendedOrder: orderQty,
      hasPrice: p.hasPrice,
      unitPrice: p.price,
      estimatedCost: estCost,
      sufficient: orderQty <= 0,
      noData: p.avgDaily <= 0, // no consumption history to base the order on
    };
  });

  const totalEstimatedCost = round2(
    items.reduce((s, i) => s + i.estimatedCost, 0),
  );

  return {
    coverageDays: days,
    items,
    totalEstimatedCost,
    orderNeededCount: items.filter((i) => i.recommendedOrder > 0).length,
  };
}

/**
 * DAILY PRODUCTION-TASK RECOMMENDATION — SECONDARY & TERTIARY PRODUCTS ONLY.
 *
 * Primary products are replenished through the Purchase-Order recommendation
 * (you buy raw materials, you don't "produce" them), so the production planner
 * deliberately covers only the tiers that are actually produced in the hall:
 * secondary and tertiary.
 *
 * Consumption rates come from the smart analysis:
 *   • secondary avgDaily = how fast it is consumed by tertiary production
 *   • tertiary  avgDaily = how fast it is sold
 *
 *   requiredStock = avgDaily × targetDays
 *   shortage      = requiredStock − currentStock   (clamped at 0)
 *   suggestQty    = shortage  (produce enough to restore target coverage)
 */
async function getProductionTasks(targetDays = SAFE_STOCK_DAYS) {
  const days = Math.max(1, toNumber(targetDays, SAFE_STOCK_DAYS));
  const stats = await getStatistics();

  const mapTask = (tier) => (p) => {
    const required = round2(p.avgDaily * days);
    const shortage = Math.max(0, round2(required - p.currentStock));
    return {
      id: p.id,
      name: p.name,
      tier,
      currentStock: p.currentStock,
      avgDaily: p.avgDaily,
      requiredStock: required,
      shortage,
      suggestedProduction: shortage,
      needsProduction: shortage > 0,
      noData: p.avgDaily <= 0,
      coverageDays: p.coverageDays,
    };
  };

  const secondaryTasks = stats.secondaryStats.map(mapTask("Secondary"));
  const tertiaryTasks = stats.tertiaryStats.map(mapTask("Tertiary"));
  const tasks = [...secondaryTasks, ...tertiaryTasks];

  return {
    targetDays: days,
    tasks,
    secondaryTasks,
    tertiaryTasks,
    actionCount: tasks.filter((t) => t.needsProduction).length,
  };
}

module.exports = {
  SAFE_STOCK_DAYS,
  getStatistics,
  getPurchaseOrder,
  getProductionTasks,
};
