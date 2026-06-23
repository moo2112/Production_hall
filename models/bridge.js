const { db } = require("../config/firebase");

/**
 * Bridge model
 * ─────────────────────────────────────────────────────────────────────────────
 * A "bridge" maps a single alias name (what the customer/user writes) to one or
 * more real tertiary products. Example: "blood culture" → [ isolation blood ×1,
 * strips ×1 ]. When a bridge is chosen on an invoice, it is fulfilled by selling
 * each underlying tertiary product.
 *
 * Document shape (collection `bridges`):
 *   { name, items: [{ productId, productName, quantity }], note,
 *     createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

function num(v, f = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      productId: it.productId || null,
      productName: String(it.productName || "").trim(),
      quantity: Math.max(0, num(it.quantity, 0)),
    }))
    .filter((it) => it.productId && it.quantity > 0);
}

class Bridge {
  static collectionName = "bridges";

  static async create(data) {
    try {
      const items = normalizeItems(data.items);
      const payload = {
        name: String(data.name || "").trim(),
        items,
        note: String(data.note || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (!payload.name) throw new Error("Bridge name is required");
      if (!items.length)
        throw new Error("A bridge needs at least one tertiary product");
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating bridge: ${e.message}`);
    }
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch (e) {
      throw new Error(`Error fetching bridges: ${e.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (e) {
      throw new Error(`Error fetching bridge: ${e.message}`);
    }
  }

  static async update(id, data) {
    try {
      const patch = { updatedAt: new Date() };
      if (data.name !== undefined) patch.name = String(data.name).trim();
      if (data.note !== undefined) patch.note = String(data.note).trim();
      if (data.items !== undefined) patch.items = normalizeItems(data.items);
      await db.collection(this.collectionName).doc(id).update(patch);
      return await this.getById(id);
    } catch (e) {
      throw new Error(`Error updating bridge: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting bridge: ${e.message}`);
    }
  }
}

module.exports = Bridge;
