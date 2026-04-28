const { db } = require("../config/firebase");

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
      sourceBatches: [],
      createdAt: entry.createdAt || new Date(),
      updatedAt: entry.updatedAt || new Date(),
    };

    existing.quantity = roundQty(existing.quantity + quantity);
    existing.updatedAt = entry.updatedAt || existing.updatedAt || new Date();

    const sourceBatches = Array.isArray(entry.sourceBatches)
      ? entry.sourceBatches
          .map((source) => ({
            secondaryProductId: source.secondaryProductId || source.productId,
            secondaryProductName:
              source.secondaryProductName ||
              source.productName ||
              "Secondary Product",
            batchId: source.batchId,
            batchNumber: source.batchNumber || "Unassigned",
            quantity: roundQty(source.quantity),
          }))
          .filter((source) => source.batchId && source.quantity > EPSILON)
      : [];

    existing.sourceBatches = [
      ...(existing.sourceBatches || []),
      ...sourceBatches,
    ];
    merged.set(key, existing);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aLabel = String(a.batchNumber || "");
    const bLabel = String(b.batchNumber || "");
    return aLabel.localeCompare(bLabel, undefined, { numeric: true });
  });
}

function addBatchQuantity(batchStock, batchInfo, quantity, sourceBatches = []) {
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
      sourceBatches,
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

class TertiaryProduct {
  constructor(data) {
    this.name = data.name;
    this.description = data.description || "";
    this.quantity = toNumber(data.quantity || 0);
    this.batchStock = normalizeBatchStock(data.batchStock || []);
    this.components = data.components || [];
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static collectionName = "tertiaryProducts";

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
              const componentData = component.data();
              componentDetails.push({
                id: component.id,
                ...componentData,
                quantity: toNumber(componentData.quantity || 0),
                batchStock: normalizeBatchStock(componentData.batchStock || []),
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
            const componentData = component.data();
            componentDetails.push({
              id: component.id,
              ...componentData,
              quantity: toNumber(componentData.quantity || 0),
              batchStock: normalizeBatchStock(componentData.batchStock || []),
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
      throw new Error(`Error fetching tertiary product: ${error.message}`);
    }
  }

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
      throw new Error(`Error updating tertiary product: ${error.message}`);
    }
  }

  static async increaseQuantity(
    id,
    amount,
    batchInfo = null,
    sourceBatches = [],
  ) {
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
          sourceBatches,
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

  static async addCredit(
    id,
    amount,
    isDamaged,
    batchInfo = null,
    sourceBatches = [],
  ) {
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
          batchStock = addBatchQuantity(
            batchStock,
            batchInfo,
            amt,
            sourceBatches,
          );
        }

        updateData.batchStock = batchStock;
        t.update(docRef, updateData);
      });

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error adding credit: ${error.message}`);
    }
  }

  /**
   * Record a sale: deduct soldQuantity from the selected tertiary batch only.
   */
  static async recordSale(id, amount, batchId) {
    try {
      const amt = roundQty(amount);
      if (amt <= EPSILON) throw new Error("Quantity must be greater than 0");
      if (!batchId)
        throw new Error("Please select the batch number to sell from");

      const docRef = db.collection(this.collectionName).doc(id);
      let soldBatchNumber = null;

      await db.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("Product not found");

        const data = doc.data();
        const currentQty = toNumber(data.quantity || 0);
        const currentSold = toNumber(data.soldQuantity || 0);
        const batchStock = normalizeBatchStock(data.batchStock || []);
        const nextStock = batchStock.map((entry) => ({ ...entry }));
        const entry = nextStock.find(
          (stockEntry) => stockEntry.batchId === batchId,
        );

        if (!entry) {
          throw new Error(
            "Selected batch is not available for this tertiary product",
          );
        }

        const availableInBatch = roundQty(entry.quantity);
        if (availableInBatch + EPSILON < amt) {
          throw new Error(
            `Cannot sell ${amt} units from batch ${entry.batchNumber}. Available in this batch: ${availableInBatch}`,
          );
        }

        if (currentQty + EPSILON < amt) {
          throw new Error(`Cannot sell ${amt} — only ${currentQty} available`);
        }

        entry.quantity = roundQty(availableInBatch - amt);
        entry.updatedAt = new Date();
        soldBatchNumber = entry.batchNumber;

        t.update(docRef, {
          quantity: roundQty(currentQty - amt),
          soldQuantity: roundQty(currentSold + amt),
          batchStock: normalizeBatchStock(nextStock),
          updatedAt: new Date(),
        });
      });

      return { product: await this.getById(id), soldBatchNumber };
    } catch (error) {
      throw new Error(`Error recording sale: ${error.message}`);
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
        if (currentQty + EPSILON < decreaseAmount)
          throw new Error(
            `Insufficient stock. Available: ${currentQty}, Required: ${decreaseAmount}`,
          );
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
