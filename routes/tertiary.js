const express = require("express");
const router = express.Router();
const TertiaryProduct = require("../models/tertiaryProduct");
const SecondaryProduct = require("../models/secondaryProduct");
const Batch = require("../models/batch");
const ActivityLog = require("../models/activityLog");

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
    let components = [];
    if (componentsJson) {
      try {
        components = JSON.parse(componentsJson);
      } catch (e) {
        throw new Error("Invalid components data");
      }
    }
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

// ── POST /tertiary/:id/produce — ADD CREDIT (deducts secondaries, requires batch)
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
    const product = await TertiaryProduct.getById(id);
    if (!product) throw new Error("Product not found");
    let componentsToDeduct = product.components || [];
    if (productionStatus === "Damaged" && removedComponentsJson) {
      try {
        const removed = JSON.parse(removedComponentsJson);
        componentsToDeduct = componentsToDeduct.filter(
          (c) => !removed.includes(c.productId),
        );
      } catch (e) {
        /* ignore */
      }
    }
    const scaled = componentsToDeduct.map((c) => ({
      ...c,
      quantity: parseFloat(c.quantity) * parseFloat(amount),
    }));
    if (scaled.length > 0) {
      const stockErrors = await TertiaryProduct.checkStockAvailability(scaled);
      if (stockErrors.length > 0) throw new Error(stockErrors.join(", "));
      await TertiaryProduct.deductStock(scaled);
    }
    await TertiaryProduct.addCredit(
      id,
      parseFloat(amount),
      productionStatus === "Damaged",
    );
    const batch = await Batch.getById(batchId);
    const batchNumber = batch ? batch.batchNumber : null;
    await ActivityLog.log({
      action: `Tertiary Product Credit Added (${productionStatus})`,
      itemName: batchItemName || product.name,
      itemType: "Tertiary",
      batchNumber,
      quantity: parseFloat(amount),
      status: productionStatus,
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

// ── POST /tertiary/:id/sell — RECORD SOLD QUANTITY ────────────────────────────
router.post("/:id/sell", async (req, res) => {
  try {
    const { id } = req.params;
    const { soldQuantity } = req.body;
    const qty = parseFloat(soldQuantity);
    if (!soldQuantity || isNaN(qty) || qty <= 0)
      throw new Error("Please enter a valid sold quantity");
    const product = await TertiaryProduct.getById(id);
    if (!product) throw new Error("Product not found");
    if (qty > (product.quantity || 0))
      throw new Error(
        `Cannot sell ${qty} units — only ${product.quantity || 0} units available in stock`,
      );
    await TertiaryProduct.recordSale(id, qty);
    await ActivityLog.log({
      action: "Tertiary Product Sold",
      itemName: product.name,
      itemType: "Tertiary",
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
    let components = [];
    if (componentsJson) {
      try {
        components = JSON.parse(componentsJson);
      } catch (e) {
        throw new Error("Invalid components data");
      }
    }
    const errors = TertiaryProduct.validate({ name, description, components });
    if (errors.length > 0)
      return res.status(400).json({ error: errors.join(", ") });
    const damagesAmt = parseFloat(damages) || 0;
    const product = await TertiaryProduct.getById(id);
    const currentDamaged = product ? product.damagedQuantity || 0 : 0;
    // quantity from form represents current stock; if damages entered, subtract from it
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
