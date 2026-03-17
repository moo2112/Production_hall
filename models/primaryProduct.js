const { db } = require("../config/firebase");

/**
 * PrimaryProduct model
 * Consumables are completely separate and NOT involved in production credit.
 */
class PrimaryProduct {
  static collectionName = "primaryProducts";

  static async create(data) {
    try {
      const docRef = await db.collection(this.collectionName).add({
        name: data.name,
        description: data.description || "",
        quantity: 0, // always starts at 0 — credit adds to it
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, ...data };
    } catch (error) {
      throw new Error(`Error creating primary product: ${error.message}`);
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
      throw new Error(`Error fetching primary products: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error fetching primary product: ${error.message}`);
    }
  }

  static async update(id, data) {
    try {
      const updateData = {
        name: data.name,
        description: data.description || "",
        updatedAt: new Date(),
      };
      if (data.quantity !== undefined && !isNaN(parseFloat(data.quantity))) {
        updateData.quantity = parseFloat(data.quantity);
      }
      await db.collection(this.collectionName).doc(id).update(updateData);
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating primary product: ${error.message}`);
    }
  }

  static async increaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          quantity: (product.quantity || 0) + parseFloat(amount),
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing quantity: ${error.message}`);
    }
  }

  static async decreaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      const current = product.quantity || 0;
      const reduce = parseFloat(amount);
      if (current < reduce) {
        throw new Error(
          `Not enough "${product.name}": available ${current}, need ${reduce}`,
        );
      }
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          quantity: current - reduce,
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error decreasing quantity: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      const snapshot = await db.collection("secondaryProducts").get();
      for (const doc of snapshot.docs) {
        const d = doc.data();
        if (d.components && d.components.some((c) => c.productId === id)) {
          throw new Error(
            "Cannot delete: this product is used in one or more secondary products",
          );
        }
      }
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting primary product: ${error.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.name || data.name.trim() === "")
      errors.push("Product name is required");
    return errors;
  }
}

module.exports = PrimaryProduct;
