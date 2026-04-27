const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const PrimaryProduct = require("./primaryProduct");

class SecondaryProduct {
  constructor(data) {
    this.name = data.name;
    this.description = data.description || "";
    this.quantity = data.quantity || 0;
    this.components = data.components || [];
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "secondaryProducts";

  static async create(data) {
    try {
      const product = new SecondaryProduct(data);
      const docRef = await db.collection(this.collectionName).add({
        ...product,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, ...product };
    } catch (error) {
      throw new Error(`Error creating secondary product: ${error.message}`);
    }
  }

  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy("createdAt", "desc")
        .get();

      const products = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();

        const componentDetails = [];
        if (data.components && data.components.length > 0) {
          for (const comp of data.components) {
            const component = await PrimaryProduct.getById(comp.productId);
            if (component) {
              componentDetails.push({
                ...component,
                usedQuantity: comp.quantity,
              });
            }
          }
        }

        products.push({ id: doc.id, ...data, componentDetails });
      }
      return products;
    } catch (error) {
      throw new Error(`Error fetching secondary products: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;

      const data = doc.data();

      const componentDetails = [];
      if (data.components && data.components.length > 0) {
        for (const comp of data.components) {
          const component = await PrimaryProduct.getById(comp.productId);
          if (component) {
            componentDetails.push({
              ...component,
              usedQuantity: comp.quantity,
            });
          }
        }
      }

      return { id: doc.id, ...data, componentDetails };
    } catch (error) {
      throw new Error(`Error fetching secondary product: ${error.message}`);
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
      throw new Error(`Error updating secondary product: ${error.message}`);
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
   * ONE round-trip instead of three.
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

  /**
   * Check stock availability — reads ALL primary components in PARALLEL
   * (one Promise.all instead of sequential awaits).
   */
  static async checkStockAvailability(components) {
    const errors = [];
    if (!components || components.length === 0) return errors;

    // Fetch all primary products in parallel — ONE round-trip instead of N
    const docs = await Promise.all(
      components
        .filter((c) => c.productId)
        .map((c) => db.collection("primaryProducts").doc(c.productId).get()),
    );

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const comp = components.filter((c) => c.productId)[i];
      if (!doc.exists) continue;
      const available = doc.data().quantity || 0;
      const required = parseFloat(comp.quantity) || 0;
      const label = doc.data().name || comp.productId;
      if (available < required) {
        errors.push(
          `Not enough "${label}": available ${available}, need ${required}`,
        );
      }
    }
    return errors;
  }

  /**
   * Deduct stock from primary products — reads ALL in parallel, then
   * commits ALL writes in a single Firestore batch.
   * Was: 3N sequential operations. Now: N parallel reads + 1 batch write.
   */
  static async deductStock(components) {
    try {
      if (!components || components.length === 0) return;

      // Read all primary docs in parallel
      const refs = components.map((c) =>
        db.collection("primaryProducts").doc(c.productId),
      );
      const docs = await Promise.all(refs.map((r) => r.get()));

      // Validate stock before writing anything
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (!doc.exists) {
          throw new Error(
            `Primary product ${components[i].productId} not found`,
          );
        }
        const available = doc.data().quantity || 0;
        const needed = parseFloat(components[i].quantity);
        if (available < needed) {
          throw new Error(
            `Not enough "${doc.data().name}": available ${available}, need ${needed}`,
          );
        }
      }

      // Commit all deductions in a single batch — 1 write round-trip
      const batch = db.batch();
      for (let i = 0; i < components.length; i++) {
        batch.update(refs[i], {
          quantity: FieldValue.increment(-parseFloat(components[i].quantity)),
          updatedAt: new Date(),
        });
      }
      await batch.commit();
    } catch (error) {
      throw new Error(`Error deducting stock: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      const tertiarySnapshot = await db.collection("tertiaryProducts").get();

      for (const doc of tertiarySnapshot.docs) {
        const data = doc.data();
        if (data.components && data.components.length > 0) {
          const isUsed = data.components.some((comp) => comp.productId === id);
          if (isUsed) {
            throw new Error(
              "Cannot delete secondary product that is used in tertiary products",
            );
          }
        }
      }

      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting secondary product: ${error.message}`);
    }
  }

  static validate(data) {
    const errors = [];

    if (!data.name || data.name.trim() === "") {
      errors.push("Product name is required");
    }

    if (!data.components || data.components.length === 0) {
      errors.push("At least one primary product component is required");
    }

    if (data.components && data.components.length > 0) {
      const hasInvalidQuantity = data.components.some(
        (comp) => !comp.quantity || comp.quantity <= 0,
      );
      if (hasInvalidQuantity) {
        errors.push("All component quantities must be greater than 0");
      }
    }

    return errors;
  }
}

module.exports = SecondaryProduct;
