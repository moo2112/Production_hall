const { db } = require("../config/firebase");

/**
 * Client model
 * ─────────────────────────────────────────────────────────────────────────────
 * Saved customer records so invoices can reuse a client instead of re-typing
 * their details every time.
 *
 * Document shape (collection `clients`):
 *   { name, phone, email, address, note, createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */
class Client {
  static collectionName = "clients";

  static async create(data) {
    try {
      const payload = {
        name: String(data.name || "").trim(),
        phone: String(data.phone || "").trim(),
        email: String(data.email || "").trim(),
        address: String(data.address || "").trim(),
        note: String(data.note || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (!payload.name) throw new Error("Client name is required");
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating client: ${e.message}`);
    }
  }

  /** Create a client only if one with the same name doesn't already exist. */
  static async upsertByName(data) {
    const name = String(data.name || "").trim();
    if (!name) return null;
    const all = await this.getAll();
    const existing = all.find(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    return this.create(data);
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch (e) {
      throw new Error(`Error fetching clients: ${e.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (e) {
      throw new Error(`Error fetching client: ${e.message}`);
    }
  }

  static async update(id, data) {
    try {
      const patch = { updatedAt: new Date() };
      ["name", "phone", "email", "address", "note"].forEach((k) => {
        if (data[k] !== undefined) patch[k] = String(data[k]).trim();
      });
      await db.collection(this.collectionName).doc(id).update(patch);
      return await this.getById(id);
    } catch (e) {
      throw new Error(`Error updating client: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting client: ${e.message}`);
    }
  }
}

module.exports = Client;
