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

/**
 * ── QC GUARD: Secondary batches ───────────────────────────────────────────────
 * Checks every secondary batch the user wants to consume when producing a
 * tertiary product.  Throws a descriptive error if any of them is rejected.
 */
async function enforceQcOnSecondaryAllocations(rawAllocations) {
  const allocations = normalizeAllocationGroups(rawAllocations);
  for (const group of allocations) {
    for (const batch of group.batches) {
      if (batch.batchId && batch.batchId !== "__manual__") {
        const batchDoc = await Batch.getById(batch.batchId);
        if (batchDoc && batchDoc.qualityStatus === "rejected") {
          throw new Error(
            `Quality Control Violation: Secondary batch "${batchDoc.batchNumber}" has been rejected by Quality Control. ` +
              `Rejected secondary batches cannot be used to produce tertiary products.`,
          );
        }
      }
    }
  }
}

async function validateComponentBatchSelections(
  activeComponents,
  rawAllocations,
  productionAmount,
) {
  const allocations = normalizeAllocationGroups(rawAllocations);
  const sourceBatches = [];
  const allowedComponents = new Map(
    (Array.isArray(activeComponents) ? activeComponents : []).map((c) => [
      c.productId,
      c,
    ]),
  );

  if (allowedComponents.size === 0)
    throw new Error(
      "This tertiary product has no selectable secondary products",
    );

  // Each component is independent: required units of that secondary = credit × per-unit recipe quantity.
  // No "shared total" across components anymore.
  const targetPerComponent = new Map();
  for (const comp of activeComponents) {
    const used = toNumber(comp.usedQuantity, 1) || 1;
    targetPerComponent.set(comp.productId, roundQty(productionAmount * used));
  }

  if (allocations.length === 0) {
    const summary = Array.from(targetPerComponent.entries())
      .map(([pid, qty]) => {
        const c = allowedComponents.get(pid);
        return `${(c && c.name) || pid}: ${qty}`;
      })
      .join(", ");
    throw new Error(
      `Please select secondary product batches. Required per component — ${summary}.`,
    );
  }

  const selectedByProduct = new Map();

  for (const allocation of allocations) {
    const component = allowedComponents.get(allocation.productId);
    if (!component)
      throw new Error(
        `Selected secondary product ${allocation.productName || allocation.productId} is not related to this tertiary product`,
      );

    const secondaryProduct = await SecondaryProduct.getById(
      allocation.productId,
    );
    if (!secondaryProduct)
      throw new Error(
        `Secondary product not found for ${component.name || allocation.productName || allocation.productId}`,
      );

    let productSelected = 0;
    allocation.batches.forEach((batch) => {
      const batchStock = (secondaryProduct.batchStock || []).find(
        (e) => e.batchId === batch.batchId,
      );
      const available = batchStock ? roundQty(batchStock.quantity) : 0;
      if (!batchStock || available + EPSILON < batch.quantity)
        throw new Error(
          `Cannot use ${batch.quantity} units from ${secondaryProduct.name} batch ${batch.batchNumber}. Available: ${available}`,
        );
      productSelected = roundQty(productSelected + batch.quantity);
    });

    selectedByProduct.set(
      allocation.productId,
      roundQty(
        (selectedByProduct.get(allocation.productId) || 0) + productSelected,
      ),
    );

    sourceBatches.push({
      productId: allocation.productId,
      productName: secondaryProduct.name,
      batches: allocation.batches,
    });
  }

  // Each active component must match its own target exactly — components do NOT share a total.
  for (const comp of activeComponents) {
    const target = targetPerComponent.get(comp.productId) || 0;
    const selected = roundQty(selectedByProduct.get(comp.productId) || 0);
    if (Math.abs(selected - target) > EPSILON) {
      throw new Error(
        `Component "${comp.name || comp.productId}" requires exactly ${target} units selected ` +
          `(credit ${roundQty(productionAmount)} × ${toNumber(comp.usedQuantity, 1) || 1} per unit). ` +
          `Currently selected: ${selected}.`,
      );
    }
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
    // Attach calculated unit cost (primary price -> secondary cost -> tertiary
    // cost) so the view can display production cost per tertiary product.
    // Calculation lives in the shared backend cost service.
    const costService = require("../services/costService");
    const PrimaryProduct = require("../models/primaryProduct");
    const primaryProducts = await PrimaryProduct.getAll().catch(() => []);
    const priceMap = costService.buildPrimaryPriceMap(primaryProducts);
    const secondaryCostMap = costService.buildSecondaryCostMap(
      secondaryProducts,
      priceMap,
    );
    products.forEach((p) => {
      const c = costService.tertiaryFullUnitCost(p, secondaryCostMap);
      p.unitCost = c.unitCost;
      p.componentsCost = c.componentsCost;
      p.costMissingPrice = c.missingPrices.length > 0;
    });
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
    const {
      name,
      description,
      componentsJson,
      preparationCost,
      packagingCost,
    } = req.body;
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
      preparationCost: parseFloat(preparationCost) || 0,
      packagingCost: parseFloat(packagingCost) || 0,
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

// ── POST /tertiary/:id/produce — ADD CREDIT ──────────────────────────────────
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

    // ── QC GUARD: target tertiary batch must not be rejected ─────────────────
    const targetBatchDoc = await Batch.getById(batchId);
    if (!targetBatchDoc) throw new Error("Selected batch was not found");
    if (targetBatchDoc.qualityStatus === "rejected")
      throw new Error(
        `Quality Control Violation: Batch "${targetBatchDoc.batchNumber}" has been rejected by Quality Control and cannot be used for production.`,
      );

    const product = await TertiaryProduct.getById(id);
    if (!product) throw new Error("Product not found");

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
        (d) => d.id === component.productId,
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

    // ── QC GUARD: every secondary batch allocation must not be rejected ──────
    if (componentBatchSelections.length > 0) {
      await enforceQcOnSecondaryAllocations(componentBatchSelections);
    }

    let sourceBatches = [];
    if (selectableComponents.length > 0) {
      const selectedGroups = await validateComponentBatchSelections(
        selectableComponents,
        componentBatchSelections,
        productionAmount,
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
      targetBatchDoc,
      sourceBatches,
    );
    await ActivityLog.log({
      action: `Tertiary Product Credit Added (${productionStatus})`,
      itemName: batchItemName || product.name,
      itemType: "Tertiary",
      batchNumber: targetBatchDoc.batchNumber,
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

// ── POST /tertiary/:id/sell — RECORD SALE ────────────────────────────────────
router.post("/:id/sell", async (req, res) => {
  try {
    const { id } = req.params;
    const { soldQuantity, batchId } = req.body;
    const qty = parseFloat(soldQuantity);

    if (!soldQuantity || isNaN(qty) || qty <= 0)
      throw new Error("Please enter a valid sold quantity");
    if (!batchId)
      throw new Error("Please select the tertiary batch to sell from");

    // ── QC GUARD: batch must not be rejected before allowing sale ────────────
    if (batchId !== "__manual__") {
      const batchDoc = await Batch.getById(batchId);
      if (batchDoc && batchDoc.qualityStatus === "rejected") {
        throw new Error(
          `Quality Control Violation: Batch "${batchDoc.batchNumber}" has been rejected by Quality Control. ` +
            `Rejected batches cannot be sold.`,
        );
      }
    }

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
    const {
      name,
      description,
      quantity,
      damages,
      componentsJson,
      preparationCost,
      packagingCost,
    } = req.body;
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
        preparationCost: parseFloat(preparationCost) || 0,
        packagingCost: parseFloat(packagingCost) || 0,
      });
    } else {
      await TertiaryProduct.update(id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        components,
        preparationCost: parseFloat(preparationCost) || 0,
        packagingCost: parseFloat(packagingCost) || 0,
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
