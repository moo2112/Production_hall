const { db } = require("../config/firebase");

class TertiaryProduct {
  constructor(data) {
    this.name = data.name;
    this.description = data.description || "";
    this.quantity = data.quantity || 0;
    this.components = data.components || [];
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "tertiaryProducts";

  static async create(data) {
    try {
      const product = new TertiaryProduct(data);
      const docRef = await db.collection(this.collectionName).add({
        ...product,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, ...product };
    } catch (error) {
      throw new Error(`Error creating tertiary product: ${error.message}`);
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
            const component = await db
              .collection("secondaryProducts")
              .doc(comp.productId)
              .get();
            if (component.exists) {
              componentDetails.push({
                id: component.id,
                ...component.data(),
                usedQuantity: comp.quantity,
              });
            }
          }
        }
        products.push({ id: doc.id, ...data, componentDetails });
      }
      return products;
    } catch (error) {
      throw new Error(`Error fetching tertiary products: ${error.message}`);
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
          const component = await db
            .collection("secondaryProducts")
            .doc(comp.productId)
            .get();
          if (component.exists) {
            componentDetails.push({
              id: component.id,
              ...component.data(),
              usedQuantity: comp.quantity,
            });
          }
        }
      }
      return { id: doc.id, ...data, componentDetails };
    } catch (error) {
      throw new Error(`Error fetching tertiary product: ${error.message}`);
    }
  }

  static async update(id, data) {
    try {
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({ ...data, updatedAt: new Date() });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating tertiary product: ${error.message}`);
    }
  }

  static async increaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      const newQuantity = (product.quantity || 0) + parseFloat(amount);
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({ quantity: newQuantity, updatedAt: new Date() });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing quantity: ${error.message}`);
    }
  }

  static async addCredit(id, amount, isDamaged) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      const currentQty = product.quantity || 0;
      const amt = parseFloat(amount);
      const currentDamaged = product.damagedQuantity || 0;
      const updateData = { updatedAt: new Date() };
      if (isDamaged && currentQty > 0 && amt < currentQty) {
        updateData.quantity = currentQty - amt;
        updateData.damagedQuantity = currentDamaged + amt;
      } else {
        updateData.quantity = currentQty + amt;
      }
      await db.collection(this.collectionName).doc(id).update(updateData);
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error adding credit: ${error.message}`);
    }
  }

  /**
   * Record a sale: deduct soldQuantity from current stock and accumulate soldQuantity.
   */
  static async recordSale(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      const currentQty = product.quantity || 0;
      const currentSold = product.soldQuantity || 0;
      const amt = parseFloat(amount);
      if (amt > currentQty)
        throw new Error(`Cannot sell ${amt} — only ${currentQty} available`);
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          quantity: currentQty - amt,
          soldQuantity: currentSold + amt,
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error recording sale: ${error.message}`);
    }
  }

  static async decreaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) throw new Error("Product not found");
      const currentQty = product.quantity || 0;
      const decreaseAmount = parseFloat(amount);
      if (currentQty < decreaseAmount)
        throw new Error(
          `Insufficient stock. Available: ${currentQty}, Required: ${decreaseAmount}`,
        );
      const newQuantity = currentQty - decreaseAmount;
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({ quantity: newQuantity, updatedAt: new Date() });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error decreasing quantity: ${error.message}`);
    }
  }

  static async checkStockAvailability(components) {
    if (!components || components.length === 0) return [];
    const checks = components
      .filter((c) => c.productId)
      .map(async (comp) => {
        const doc = await db
          .collection("secondaryProducts")
          .doc(comp.productId)
          .get();
        if (!doc.exists) return null;
        const data = doc.data();
        const available = data.quantity || 0;
        const required = parseFloat(comp.quantity) || 0;
        const label = data.name || comp.productId;
        if (available < required)
          return `Not enough "${label}": available ${available}, need ${required}`;
        return null;
      });
    const results = await Promise.all(checks);
    return results.filter(Boolean);
  }

  static async deductStock(components) {
    try {
      const SecondaryProduct = require("./secondaryProduct");
      await Promise.all(
        components.map((comp) =>
          SecondaryProduct.decreaseQuantity(comp.productId, comp.quantity),
        ),
      );
    } catch (error) {
      throw new Error(`Error deducting stock: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting tertiary product: ${error.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.name || data.name.trim() === "")
      errors.push("Product name is required");
    if (!data.components || data.components.length === 0)
      errors.push("At least one secondary product component is required");
    if (data.components && data.components.length > 0) {
      const hasInvalidQuantity = data.components.some(
        (comp) => !comp.quantity || comp.quantity <= 0,
      );
      if (hasInvalidQuantity)
        errors.push("All component quantities must be greater than 0");
    }
    return errors;
  }
}

module.exports = TertiaryProduct;
