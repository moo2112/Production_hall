const { db } = require("../config/firebase");

class Consumable {
  constructor(data) {
    this.name = data.name;
    this.quantity = data.quantity || 0;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "consumables";

  static async create(data) {
    try {
      const docRef = await db.collection(this.collectionName).add({
        name: data.name,
        quantity: data.quantity || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, name: data.name, quantity: data.quantity || 0 };
    } catch (error) {
      throw new Error(`Error creating consumable: ${error.message}`);
    }
  }

  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy("createdAt", "desc")
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Error fetching consumables: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error fetching consumable: ${error.message}`);
    }
  }

  static async update(id, data) {
    try {
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          ...data,
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating consumable: ${error.message}`);
    }
  }

  // ── Increase quantity ────────────────────────────────────────────────────────
  static async increaseQuantity(id, amount) {
    try {
      const item = await this.getById(id);
      if (!item) throw new Error("Consumable not found");
      const newQty = (item.quantity || 0) + parseFloat(amount);
      await db.collection(this.collectionName).doc(id).update({
        quantity: newQty,
        updatedAt: new Date(),
      });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing consumable quantity: ${error.message}`);
    }
  }

  // ── Decrease quantity (used when producing primary products) ─────────────────
  static async decreaseQuantity(id, amount) {
    try {
      const item = await this.getById(id);
      if (!item) throw new Error(`Consumable with id "${id}" not found`);

      const currentQty = item.quantity || 0;
      const decreaseAmt = parseFloat(amount);

      if (currentQty < decreaseAmt) {
        throw new Error(
          `Insufficient stock for "${item.name || id}". ` +
            `Available: ${currentQty}, Required: ${decreaseAmt}`,
        );
      }

      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          quantity: currentQty - decreaseAmt,
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error decreasing consumable quantity: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting consumable: ${error.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.name || data.name.trim() === "")
      errors.push("Consumable name is required");
    if (data.quantity === undefined || data.quantity === null)
      errors.push("Quantity is required");
    if (
      data.quantity !== undefined &&
      (isNaN(data.quantity) || data.quantity < 0)
    )
      errors.push("Quantity must be a positive number");
    return errors;
  }
}

module.exports = Consumable;
