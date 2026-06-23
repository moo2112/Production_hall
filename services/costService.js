/**
 * costService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SHARED COST-CALCULATION LOGIC (backend layer).
 *
 * This module is the single source of truth for turning the unit PRICE stored on
 * each Primary Product into a production COST for Secondary and Tertiary products.
 *
 * Dependency chain in this system:
 *   Primary  ── has a manually-entered unit `price`
 *   Secondary── components: [{ productId -> Primary, quantity }]
 *   Tertiary ── components: [{ productId -> Secondary, quantity }]
 *
 * Cost rules (all "per single produced unit"):
 *   secondaryUnitCost = Σ ( component.quantity × primaryPrice[component.productId] )
 *   tertiaryUnitCost  = Σ ( component.quantity × secondaryUnitCost[component.productId] )
 *
 * Design goals:
 *   • Pure functions — no Firestore access here, so the math is easy to test and
 *     reuse from routes, the statistics service, or future APIs.
 *   • Crash-safe — a missing or non-numeric price is treated as 0 and surfaced as
 *     a warning instead of throwing. Old records with no `price` field keep working.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  // Round money to 2 decimals without floating-point drift.
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Build a quick lookup of primary product id -> { price, name, hasPrice }.
 * `hasPrice` is false when the price is missing, null, or 0, which feeds the
 * "missing price" warnings.
 */
function buildPrimaryPriceMap(primaryProducts = []) {
  const map = {};
  for (const p of primaryProducts) {
    const price = toNumber(p.price, 0);
    map[p.id] = {
      id: p.id,
      name: p.name || p.id,
      price,
      // A price is only considered "set" when it is a positive number.
      hasPrice: p.price !== undefined && p.price !== null && price > 0,
    };
  }
  return map;
}

/**
 * Cost of ONE unit of a secondary product.
 * Returns { unitCost, breakdown[], missingPrices[] }.
 *   breakdown[]    -> [{ productId, name, quantity, unitPrice, lineCost }]
 *   missingPrices[]-> names of primary components that have no price set
 */
function secondaryUnitCost(secondary, primaryPriceMap) {
  const breakdown = [];
  const missingPrices = [];
  let unitCost = 0;

  const components = Array.isArray(secondary.components)
    ? secondary.components
    : [];

  for (const comp of components) {
    if (!comp || !comp.productId) continue;
    const primary = primaryPriceMap[comp.productId];
    const qty = toNumber(comp.quantity, 0);

    // If the primary product was deleted we cannot price it — skip but warn.
    if (!primary) {
      missingPrices.push(comp.productId);
      continue;
    }

    if (!primary.hasPrice) missingPrices.push(primary.name);

    const lineCost = round2(qty * primary.price);
    unitCost += lineCost;
    breakdown.push({
      productId: comp.productId,
      name: primary.name,
      quantity: qty,
      unitPrice: primary.price,
      lineCost,
    });
  }

  return { unitCost: round2(unitCost), breakdown, missingPrices };
}

// (secondaryUnitCost above returns the MATERIAL cost only; preparation cost is
// added in buildSecondaryCostMap so it flows through to tertiary costing too.)

/**
 * Compute unit cost for every secondary product up front so tertiary products
 * can reference the result without recomputing. Keyed by secondary id.
 */
function buildSecondaryCostMap(secondaryProducts = [], primaryPriceMap) {
  const map = {};
  for (const sec of secondaryProducts) {
    const result = secondaryUnitCost(sec, primaryPriceMap);
    // Add the secondary's own preparation cost on top of its material cost.
    const prep = toNumber(sec.preparationCost, 0);
    const materialCost = result.unitCost;
    map[sec.id] = {
      id: sec.id,
      name: sec.name || sec.id,
      ...result,
      materialCost,
      preparationCost: prep,
      unitCost: round2(materialCost + prep), // full per-unit cost of the secondary
    };
  }
  return map;
}

/**
 * Cost of ONE unit of a tertiary product, based on the secondary products it
 * consumes. Returns { unitCost, breakdown[], missingPrices[] }.
 */
function tertiaryUnitCost(tertiary, secondaryCostMap) {
  const breakdown = [];
  const missingPrices = [];
  let unitCost = 0;

  const components = Array.isArray(tertiary.components)
    ? tertiary.components
    : [];

  for (const comp of components) {
    if (!comp || !comp.productId) continue;
    const secondary = secondaryCostMap[comp.productId];
    const qty = toNumber(comp.quantity, 0);

    if (!secondary) {
      missingPrices.push(comp.productId);
      continue;
    }

    // Bubble up any missing-price warnings from the secondary recipe.
    if (secondary.missingPrices && secondary.missingPrices.length) {
      missingPrices.push(...secondary.missingPrices);
    }

    const lineCost = round2(qty * secondary.unitCost);
    unitCost += lineCost;
    breakdown.push({
      productId: comp.productId,
      name: secondary.name,
      quantity: qty,
      unitCost: secondary.unitCost,
      lineCost,
    });
  }

  return {
    unitCost: round2(unitCost),
    breakdown,
    missingPrices: [...new Set(missingPrices)],
  };
}

// Wrapper that adds the tertiary's own preparation + packaging cost on top of
// the cost of its secondary components. This is the FULL per-unit cost.
function tertiaryFullUnitCost(tertiary, secondaryCostMap) {
  const base = tertiaryUnitCost(tertiary, secondaryCostMap);
  const prep = toNumber(tertiary.preparationCost, 0);
  const pack = toNumber(tertiary.packagingCost, 0);
  return {
    ...base,
    componentsCost: base.unitCost, // cost from secondary components only
    preparationCost: prep,
    packagingCost: pack,
    unitCost: round2(base.unitCost + prep + pack),
  };
}

/**
 * One-stop calculation used by the Statistics page and the secondary/tertiary
 * routes. Returns a fully-priced snapshot of the catalogue.
 *
 * @param {Array} primaryProducts
 * @param {Array} secondaryProducts
 * @param {Array} tertiaryProducts
 * @returns {{
 *   primaryPriceMap, secondaryCosts[], tertiaryCosts[],
 *   totals, missingPriceWarnings[]
 * }}
 */
function calculateAll(
  primaryProducts = [],
  secondaryProducts = [],
  tertiaryProducts = [],
) {
  const primaryPriceMap = buildPrimaryPriceMap(primaryProducts);
  const secondaryCostMap = buildSecondaryCostMap(
    secondaryProducts,
    primaryPriceMap,
  );

  // Secondary cost rows (with current-stock value)
  const secondaryCosts = secondaryProducts.map((sec) => {
    const c = secondaryCostMap[sec.id];
    const stock = toNumber(sec.quantity, 0);
    return {
      id: sec.id,
      name: sec.name || sec.id,
      unitCost: c.unitCost,
      materialCost: c.materialCost,
      preparationCost: c.preparationCost,
      stock,
      stockValue: round2(c.unitCost * stock),
      breakdown: c.breakdown,
      missingPrices: c.missingPrices,
    };
  });

  // Tertiary cost rows (components + preparation + packaging)
  const tertiaryCosts = tertiaryProducts.map((ter) => {
    const c = tertiaryFullUnitCost(ter, secondaryCostMap);
    const stock = toNumber(ter.quantity, 0);
    return {
      id: ter.id,
      name: ter.name || ter.id,
      unitCost: c.unitCost,
      componentsCost: c.componentsCost,
      preparationCost: c.preparationCost,
      packagingCost: c.packagingCost,
      stock,
      stockValue: round2(c.unitCost * stock),
      breakdown: c.breakdown,
      missingPrices: c.missingPrices,
    };
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  // We expose three meaningful totals and label them clearly in the UI:
  //   secondaryStockValue : cost of raw materials currently embedded in
  //                         finished secondary stock on hand.
  //   tertiaryStockValue  : cost embedded in finished tertiary stock on hand.
  //   totalInventoryValue : the two combined (current cost value of everything
  //                         produced and still in stock).
  const secondaryStockValue = round2(
    secondaryCosts.reduce((s, r) => s + r.stockValue, 0),
  );
  const tertiaryStockValue = round2(
    tertiaryCosts.reduce((s, r) => s + r.stockValue, 0),
  );

  // Collect every distinct missing-price warning across the catalogue.
  const missingNames = new Set();
  for (const r of [...secondaryCosts, ...tertiaryCosts]) {
    (r.missingPrices || []).forEach((n) => missingNames.add(n));
  }
  // Also flag any primary that is priced 0 even if not yet used in a recipe.
  for (const id of Object.keys(primaryPriceMap)) {
    const p = primaryPriceMap[id];
    if (!p.hasPrice) missingNames.add(p.name);
  }

  return {
    primaryPriceMap,
    secondaryCostMap,
    secondaryCosts,
    tertiaryCosts,
    totals: {
      secondaryStockValue,
      tertiaryStockValue,
      totalInventoryValue: round2(secondaryStockValue + tertiaryStockValue),
    },
    missingPriceWarnings: [...missingNames],
  };
}

module.exports = {
  toNumber,
  round2,
  buildPrimaryPriceMap,
  secondaryUnitCost,
  buildSecondaryCostMap,
  tertiaryUnitCost,
  tertiaryFullUnitCost,
  calculateAll,
};
