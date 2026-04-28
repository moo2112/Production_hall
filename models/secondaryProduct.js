const { db } = require("../config/firebase");
const PrimaryProduct = require("./primaryProduct");

const EPSILON = 0.000001;

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 1000000) / 1000000;
}

function normalizeBatchStock(batchStock = []) {
  if (!Array.isArray(batchStock)) return [];

  const merged = new Map();
  batchStock.forEach((entry) => {
    const quantity = roundQty(entry.quantity || entry.availableUnits || 0);
    if (quantity <= EPSILON) return;

    const batchId = entry.batchId || "__manual__";
    const batchNumber = entry.batchNumber || "Manual / Unassigned";
    const key = `${batchId}::${batchNumber}`;
    const existing = merged.get(key) || {
      batchId,
      batchNumber,
      quantity: 0,
      createdAt: entry.createdAt || new Date(),
      updatedAt: entry.updatedAt || new Date(),
    };

    existing.quantity = roundQty(existing.quantity + quantity);
    existing.updatedAt = entry.updatedAt || existing.updatedAt || new Date();
    merged.set(key, existing);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aLabel = String(a.batchNumber || "");
    const bLabel = String(b.batchNumber || "");
    return aLabel.localeCompare(bLabel, undefined, { numeric: true });
  });
}

function addBatchQuantity(batchStock, batchInfo, quantity) {
  const qty = roundQty(quantity);
  if (qty <= EPSILON) return normalizeBatchStock(batchStock);

  const safeBatch = batchInfo || {};
  return normalizeBatchStock([
    ...normalizeBatchStock(batchStock),
    {
      batchId: safeBatch.id || safeBatch.batchId || "__manual__",
      batchNumber:
        safeBatch.batchNumber || safeBatch.number || "Manual / Unassigned",
      quantity: qty,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

function deductQuantityFromBatchStock(batchStock, quantity) {
  let remaining = roundQty(quantity);
  const nextStock = [];
  const deducted = [];

  normalizeBatchStock(batchStock).forEach((entry) => {
    if (remaining <= EPSILON) {
      nextStock.push(entry);
      return;
    }

    const available = roundQty(entry.quantity);
    const take = Math.min(available, remaining);
    if (take > EPSILON) {
      deducted.push({
        batchId: entry.batchId,
        batchNumber: entry.batchNumber,
        quantity: roundQty(take),
      });
    }

    const left = roundQty(available - take);
    if (left > EPSILON) nextStock.push({ ...entry, quantity: left });
    remaining = roundQty(remaining - take);
  });

  return {
    batchStock: normalizeBatchStock(nextStock),
    deducted,
    untracked: remaining,
  };
}

function alignBatchStockToQuantity(batchStock, quantity) {
  const desiredQty = Math.max(0, roundQty(quantity));
  let stock = normalizeBatchStock(batchStock);
  const currentTotal = roundQty(
    stock.reduce((sum, b) => sum + toNumber(b.quantity), 0),
  );

  if (currentTotal > desiredQty + EPSILON) {
    return deductQuantityFromBatchStock(
      stock,
      roundQty(currentTotal - desiredQty),
    ).batchStock;
  }

  if (desiredQty > currentTotal + EPSILON) {
    stock = addBatchQuantity(
      stock,
      {
        id: "__manual__",
        batchNumber: "Manual / Unassigned",
      },
      roundQty(desiredQty - currentTotal),
    );
  }

  return normalizeBatchStock(stock);
}

class SecondaryProduct {
  constructor(data) {
    this.name = data.name;
    this.description = data.description || "";
    this.quantity = toNumber(data.quantity || 0);
    this.batchStock = normalizeBatchStock(data.batchStock || []);
    this.components = data.components || []; // Array of { productId, quantity }
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "secondaryProducts";

  static normalizeBatchStock(batchStock) {
    return normalizeBatchStock(batchStock);
  }

  static getBatchTotal(batchStock) {
    return roundQty(
      normalizeBatchStock(batchStock).reduce(
        (sum, entry) => sum + toNumber(entry.quantity),
        0,
      ),
    );
  }

  // Create a new secondary product
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

  // Get all secondary products with component details
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
            const component = await PrimaryProduct.getById(comp.productId);
            if (component) {
              componentDetails.push({
                ...component,
                usedQuantity: comp.quantity,
              });
            }
          }
        }

        const batchStock = normalizeBatchStock(data.batchStock || []);
        products.push({
          id: doc.id,
          ...data,
          quantity: toNumber(data.quantity || 0),
          batchStock,
          batchStockTotal: this.getBatchTotal(batchStock),
          componentDetails,
        });
      }
      return products;
    } catch (error) {
      throw new Error(`Error fetching secondary products: ${error.message}`);
    }
  }

  // Get secondary product by ID with component details
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
          const component = await PrimaryProduct.getById(comp.productId);
          if (component) {
            componentDetails.push({
              ...component,
              usedQuantity: comp.quantity,
            });
          }
        }
      }

      const batchStock = normalizeBatchStock(data.batchStock || []);
      return {
        id: doc.id,
        ...data,
        quantity: toNumber(data.quantity || 0),
        batchStock,
        batchStockTotal: this.getBatchTotal(batchStock),
        componentDetails,
      };
    } catch (error) {
      throw new Error(`Error fetching secondary product: ${error.message}`);
    }
  }

  // Update secondary product
  static async update(id, data) {
    try {
      const current = await this.getById(id);
      if (!current) throw new Error("Product not found");

      const updateData = {
        ...data,
        updatedAt: new Date(),
      };

      if (data.quantity !== undefined && data.batchStock === undefined) {
        updateData.quantity = Math.max(0, toNumber(data.quantity));
        updateData.batchStock = alignBatchStockToQuantity(
          current.batchStock || [],
          updateData.quantity,
        );
      } else if (data.batchStock !== undefined) {
        updateData.batchStock = normalizeBatchStock(data.batchStock);
      }

      await db.collection(this.collectionName).doc(id).update(updateData);
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating secondary product: ${error.message}`);
    }
  }

  // Increase quantity (production)
  static async increaseQuantity(id, amount, batchInfo = null) {
    try {
      const amt = roundQty(amount);
      if (amt <= EPSILON) throw new Error("Quantity must be greater than 0");

      const docRef = db.collection(this.collectionName).doc(id);
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const data = doc.data();
        const newQuantity = roundQty(toNumber(data.quantity || 0) + amt);
        const batchStock = addBatchQuantity(
          data.batchStock || [],
          batchInfo,
          amt,
        );

        t.update(docRef, {
          quantity: newQuantity,
          batchStock,
          updatedAt: new Date(),
        });
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error increasing quantity: ${error.message}`);
    }
  }

  /**
   * Add a production credit.
   * - Finished: increases stock and records the units under the selected batch.
   * - Damaged: preserves the previous damaged workflow, while keeping batchStock
   *   in sync when stock is reduced.
   */
  static async addCredit(id, amount, isDamaged, batchInfo = null) {
    try {
      const amt = roundQty(amount);
      if (amt <= EPSILON) throw new Error("Quantity must be greater than 0");

      const docRef = db.collection(this.collectionName).doc(id);
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const data = doc.data();
        const currentQty = toNumber(data.quantity || 0);
        const currentDamaged = toNumber(data.damagedQuantity || 0);
        const updateData = { updatedAt: new Date() };
        let batchStock = normalizeBatchStock(data.batchStock || []);

        if (isDamaged && currentQty > 0 && amt < currentQty) {
          updateData.quantity = roundQty(currentQty - amt);
          updateData.damagedQuantity = roundQty(currentDamaged + amt);
          batchStock = deductQuantityFromBatchStock(batchStock, amt).batchStock;
        } else {
          updateData.quantity = roundQty(currentQty + amt);
          batchStock = addBatchQuantity(batchStock, batchInfo, amt);
        }

        updateData.batchStock = batchStock;
        t.update(docRef, updateData);
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error adding credit: ${error.message}`);
    }
  }

  static async decreaseQuantity(id, amount) {
    try {
      const decreaseAmount = roundQty(amount);
      if (decreaseAmount <= EPSILON)
        throw new Error("Quantity must be greater than 0");

      const docRef = db.collection(this.collectionName).doc(id);
      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const data = doc.data();
        const currentQty = toNumber(data.quantity || 0);
        const name = data.name || id;

        if (currentQty + EPSILON < decreaseAmount) {
          throw new Error(
            `Insufficient stock for "${name}". Available: ${currentQty}, Required: ${decreaseAmount}`,
          );
        }

        const { batchStock } = deductQuantityFromBatchStock(
          data.batchStock || [],
          decreaseAmount,
        );

        t.update(docRef, {
          quantity: roundQty(currentQty - decreaseAmount),
          batchStock,
          updatedAt: new Date(),
        });
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error decreasing quantity: ${error.message}`);
    }
  }

  static async deductFromBatches(id, batchSelections = []) {
    try {
      const selections = (Array.isArray(batchSelections) ? batchSelections : [])
        .map((selection) => ({
          batchId: selection.batchId,
          batchNumber: selection.batchNumber,
          quantity: roundQty(selection.quantity),
        }))
        .filter(
          (selection) => selection.batchId && selection.quantity > EPSILON,
        );

      if (selections.length === 0) {
        throw new Error("Please select at least one batch to deduct from");
      }

      const totalToDeduct = roundQty(
        selections.reduce((sum, selection) => sum + selection.quantity, 0),
      );

      const docRef = db.collection(this.collectionName).doc(id);
      let deducted = [];

      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const data = doc.data();
        const name = data.name || id;
        const currentQty = toNumber(data.quantity || 0);
        if (currentQty + EPSILON < totalToDeduct) {
          throw new Error(
            `Insufficient stock for "${name}". Available: ${currentQty}, Required: ${totalToDeduct}`,
          );
        }

        const batchStock = normalizeBatchStock(data.batchStock || []);
        const nextStock = batchStock.map((entry) => ({ ...entry }));
        deducted = [];

        selections.forEach((selection) => {
          const entry = nextStock.find((stockEntry) => {
            if (stockEntry.batchId === selection.batchId) return true;
            return (
              selection.batchId === "__manual__" &&
              stockEntry.batchNumber === selection.batchNumber
            );
          });

          if (!entry) {
            throw new Error(
              `Batch ${selection.batchNumber || selection.batchId} is not available for "${name}"`,
            );
          }

          const available = roundQty(entry.quantity);
          if (available + EPSILON < selection.quantity) {
            throw new Error(
              `Cannot use ${selection.quantity} units from batch ${entry.batchNumber}. Available: ${available}`,
            );
          }

          entry.quantity = roundQty(available - selection.quantity);
          entry.updatedAt = new Date();
          deducted.push({
            productId: id,
            productName: name,
            batchId: entry.batchId,
            batchNumber: entry.batchNumber,
            quantity: selection.quantity,
          });
        });

        t.update(docRef, {
          quantity: roundQty(currentQty - totalToDeduct),
          batchStock: normalizeBatchStock(nextStock),
          updatedAt: new Date(),
        });
      });

      return deducted;
    } catch (error) {
      throw new Error(
        `Error deducting selected secondary batches: ${error.message}`,
      );
    }
  }

  // Check stock availability for components
  static async checkStockAvailability(components) {
    if (!components || components.length === 0) return [];

    const checks = components
      .filter((c) => c.productId)
      .map(async (comp) => {
        const primary = await PrimaryProduct.getById(comp.productId);
        if (!primary) return null;
        const available = primary.quantity || 0;
        const required = parseFloat(comp.quantity) || 0;
        const label = primary.name || comp.productId;
        if (available < required) {
          return `Not enough "${label}": available ${available}, need ${required}`;
        }
        return null;
      });

    const results = await Promise.all(checks);
    return results.filter(Boolean);
  }

  // Deduct stock from primary products
  static async deductStock(components) {
    try {
      await Promise.all(
        components.map((comp) =>
          PrimaryProduct.decreaseQuantity(comp.productId, comp.quantity),
        ),
      );
    } catch (error) {
      throw new Error(`Error deducting stock: ${error.message}`);
    }
  }

  // Delete secondary product
  static async delete(id) {
    try {
      // Check if this secondary product is used in any tertiary products
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

  // Validate secondary product data
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
