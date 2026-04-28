const express = require("express");
const router = express.Router();
const TertiaryProduct = require("../models/tertiaryProduct");
const SecondaryProduct = require("../models/secondaryProduct");
const Batch = require("../models/batch");
const ActivityLog = require("../models/activityLog");

const EPSILON = 0.000001;

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 1000000) / 1000000;
}

function normalizeAllocationGroups(rawAllocations) {
  return (Array.isArray(rawAllocations) ? rawAllocations : [])
    .map((group) => ({
      productId: group.productId,
      productName: group.productName,
      batches: (Array.isArray(group.batches) ? group.batches : [])
        .map((batch) => ({
          batchId: batch.batchId,
          batchNumber: batch.batchNumber,
          quantity: roundQty(batch.quantity),
        }))
        .filter((batch) => batch.batchId && batch.quantity > EPSILON),
    }))
    .filter((group) => group.productId && group.batches.length > 0);
}

async function validateComponentBatchSelections(
  activeComponents,
  rawAllocations,
  requiredTotal,
) {
  const allocations = normalizeAllocationGroups(rawAllocations);
  const sourceBatches = [];
  const allowedComponents = new Map(
    (Array.isArray(activeComponents) ? activeComponents : []).map(
      (component) => [component.productId, component],
    ),
  );

  if (allowedComponents.size === 0) {
    throw new Error(
      "This tertiary product has no selectable secondary products",
    );
  }

  if (allocations.length === 0) {
    throw new Error(
      `Please select secondary product batches. The total selected units must equal ${requiredTotal}`,
    );
  }

  let selectedGrandTotal = 0;

  for (const allocation of allocations) {
    const component = allowedComponents.get(allocation.productId);
    if (!component) {
      throw new Error(
        `Selected secondary product ${allocation.productName || allocation.productId} is not related to this tertiary product`,
      );
    }

    const secondaryProduct = await SecondaryProduct.getById(
      allocation.productId,
    );
    if (!secondaryProduct) {
      throw new Error(
        `Secondary product not found for ${component.name || allocation.productName || allocation.productId}`,
      );
    }

    allocation.batches.forEach((batch) => {
      const batchStock = (secondaryProduct.batchStock || []).find(
        (entry) => entry.batchId === batch.batchId,
      );
      const available = batchStock ? roundQty(batchStock.quantity) : 0;

      if (!batchStock || available + EPSILON < batch.quantity) {
        throw new Error(
          `Cannot use ${batch.quantity} units from ${secondaryProduct.name} batch ${batch.batchNumber}. Available: ${available}`,
        );
      }

      selectedGrandTotal = roundQty(selectedGrandTotal + batch.quantity);
    });

    sourceBatches.push({
      productId: allocation.productId,
      productName: secondaryProduct.name,
      batches: allocation.batches,
    });
  }

  const targetTotal = roundQty(requiredTotal);
  if (Math.abs(selectedGrandTotal - targetTotal) > EPSILON) {
    throw new Error(
      `The sum of all selected secondary product units must equal the tertiary credit quantity. Credit: ${targetTotal}, selected: ${selectedGrandTotal}`,
    );
  }

  return sourceBatches;
}

// ── GET /tertiary ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [products, secondaryProducts, batches] = await Promise.all([
      TertiaryProduct.getAll(),
      SecondaryProduct.getAll(),
      Batch.getAll(),
    ]);
    res.render("tertiary", {
      title: "Tertiary Products",
      products,
      secondaryProducts,
      batches,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("tertiary", {
      title: "Tertiary Products",
      products: [],
      secondaryProducts: [],
      batches: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /tertiary — ENCODE only (no stock deduction) ────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, description, componentsJson } = req.body;
    const components = parseJson(componentsJson, []);

    const errors = TertiaryProduct.validate({ name, description, components });
    if (errors.length > 0) {
      const [products, secondaryProducts, batches] = await Promise.all([
        TertiaryProduct.getAll(),
        SecondaryProduct.getAll(),
        Batch.getAll(),
      ]);
      return res.render("tertiary", {
        title: "Tertiary Products",
        products,
        secondaryProducts,
        batches,
        error: errors.join(", "),
        success: null,
      });
    }

    await TertiaryProduct.create({
      name: name.trim(),
      description: description || "",
      quantity: 0,
      batchStock: [],
      components,
    });

    await ActivityLog.log({
      action: "Tertiary Product Encoded",
      itemName: name,
      itemType: "Tertiary",
      notes: `Recipe: ${components.length} secondary component(s)`,
    });

    res.redirect("/tertiary?success=Tertiary product encoded successfully");
  } catch (error) {
    const [products, secondaryProducts, batches] = await Promise.all([
      TertiaryProduct.getAll(),
      SecondaryProduct.getAll(),
      Batch.getAll(),
    ]);
    res.render("tertiary", {
      title: "Tertiary Products",
      products,
      secondaryProducts,
      batches,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /tertiary/:id/produce — ADD CREDIT (deducts selected secondary batches)
router.post("/:id/produce", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      batchId,
      batchItemName,
      productionStatus,
      removedComponentsJson,
      componentBatchSelectionsJson,
    } = req.body;

    if (!amount || parseFloat(amount) <= 0)
      throw new Error("Please enter a valid production quantity");
    if (!batchId)
      throw new Error("Batch Number is required when adding production credit");
    if (!["Finished", "Damaged"].includes(productionStatus))
      throw new Error("Production status is required (Finished or Damaged)");

    const [product, batch] = await Promise.all([
      TertiaryProduct.getById(id),
      Batch.getById(batchId),
    ]);
    if (!product) throw new Error("Product not found");
    if (!batch) throw new Error("Selected batch was not found");

    const productionAmount = parseFloat(amount);
    let componentsToDeduct = product.components || [];

    if (productionStatus === "Damaged" && removedComponentsJson) {
      const removed = parseJson(removedComponentsJson, []);
      componentsToDeduct = componentsToDeduct.filter(
        (c) => !removed.includes(c.productId),
      );
    }

    const selectableComponents = componentsToDeduct.map((component) => {
      const details = (product.componentDetails || []).find(
        (detail) => detail.id === component.productId,
      );
      return {
        ...component,
        name: details ? details.name : component.productId,
      };
    });

    const componentBatchSelections = parseJson(
      componentBatchSelectionsJson,
      [],
    );
    let sourceBatches = [];

    if (selectableComponents.length > 0) {
      const selectedGroups = await validateComponentBatchSelections(
        selectableComponents,
        componentBatchSelections,
        roundQty(productionAmount),
      );

      for (const group of selectedGroups) {
        const deducted = await SecondaryProduct.deductFromBatches(
          group.productId,
          group.batches,
        );
        deducted.forEach((entry) => {
          sourceBatches.push({
            secondaryProductId: group.productId,
            secondaryProductName: group.productName,
            batchId: entry.batchId,
            batchNumber: entry.batchNumber,
            quantity: entry.quantity,
          });
        });
      }
    }

    await TertiaryProduct.addCredit(
      id,
      productionAmount,
      productionStatus === "Damaged",
      batch,
      sourceBatches,
    );

    await ActivityLog.log({
      action: `Tertiary Product Credit Added (${productionStatus})`,
      itemName: batchItemName || product.name,
      itemType: "Tertiary",
      batchNumber: batch.batchNumber,
      quantity: productionAmount,
      status: productionStatus,
      notes:
        sourceBatches.length > 0
          ? `Used ${sourceBatches.length} secondary batch allocation(s)`
          : null,
    });

    res.redirect("/tertiary?success=Production credit added successfully");
  } catch (error) {
    let products = [],
      secondaryProducts = [],
      batches = [];
    try {
      [products, secondaryProducts, batches] = await Promise.all([
        TertiaryProduct.getAll(),
        SecondaryProduct.getAll(),
        Batch.getAll(),
      ]);
    } catch (_) {}
    res.render("tertiary", {
      title: "Tertiary Products",
      products,
      secondaryProducts,
      batches,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /tertiary/:id/sell — RECORD SOLD QUANTITY FROM SELECTED BATCH ───────
router.post("/:id/sell", async (req, res) => {
  try {
    const { id } = req.params;
    const { soldQuantity, batchId } = req.body;
    const qty = parseFloat(soldQuantity);

    if (!soldQuantity || isNaN(qty) || qty <= 0)
      throw new Error("Please enter a valid sold quantity");
    if (!batchId)
      throw new Error("Please select the tertiary batch to sell from");

    const product = await TertiaryProduct.getById(id);
    if (!product) throw new Error("Product not found");
    if (qty > (product.quantity || 0))
      throw new Error(
        `Cannot sell ${qty} units — only ${product.quantity || 0} units available in stock`,
      );

    const { soldBatchNumber } = await TertiaryProduct.recordSale(
      id,
      qty,
      batchId,
    );

    await ActivityLog.log({
      action: "Tertiary Product Sold",
      itemName: product.name,
      itemType: "Tertiary",
      batchNumber: soldBatchNumber,
      quantity: qty,
      status: "Sold",
    });

    res.redirect("/tertiary?success=Sold quantity recorded successfully");
  } catch (error) {
    let products = [],
      secondaryProducts = [],
      batches = [];
    try {
      [products, secondaryProducts, batches] = await Promise.all([
        TertiaryProduct.getAll(),
        SecondaryProduct.getAll(),
        Batch.getAll(),
      ]);
    } catch (_) {}
    res.render("tertiary", {
      title: "Tertiary Products",
      products,
      secondaryProducts,
      batches,
      error: error.message,
      success: null,
    });
  }
});

// ── PUT /tertiary/:id ─────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, quantity, damages, componentsJson } = req.body;
    const components = parseJson(componentsJson, []);

    const errors = TertiaryProduct.validate({ name, description, components });
    if (errors.length > 0)
      return res.status(400).json({ error: errors.join(", ") });

    const damagesAmt = parseFloat(damages) || 0;
    const product = await TertiaryProduct.getById(id);
    const currentDamaged = product ? product.damagedQuantity || 0 : 0;
    let newQuantity =
      quantity !== undefined
        ? parseFloat(quantity)
        : product
          ? product.quantity || 0
          : 0;

    if (damagesAmt > 0) {
      newQuantity = Math.max(0, newQuantity - damagesAmt);
      await TertiaryProduct.update(id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        damagedQuantity: currentDamaged + damagesAmt,
        components,
      });
    } else {
      await TertiaryProduct.update(id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        components,
      });
    }

    await ActivityLog.log({
      action:
        "Tertiary Product Updated" +
        (damagesAmt > 0 ? ` (−${damagesAmt} damaged)` : ""),
      itemName: name,
      itemType: "Tertiary",
    });
    res.redirect("/tertiary?success=Tertiary product updated successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /tertiary/:id ──────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const product = await TertiaryProduct.getById(req.params.id);
    await TertiaryProduct.delete(req.params.id);
    if (product)
      await ActivityLog.log({
        action: "Tertiary Product Deleted",
        itemName: product.name,
        itemType: "Tertiary",
      });
    res.redirect("/tertiary?success=Tertiary product deleted successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /tertiary/:id (JSON) ──────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await TertiaryProduct.getById(req.params.id);
    if (!product)
      return res.status(404).json({ error: "Tertiary product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
