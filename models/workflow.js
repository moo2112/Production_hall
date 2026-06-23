const { db } = require("../config/firebase");

/**
 * Workflow model
 * ─────────────────────────────────────────────────────────────────────────────
 * A Workflow is a reusable, designed production process: the ordered steps to
 * convert one tier into the next (primary→secondary, secondary→tertiary), or a
 * support process such as packaging & selling tertiary products.
 *
 * Each step records the expected time and the number of workers it needs, and
 * the workflow as a whole records the working-hours window. The Production-Day
 * planner uses these to turn "what to produce" into an executable task list.
 *
 * Document shape (collection `workflows`):
 *   {
 *     name, type, productId, productName, productTier,
 *     workingHoursFrom, workingHoursTo,
 *     steps: [{ id, order, name, description, expectedMinutes, workersNeeded }],
 *     createdAt, updatedAt
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TYPES = [
  "primary_to_secondary",
  "secondary_to_tertiary",
  "packaging_selling",
  "custom",
];

function num(v, f = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s, i) => ({
      id: s.id || `step_${i + 1}`,
      order: i + 1,
      name: String(s.name || "").trim(),
      description: String(s.description || "").trim(),
      // Time is PER UNIT produced. Total step time = minutesPerUnit × unitCount,
      // computed when the step is scheduled into a production task.
      // (Falls back to the older `expectedMinutes` field for compatibility.)
      minutesPerUnit: Math.max(
        0,
        num(s.minutesPerUnit != null ? s.minutesPerUnit : s.expectedMinutes, 0),
      ),
      workersNeeded: Math.max(0, num(s.workersNeeded, 1)),
    }))
    .filter((s) => s.name !== "");
}

class Workflow {
  static collectionName = "workflows";

  /** Convenience aggregates used across the app. */
  static summarize(steps) {
    const list = normalizeSteps(steps);
    return {
      // Minutes to take ONE unit through every step. Multiply by unit count to
      // get the task's total expected time.
      minutesPerUnitTotal: list.reduce((s, x) => s + x.minutesPerUnit, 0),
      // Peak workers = the most workers any single step requires (steps run
      // sequentially, so capacity must cover the busiest step).
      peakWorkers: list.reduce((m, x) => Math.max(m, x.workersNeeded), 0),
      stepCount: list.length,
    };
  }

  static async create(data) {
    try {
      const steps = normalizeSteps(data.steps);
      const payload = {
        name: String(data.name || "").trim(),
        type: TYPES.includes(data.type) ? data.type : "custom",
        productId: data.productId || null,
        productName: data.productName || "",
        productTier: data.productTier || "",
        workingHoursFrom: data.workingHoursFrom || "",
        workingHoursTo: data.workingHoursTo || "",
        steps,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating workflow: ${e.message}`);
    }
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        ...this.summarize(d.data().steps),
      }));
      // Sort newest-first by createdAt (handle Firestore Timestamp).
      return items.sort((a, b) => {
        const av = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
        const bv = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
        return bv - av;
      });
    } catch (e) {
      throw new Error(`Error fetching workflows: ${e.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data(), ...this.summarize(doc.data().steps) };
    } catch (e) {
      throw new Error(`Error fetching workflow: ${e.message}`);
    }
  }

  /** Find a workflow that produces a given product (best match by id). */
  static async findForProduct(productId) {
    if (!productId) return null;
    const all = await this.getAll();
    return all.find((w) => w.productId === productId) || null;
  }

  static async update(id, data) {
    try {
      const patch = { updatedAt: new Date() };
      if (data.name !== undefined) patch.name = String(data.name).trim();
      if (data.type !== undefined)
        patch.type = TYPES.includes(data.type) ? data.type : "custom";
      if (data.productId !== undefined)
        patch.productId = data.productId || null;
      if (data.productName !== undefined) patch.productName = data.productName;
      if (data.productTier !== undefined) patch.productTier = data.productTier;
      if (data.workingHoursFrom !== undefined)
        patch.workingHoursFrom = data.workingHoursFrom;
      if (data.workingHoursTo !== undefined)
        patch.workingHoursTo = data.workingHoursTo;
      if (data.steps !== undefined) patch.steps = normalizeSteps(data.steps);
      await db.collection(this.collectionName).doc(id).update(patch);
      return await this.getById(id);
    } catch (e) {
      throw new Error(`Error updating workflow: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting workflow: ${e.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.name || String(data.name).trim() === "")
      errors.push("Workflow name is required");
    if (!data.steps || normalizeSteps(data.steps).length === 0)
      errors.push("At least one step with a name is required");
    return errors;
  }
}

Workflow.TYPES = TYPES;
module.exports = Workflow;
