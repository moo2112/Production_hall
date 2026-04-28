const express = require("express");
const router = express.Router();
const SecondaryProduct = require("../models/secondaryProduct");
const PrimaryProduct = require("../models/primaryProduct");
const Batch = require("../models/batch");
const ActivityLog = require("../models/activityLog");

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

// ── GET /secondary ────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [products, primaryProducts, batches] = await Promise.all([
      SecondaryProduct.getAll(),
      PrimaryProduct.getAll(),
      Batch.getAll(),
    ]);
    res.render("secondary", {
      title: "Secondary Products",
      products,
      primaryProducts,
      batches,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("secondary", {
      title: "Secondary Products",
      products: [],
      primaryProducts: [],
      batches: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /secondary — ENCODE only (no stock deduction) ───────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, description, componentsJson } = req.body;
    const components = parseJson(componentsJson, []);

    const errors = SecondaryProduct.validate({ name, description, components });
    if (errors.length > 0) {
      const [products, primaryProducts, batches] = await Promise.all([
        SecondaryProduct.getAll(),
        PrimaryProduct.getAll(),
        Batch.getAll(),
      ]);
      return res.render("secondary", {
        title: "Secondary Products",
        products,
        primaryProducts,
        batches,
        error: errors.join(", "),
        success: null,
      });
    }

    await SecondaryProduct.create({
      name: name.trim(),
      description: description || "",
      quantity: 0,
      batchStock: [],
      components,
    });

    await ActivityLog.log({
      action: "Secondary Product Encoded",
      itemName: name,
      itemType: "Secondary",
      notes: `Recipe: ${components.length} primary component(s)`,
    });

    res.redirect("/secondary?success=Secondary product encoded successfully");
  } catch (error) {
    const [products, primaryProducts, batches] = await Promise.all([
      SecondaryProduct.getAll(),
      PrimaryProduct.getAll(),
      Batch.getAll(),
    ]);
    res.render("secondary", {
      title: "Secondary Products",
      products,
      primaryProducts,
      batches,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /secondary/:id/produce — ADD CREDIT (deducts primaries, requires batch)
router.post("/:id/produce", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      batchId,
      batchItemName,
      productionStatus,
      removedComponentsJson,
    } = req.body;

    if (!amount || parseFloat(amount) <= 0)
      throw new Error("Please enter a valid production quantity");
    if (!batchId)
      throw new Error("Batch Number is required when adding production credit");
    if (!["Finished", "Damaged"].includes(productionStatus))
      throw new Error("Production status is required (Finished or Damaged)");

    const [product, batch] = await Promise.all([
      SecondaryProduct.getById(id),
      Batch.getById(batchId),
    ]);
    if (!product) throw new Error("Product not found");
    if (!batch) throw new Error("Selected batch was not found");

    const productionAmount = parseFloat(amount);
    let componentsToDeduct = product.components || [];
    let removedIds = [];

    // ── Damaged: filter out unchecked (missing) components ───────────────────
    // For Finished: always deduct ALL components regardless of removedComponentsJson.
    if (productionStatus === "Damaged" && removedComponentsJson) {
      removedIds = parseJson(removedComponentsJson, []);
      componentsToDeduct = componentsToDeduct.filter(
        (c) => !removedIds.includes(c.productId),
      );
    }

    // Scale component quantities by the number of units produced
    const scaled = componentsToDeduct.map((c) => ({
      ...c,
      quantity: parseFloat(c.quantity) * productionAmount,
    }));

    // ── Stock availability check & deduction ─────────────────────────────────
    if (scaled.length > 0) {
      const stockErrors = await SecondaryProduct.checkStockAvailability(scaled);
      if (stockErrors.length > 0) throw new Error(stockErrors.join(", "));
      await SecondaryProduct.deductStock(scaled);
    }

    // ── Damaged sync to Primary Products page ────────────────────────────────
    if (productionStatus === "Damaged" && scaled.length > 0) {
      await Promise.all(
        scaled.map((comp) =>
          PrimaryProduct.incrementDamaged(comp.productId, comp.quantity),
        ),
      );
    }

    // ── Record production credit and batch-level distribution ────────────────
    await SecondaryProduct.addCredit(
      id,
      productionAmount,
      productionStatus === "Damaged",
      batch,
    );

    await ActivityLog.log({
      action: `Secondary Product Credit Added (${productionStatus})`,
      itemName: batchItemName || product.name,
      itemType: "Secondary",
      batchNumber: batch.batchNumber,
      quantity: productionAmount,
      status: productionStatus,
      notes: `Batch distribution updated for ${product.name}`,
    });

    res.redirect("/secondary?success=Production credit added successfully");
  } catch (error) {
    let products = [],
      primaryProducts = [],
      batches = [];
    try {
      [products, primaryProducts, batches] = await Promise.all([
        SecondaryProduct.getAll(),
        PrimaryProduct.getAll(),
        Batch.getAll(),
      ]);
    } catch (_) {}
    res.render("secondary", {
      title: "Secondary Products",
      products,
      primaryProducts,
      batches,
      error: error.message,
      success: null,
    });
  }
});

// ── PUT /secondary/:id ────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, quantity, damages, componentsJson } = req.body;
    const components = parseJson(componentsJson, []);

    const errors = SecondaryProduct.validate({ name, description, components });
    if (errors.length > 0)
      return res.status(400).json({ error: errors.join(", ") });

    const damagesAmt = parseFloat(damages) || 0;
    const product = await SecondaryProduct.getById(id);
    const currentDamaged = product ? product.damagedQuantity || 0 : 0;
    let newQuantity =
      quantity !== undefined
        ? parseFloat(quantity)
        : product
          ? product.quantity || 0
          : 0;

    if (damagesAmt > 0) {
      newQuantity = Math.max(0, newQuantity - damagesAmt);
      await SecondaryProduct.update(id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        damagedQuantity: currentDamaged + damagesAmt,
        components,
      });
    } else {
      await SecondaryProduct.update(id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        components,
      });
    }

    await ActivityLog.log({
      action:
        "Secondary Product Updated" +
        (damagesAmt > 0 ? ` (−${damagesAmt} damaged)` : ""),
      itemName: name,
      itemType: "Secondary",
    });
    res.redirect("/secondary?success=Secondary product updated successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /secondary/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const product = await SecondaryProduct.getById(req.params.id);
    await SecondaryProduct.delete(req.params.id);
    if (product)
      await ActivityLog.log({
        action: "Secondary Product Deleted",
        itemName: product.name,
        itemType: "Secondary",
      });
    res.redirect("/secondary?success=Secondary product deleted successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /secondary/:id (JSON) ─────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await SecondaryProduct.getById(req.params.id);
    if (!product)
      return res.status(404).json({ error: "Secondary product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
