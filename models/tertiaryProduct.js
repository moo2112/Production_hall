const { db } = require("../config/firebase");

class TertiaryProduct {
  constructor(data) {
    this.name = data.name;
    this.description = data.description || "";
    this.quantity = data.quantity || 0;
    this.components = data.components || []; // Array of { productId, quantity }
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "tertiaryProducts";

  // Create a new tertiary product
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

  // Get all tertiary products with component details
  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy("createdAt", "desc")
        .get();

      const products = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Fetch component details with quantities
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

        products.push({
          id: doc.id,
          ...data,
          componentDetails,
        });
      }
      return products;
    } catch (error) {
      throw new Error(`Error fetching tertiary products: ${error.message}`);
    }
  }

  // Get tertiary product by ID with component details
  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) {
        return null;
      }

      const data = doc.data();

      // Fetch component details with quantities
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

      return {
        id: doc.id,
        ...data,
        componentDetails,
      };
    } catch (error) {
      throw new Error(`Error fetching tertiary product: ${error.message}`);
    }
  }

  // Update tertiary product
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
      throw new Error(`Error updating tertiary product: ${error.message}`);
    }
  }

  // Increase quantity (production)
  static async increaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) {
        throw new Error("Product not found");
      }

      const newQuantity = (product.quantity || 0) + parseFloat(amount);
      await db.collection(this.collectionName).doc(id).update({
        quantity: newQuantity,
        updatedAt: new Date(),
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing quantity: ${error.message}`);
    }
  }

  /**
   * Add a production credit.
   * - Finished: increases quantity normally.
   * - Damaged when amount < currentStock: subtracts from quantity and tracks
   *   the damaged portion in `damagedQuantity` so the view can display "100 -10".
   */
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

  // Decrease quantity (consumption)
  static async decreaseQuantity(id, amount) {
    try {
      const product = await this.getById(id);
      if (!product) {
        throw new Error("Product not found");
      }

      const currentQty = product.quantity || 0;
      const decreaseAmount = parseFloat(amount);

      if (currentQty < decreaseAmount) {
        throw new Error(
          `Insufficient stock. Available: ${currentQty}, Required: ${decreaseAmount}`,
        );
      }

      const newQuantity = currentQty - decreaseAmount;
      await db.collection(this.collectionName).doc(id).update({
        quantity: newQuantity,
        updatedAt: new Date(),
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error decreasing quantity: ${error.message}`);
    }
  }

  // Check stock availability for components
  static async checkStockAvailability(components) {
    const errors = [];
    if (!components || components.length === 0) return errors;

    for (const comp of components) {
      if (!comp.productId) continue;
      const doc = await db
        .collection("secondaryProducts")
        .doc(comp.productId)
        .get();
      if (!doc.exists) continue;
      const data = doc.data();
      const available = data.quantity || 0;
      const required = parseFloat(comp.quantity) || 0;
      const label = data.name || comp.productId;
      if (available < required) {
        errors.push(
          `Not enough "${label}": available ${available}, need ${required}`,
        );
      }
    }
    return errors;
  }

  // Deduct stock from secondary products
  static async deductStock(components) {
    try {
      const SecondaryProduct = require("./secondaryProduct");
      for (const comp of components) {
        await SecondaryProduct.decreaseQuantity(comp.productId, comp.quantity);
      }
    } catch (error) {
      throw new Error(`Error deducting stock: ${error.message}`);
    }
  }

  // Delete tertiary product
  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting tertiary product: ${error.message}`);
    }
  }

  // Validate tertiary product data
  static validate(data) {
    const errors = [];

    if (!data.name || data.name.trim() === "") {
      errors.push("Product name is required");
    }

    if (!data.components || data.components.length === 0) {
      errors.push("At least one secondary product component is required");
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

module.exports = TertiaryProduct;
