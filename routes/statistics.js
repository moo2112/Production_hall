/**
 * routes/statistics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Statistics dashboard + recommendation endpoints.
 *
 *   GET  /statistics                       → renders the dashboard page
 *   GET  /statistics/purchase-order?days=N → JSON purchase-order recommendation
 *   GET  /statistics/production-tasks?days=N → JSON daily production-task plan
 *
 * All heavy lifting lives in services/statisticsService.js (backend layer); this
 * file only wires HTTP requests to that logic and renders/serialises the result.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require("express");
const router = express.Router();
const statisticsService = require("../services/statisticsService");

// ── GET /statistics — full dashboard ─────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const stats = await statisticsService.getStatistics();
    // Pre-load a default purchase order (30 days) and production tasks (14 days)
    // so the page is useful on first load without an extra request.
    const [purchaseOrder, productionTasks] = await Promise.all([
      statisticsService.getPurchaseOrder(30),
      statisticsService.getProductionTasks(statisticsService.SAFE_STOCK_DAYS),
    ]);
    res.render("statistics", {
      title: "Statistics",
      stats,
      purchaseOrder,
      productionTasks,
      error: null,
    });
  } catch (error) {
    res.render("statistics", {
      title: "Statistics",
      stats: null,
      purchaseOrder: null,
      productionTasks: null,
      error: error.message,
    });
  }
});

// ── GET /statistics/purchase-order — JSON, parameterised by coverage days ─────
router.get("/purchase-order", async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const result = await statisticsService.getPurchaseOrder(days);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /statistics/production-tasks — JSON, parameterised by target days ─────
router.get("/production-tasks", async (req, res) => {
  try {
    const days =
      parseInt(req.query.days, 10) || statisticsService.SAFE_STOCK_DAYS;
    const result = await statisticsService.getProductionTasks(days);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
