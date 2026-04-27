const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

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
        quantity: 0,
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
      if (
        data.damagedQuantity !== undefined &&
        !isNaN(parseFloat(data.damagedQuantity))
      ) {
        updateData.damagedQuantity = parseFloat(data.damagedQuantity);
      }
      await db.collection(this.collectionName).doc(id).update(updateData);
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating primary product: ${error.message}`);
    }
  }

  static async increaseQuantity(id, amount) {
    try {
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          quantity: FieldValue.increment(parseFloat(amount)),
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing quantity: ${error.message}`);
    }
  }

  /**
   * Add a production credit — uses a Firestore transaction so the
   * read+write is atomic and costs ONE round-trip instead of three.
   */
  static async addCredit(id, amount, isDamaged) {
    try {
      const docRef = db.collection(this.collectionName).doc(id);

      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const currentQty = doc.data().quantity || 0;
        const amt = parseFloat(amount);
        const currentDamaged = doc.data().damagedQuantity || 0;

        const updateData = { updatedAt: new Date() };
        if (isDamaged && currentQty > 0 && amt < currentQty) {
          updateData.quantity = currentQty - amt;
          updateData.damagedQuantity = currentDamaged + amt;
        } else {
          updateData.quantity = currentQty + amt;
        }
        t.update(docRef, updateData);
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error adding credit: ${error.message}`);
    }
  }

  /**
   * Decrease quantity — Firestore transaction for atomic read+check+write.
   * Reduces from 3 sequential Firestore calls to 1 round-trip.
   */
  static async decreaseQuantity(id, amount) {
    try {
      const docRef = db.collection(this.collectionName).doc(id);
      const reduce = parseFloat(amount);

      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const current = doc.data().quantity || 0;
        const name = doc.data().name || id;
        if (current < reduce) {
          throw new Error(
            `Not enough "${name}": available ${current}, need ${reduce}`,
          );
        }
        t.update(docRef, {
          quantity: FieldValue.increment(-reduce),
          updatedAt: new Date(),
        });
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
