const express = require("express");
const router = express.Router();
const Workflow = require("../models/workflow");
const SecondaryProduct = require("../models/secondaryProduct");
const TertiaryProduct = require("../models/tertiaryProduct");
const ActivityLog = require("../models/activityLog");

function parseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ── GET /workflows — list + builder ──────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [workflows, secondary, tertiary] = await Promise.all([
      Workflow.getAll(),
      SecondaryProduct.getAll().catch(() => []),
      TertiaryProduct.getAll().catch(() => []),
    ]);
    res.render("workflows", {
      title: "Workflows",
      workflows,
      secondaryProducts: secondary,
      tertiaryProducts: tertiary,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("workflows", {
      title: "Workflows",
      workflows: [],
      secondaryProducts: [],
      tertiaryProducts: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /workflows — create ─────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      name,
      type,
      productId,
      productName,
      productTier,
      workingHoursFrom,
      workingHoursTo,
      stepsJson,
    } = req.body;
    const steps = parseJson(stepsJson, []);
    const errors = Workflow.validate({ name, steps });
    if (errors.length) throw new Error(errors.join(", "));
    await Workflow.create({
      name,
      type,
      productId: productId || null,
      productName: productName || "",
      productTier: productTier || "",
      workingHoursFrom,
      workingHoursTo,
      steps,
    });
    await ActivityLog.log({
      action: "Workflow Created",
      itemName: name,
      itemType: "Workflow",
    });
    res.redirect("/workflows?success=Workflow saved successfully");
  } catch (error) {
    res.redirect("/workflows?error=" + encodeURIComponent(error.message));
  }
});

// ── GET /workflows/:id (JSON) — used by the edit modal ───────────────────────
router.get("/:id", async (req, res) => {
  try {
    const workflow = await Workflow.getById(req.params.id);
    if (!workflow) return res.status(404).json({ error: "Workflow not found" });
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /workflows/:id — update ──────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      type,
      productId,
      productName,
      productTier,
      workingHoursFrom,
      workingHoursTo,
      stepsJson,
    } = req.body;
    const steps = parseJson(stepsJson, []);
    const errors = Workflow.validate({ name, steps });
    if (errors.length) throw new Error(errors.join(", "));
    await Workflow.update(req.params.id, {
      name,
      type,
      productId: productId || null,
      productName: productName || "",
      productTier: productTier || "",
      workingHoursFrom,
      workingHoursTo,
      steps,
    });
    await ActivityLog.log({
      action: "Workflow Updated",
      itemName: name,
      itemType: "Workflow",
    });
    res.redirect("/workflows?success=Workflow updated successfully");
  } catch (error) {
    res.redirect("/workflows?error=" + encodeURIComponent(error.message));
  }
});

// ── DELETE /workflows/:id ────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const wf = await Workflow.getById(req.params.id);
    await Workflow.delete(req.params.id);
    if (wf)
      await ActivityLog.log({
        action: "Workflow Deleted",
        itemName: wf.name,
        itemType: "Workflow",
      });
    res.redirect("/workflows?success=Workflow deleted");
  } catch (error) {
    res.redirect("/workflows?error=" + encodeURIComponent(error.message));
  }
});

module.exports = router;
