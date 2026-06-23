const { db } = require("../config/firebase");

/**
 * OverheadCost model
 * ─────────────────────────────────────────────────────────────────────────────
 * Records production costs OTHER than raw materials, so statistics can compute a
 * fully-loaded cost per unit (materials + overhead + labour).
 *
 *   kind:   'fixed'    — recurs regardless of output (rent, salaries, utilities)
 *           'variable' — scales with output but isn't a tracked material
 *   period: 'daily' | 'monthly' | 'per_unit'
 *
 * Document shape (collection `overheadCosts`):
 *   { name, kind, period, amount, note, createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

function num(v, f = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
}

const KINDS = ["fixed", "variable"];
const PERIODS = ["daily", "monthly", "per_unit"];

class OverheadCost {
  static collectionName = "overheadCosts";

  static async create(data) {
    try {
      const payload = {
        name: String(data.name || "").trim(),
        kind: KINDS.includes(data.kind) ? data.kind : "fixed",
        period: PERIODS.includes(data.period) ? data.period : "monthly",
        amount: Math.max(0, num(data.amount, 0)),
        note: String(data.note || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating cost: ${e.message}`);
    }
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      throw new Error(`Error fetching costs: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting cost: ${e.message}`);
    }
  }

  /**
   * Normalise all overhead entries to a comparable basis over `windowDays`:
   *   - daily   → amount × windowDays
   *   - monthly → amount × (windowDays / 30)
   *   - per_unit→ amount × unitsProduced
   * Returns { totalFixed, totalVariable, perUnitFixed, perUnitVariable, total,
   *           perUnitTotal, breakdown[] }.
   */
  static summarize(costs, windowDays, unitsProduced) {
    const days = Math.max(1, num(windowDays, 1));
    const units = Math.max(0, num(unitsProduced, 0));
    let totalFixed = 0;
    let totalVariable = 0;
    const breakdown = [];

    for (const c of costs || []) {
      const amount = num(c.amount, 0);
      let windowCost = 0;
      if (c.period === "daily") windowCost = amount * days;
      else if (c.period === "monthly") windowCost = amount * (days / 30);
      else if (c.period === "per_unit") windowCost = amount * units;

      windowCost = Math.round(windowCost * 100) / 100;
      if (c.kind === "variable") totalVariable += windowCost;
      else totalFixed += windowCost;
      breakdown.push({ ...c, windowCost });
    }

    totalFixed = Math.round(totalFixed * 100) / 100;
    totalVariable = Math.round(totalVariable * 100) / 100;
    const total = Math.round((totalFixed + totalVariable) * 100) / 100;
    const perUnitTotal =
      units > 0 ? Math.round((total / units) * 100) / 100 : 0;

    return {
      totalFixed,
      totalVariable,
      total,
      perUnitTotal,
      perUnitFixed:
        units > 0 ? Math.round((totalFixed / units) * 100) / 100 : 0,
      perUnitVariable:
        units > 0 ? Math.round((totalVariable / units) * 100) / 100 : 0,
      breakdown,
    };
  }
}

OverheadCost.KINDS = KINDS;
OverheadCost.PERIODS = PERIODS;
module.exports = OverheadCost;
