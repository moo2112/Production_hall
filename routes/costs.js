const express = require("express");
const router = express.Router();
const OverheadCost = require("../models/overheadCost");
const Worker = require("../models/worker");
const ActivityLog = require("../models/activityLog");

// ── GET /costs — overhead list + wages + a live cost-per-unit summary ────────
router.get("/", async (req, res) => {
  try {
    const statisticsService = require("../services/statisticsService");
    const [costs, workers, stats] = await Promise.all([
      OverheadCost.getAll(),
      Worker.getAll().catch(() => []),
      statisticsService.getStatistics().catch(() => null),
    ]);
    res.render("costs", {
      title: "Costs & Wages",
      costs,
      workers,
      costing: stats ? stats.costing : null,
      kinds: OverheadCost.KINDS,
      periods: OverheadCost.PERIODS,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("costs", {
      title: "Costs & Wages",
      costs: [],
      workers: [],
      costing: null,
      kinds: OverheadCost.KINDS,
      periods: OverheadCost.PERIODS,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /costs — add overhead cost ──────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, kind, period, amount, note } = req.body;
    if (!name || !String(name).trim()) throw new Error("Cost name is required");
    await OverheadCost.create({ name, kind, period, amount, note });
    await ActivityLog.log({
      action: "Overhead Cost Added",
      itemName: name,
      itemType: "Cost",
      quantity: parseFloat(amount) || 0,
    });
    res.redirect("/costs?success=Cost added");
  } catch (error) {
    res.redirect("/costs?error=" + encodeURIComponent(error.message));
  }
});

// ── DELETE /costs/:id — remove overhead cost ─────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await OverheadCost.delete(req.params.id);
    res.redirect("/costs?success=Cost removed");
  } catch (error) {
    res.redirect("/costs?error=" + encodeURIComponent(error.message));
  }
});

// ── POST /costs/wage — set a worker's wage ───────────────────────────────────
router.post("/wage", async (req, res) => {
  try {
    const { workerId, wage, wageType } = req.body;
    if (!workerId) throw new Error("Worker is required");
    await Worker.setWage(workerId, wage, wageType);
    res.redirect("/costs?success=Wage updated");
  } catch (error) {
    res.redirect("/costs?error=" + encodeURIComponent(error.message));
  }
});

module.exports = router;
