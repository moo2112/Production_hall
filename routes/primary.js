const express = require("express");
const router = express.Router();
const PrimaryProduct = require("../models/primaryProduct");
const ActivityLog = require("../models/activityLog");

// ── GET /primary ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const products = await PrimaryProduct.getAll();
    res.render("primary", {
      title: "Primary Products",
      products,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("primary", {
      title: "Primary Products",
      products: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /primary — ENCODE only ───────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim() === "")
      throw new Error("Product name is required");
    await PrimaryProduct.create({
      name: name.trim(),
      description: description || "",
    });
    await ActivityLog.log({
      action: "Primary Product Encoded",
      itemName: name.trim(),
      itemType: "Primary",
    });
    res.redirect("/primary?success=Primary product encoded successfully");
  } catch (error) {
    let products = [];
    try {
      products = await PrimaryProduct.getAll();
    } catch (e) {}
    res.render("primary", {
      title: "Primary Products",
      products,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /primary/:id/produce — ADD CREDIT
router.post("/:id/produce", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, productionStatus } = req.body;
    if (!amount || parseFloat(amount) <= 0)
      throw new Error("Please enter a valid production quantity");
    if (!["Finished", "Damaged"].includes(productionStatus))
      throw new Error(
        "Please select a production status (Finished or Damaged)",
      );
    const product = await PrimaryProduct.getById(id);
    if (!product) throw new Error("Product not found");
    await PrimaryProduct.addCredit(
      id,
      parseFloat(amount),
      productionStatus === "Damaged",
    );
    await ActivityLog.log({
      action: `Primary Product Credit Added (${productionStatus})`,
      itemName: product.name,
      itemType: "Primary",
      quantity: parseFloat(amount),
      status: productionStatus,
    });
    res.redirect("/primary?success=Production credit added successfully");
  } catch (error) {
    const products = await PrimaryProduct.getAll();
    res.render("primary", {
      title: "Primary Products",
      products,
      error: error.message,
      success: null,
    });
  }
});

// ── PUT /primary/:id ──────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { name, description, quantity, damages } = req.body;
    if (!name || name.trim() === "")
      return res.status(400).json({ error: "Product name is required" });

    const damagesAmt = parseFloat(damages) || 0;
    const product = await PrimaryProduct.getById(req.params.id);
    const currentDamaged = product ? product.damagedQuantity || 0 : 0;

    // quantity from the form is the current stock value; subtract damages from it
    let newQuantity =
      quantity !== undefined
        ? parseFloat(quantity)
        : product
          ? product.quantity || 0
          : 0;

    if (damagesAmt > 0) {
      // Deduct the damaged amount from the quantity entered in the form
      newQuantity = Math.max(0, newQuantity - damagesAmt);
      await PrimaryProduct.update(req.params.id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
        damagedQuantity: currentDamaged + damagesAmt,
      });
    } else {
      await PrimaryProduct.update(req.params.id, {
        name: name.trim(),
        description: description || "",
        quantity: newQuantity,
      });
    }

    await ActivityLog.log({
      action:
        "Primary Product Updated" +
        (damagesAmt > 0 ? ` (−${damagesAmt} damaged)` : ""),
      itemName: name,
      itemType: "Primary",
    });
    res.redirect("/primary?success=Primary product updated successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /primary/:id ───────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const product = await PrimaryProduct.getById(req.params.id);
    await PrimaryProduct.delete(req.params.id);
    if (product)
      await ActivityLog.log({
        action: "Primary Product Deleted",
        itemName: product.name,
        itemType: "Primary",
      });
    res.redirect("/primary?success=Primary product deleted successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /primary/:id (JSON) ───────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await PrimaryProduct.getById(req.params.id);
    if (!product)
      return res.status(404).json({ error: "Primary product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
