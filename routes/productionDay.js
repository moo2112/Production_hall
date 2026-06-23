const express = require("express");
const router = express.Router();
const ProductionDay = require("../models/productionDay");
const Attendance = require("../models/attendance");
const Worker = require("../models/worker");
const Invoice = require("../models/invoice");
const Workflow = require("../models/workflow");
const TertiaryProduct = require("../models/tertiaryProduct");
const ActivityLog = require("../models/activityLog");
const productionPlanner = require("../services/productionPlanner");
const statisticsService = require("../services/statisticsService");

// ── GET /production-day — recent days + start panel + today's attendance ─────
router.get("/", async (req, res) => {
  try {
    const today = Attendance.todayKey();
    const [days, workers, attendance, workflows] = await Promise.all([
      ProductionDay.getAll(),
      Worker.getAll().catch(() => []),
      Attendance.getByDate(today).catch(() => ({ date: today, records: [] })),
      Workflow.getAll().catch(() => []),
    ]);
    res.render("production-day", {
      title: "Production Day",
      mode: "list",
      days,
      workers,
      attendance,
      today,
      workflows,
      day: null,
      plan: null,
      safeStockDays: statisticsService.SAFE_STOCK_DAYS,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("production-day", {
      title: "Production Day",
      mode: "list",
      days: [],
      workers: [],
      attendance: { records: [] },
      today: Attendance.todayKey(),
      workflows: [],
      day: null,
      plan: null,
      safeStockDays: statisticsService.SAFE_STOCK_DAYS,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /production-day/attendance — save attendance incl. lateness ─────────
router.post("/attendance", async (req, res) => {
  try {
    const date = req.body.date || Attendance.todayKey();
    const toArr = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);
    const presentIds = toArr(req.body.present);
    const lateIds = toArr(req.body.late);
    const workers = await Worker.getAll();
    const records = workers.map((w) => ({
      workerId: w.id,
      workerName: w.name,
      present: presentIds.includes(w.id),
      late: lateIds.includes(w.id),
      // minutesLate field name is minutesLate_<workerId>
      minutesLate: parseFloat(req.body["minutesLate_" + w.id]) || 0,
    }));
    await Attendance.setForDate(date, records);
    const count = records.filter((r) => r.present).length;
    const lateCount = records.filter((r) => r.present && r.late).length;
    await ActivityLog.log({
      action: "Attendance Recorded",
      itemName: `${count} present, ${lateCount} late`,
      itemType: "Attendance",
      notes: date,
    });
    res.redirect(
      "/production-day?success=" +
        encodeURIComponent(
          `Attendance saved (${count} present, ${lateCount} late)`,
        ),
    );
  } catch (error) {
    res.redirect("/production-day?error=" + encodeURIComponent(error.message));
  }
});

// ── POST /production-day/start — build plan (+ carry-over) and create day ────
router.post("/start", async (req, res) => {
  try {
    const targetDays =
      parseInt(req.body.targetDays, 10) || statisticsService.SAFE_STOCK_DAYS;
    const date = req.body.date || Attendance.todayKey();
    const plan = await productionPlanner.buildPlan({ targetDays, date });
    // Carry over any unfinished tasks from earlier in-progress days.
    const carried = await ProductionDay.getCarryOverTasks().catch(() => []);
    const allTasks = [...carried, ...plan.tasks];

    if (!allTasks.length) {
      return res.redirect(
        "/production-day?success=" +
          encodeURIComponent(
            "No production needed right now — coverage is healthy, no pending invoices, and nothing carried over.",
          ),
      );
    }
    const day = await ProductionDay.create({
      date,
      workersPresent: plan.workersPresent,
      tasks: allTasks,
      notes: req.body.notes || "",
    });
    await ActivityLog.log({
      action: "Production Day Started",
      itemName: date,
      itemType: "ProductionDay",
      quantity: allTasks.length,
    });
    res.redirect("/production-day/" + day.id);
  } catch (error) {
    res.redirect("/production-day?error=" + encodeURIComponent(error.message));
  }
});

// ── GET /production-day/preview — JSON plan preview (no save) ─────────────────
router.get("/preview", async (req, res) => {
  try {
    const targetDays =
      parseInt(req.query.targetDays, 10) || statisticsService.SAFE_STOCK_DAYS;
    const plan = await productionPlanner.buildPlan({ targetDays });
    const carried = await ProductionDay.getCarryOverTasks().catch(() => []);
    plan.carriedOver = carried.length;
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /production-day/:id — execute a single day ───────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [day, workers, workflows] = await Promise.all([
      ProductionDay.getById(req.params.id),
      Worker.getAll().catch(() => []),
      Workflow.getAll().catch(() => []),
    ]);
    if (!day) return res.redirect("/production-day?error=Day not found");
    res.render("production-day", {
      title: "Production Day — " + day.date,
      mode: "execute",
      day,
      workers,
      workflows,
      days: [],
      attendance: null,
      today: Attendance.todayKey(),
      plan: null,
      safeStockDays: statisticsService.SAFE_STOCK_DAYS,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.redirect("/production-day?error=" + encodeURIComponent(error.message));
  }
});

// ── POST /production-day/:id/assign — set the owner worker of a task ──────────
router.post("/:id/assign", async (req, res) => {
  try {
    const { taskId, workerId } = req.body;
    let workerName = "";
    if (workerId) {
      const w = await Worker.getById(workerId);
      workerName = w ? w.name : "";
    }
    const day = await ProductionDay.assignWorker(
      req.params.id,
      taskId,
      workerId || null,
      workerName,
    );
    res.json({ ok: true, day });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /production-day/:id/command — give an idle worker another task ──────
router.post("/:id/command", async (req, res) => {
  try {
    const { taskId, workerId, command } = req.body;
    let workerName = "";
    if (workerId) {
      const w = await Worker.getById(workerId);
      workerName = w ? w.name : "";
    }
    await ProductionDay.addAssignment(
      req.params.id,
      taskId,
      workerId || null,
      workerName,
      command,
    );
    res.redirect(
      "/production-day/" +
        req.params.id +
        "?success=" +
        encodeURIComponent("Command assigned to " + (workerName || "worker")),
    );
  } catch (error) {
    res.redirect(
      "/production-day/" +
        req.params.id +
        "?error=" +
        encodeURIComponent(error.message),
    );
  }
});

// ── POST /production-day/:id/unit-count — set task unit count ─────────────────
router.post("/:id/unit-count", async (req, res) => {
  try {
    const { taskId, unitCount } = req.body;
    const day = await ProductionDay.setUnitCount(
      req.params.id,
      taskId,
      unitCount,
    );
    res.json({ ok: true, day });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /production-day/:id/step — toggle a step; run side-effects on finish ─
router.post("/:id/step", async (req, res) => {
  try {
    const { taskId, stepId, done } = req.body;
    const day = await ProductionDay.setStep(
      req.params.id,
      taskId,
      stepId,
      done === undefined ? null : done === "true" || done === true,
    );
    // When a task has just been fully completed, run one-time side effects:
    //   • invoice task  → record the sale against tertiary stock + mark invoice
    //   • assigned worker→ record the completed task in their profile
    const task = (day.tasks || []).find((t) => t.id === taskId);
    let sideEffects = [];
    if (task && task.status === "completed" && !task.recorded) {
      sideEffects = await runTaskCompletion(day, task);
      await ProductionDay.markRecorded(req.params.id, taskId);
    }
    const fresh = await ProductionDay.getById(req.params.id);
    res.json({ ok: true, progress: fresh.progress, sideEffects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * One-time side effects when a task is completed.
 * Returns an array of human-readable messages for the UI.
 */
async function runTaskCompletion(day, task) {
  const msgs = [];
  // 1) Invoice task → sell the invoice items from tertiary stock.
  if (task.source === "invoice" && task.invoiceId) {
    try {
      const inv = await Invoice.getById(task.invoiceId);
      if (inv) {
        // Expand bridge lines into their underlying tertiary products first.
        const flat = Invoice.expandItems(inv.items || []);
        for (const item of flat) {
          if (item.productId && item.quantity > 0) {
            const { soldFrom, shortfall } = await TertiaryProduct.sellAnyBatch(
              item.productId,
              item.quantity,
            );
            await ActivityLog.log({
              action: "Tertiary Product Sold",
              itemName: item.productName,
              itemType: "Tertiary",
              quantity: item.quantity - (shortfall || 0),
              status: "Sold",
              notes:
                `Invoice ${inv.invoiceNumber}` +
                (soldFrom && soldFrom.length
                  ? ` (${soldFrom.map((s) => s.batchNumber).join(", ")})`
                  : ""),
            });
            if (shortfall > 0)
              msgs.push(
                `Warning: only partial stock for ${item.productName} (short ${shortfall}).`,
              );
            else
              msgs.push(
                `Recorded sale of ${item.quantity}× ${item.productName}.`,
              );
          }
        }
        await Invoice.updateStatus(task.invoiceId, "prepared");
        msgs.push(`Invoice ${inv.invoiceNumber} marked prepared.`);
      }
    } catch (e) {
      msgs.push("Sale recording issue: " + e.message);
    }
  }
  // 2) Record the completed task in the assigned worker's profile.
  if (task.assignedWorkerId) {
    try {
      await Worker.recordTask(task.assignedWorkerId, {
        dayId: day.id,
        date: day.date,
        productName: task.productName,
        tier: task.tier,
        quantity: task.quantity != null ? task.quantity : task.unitCount,
        workflowName: task.workflowName,
      });
      msgs.push(`Logged to ${task.assignedWorkerName}'s profile.`);
    } catch (e) {
      msgs.push("Worker log issue: " + e.message);
    }
  }
  return msgs;
}

// ── POST /production-day/:id/complete ────────────────────────────────────────
router.post("/:id/complete", async (req, res) => {
  try {
    await ProductionDay.complete(req.params.id);
    await ActivityLog.log({
      action: "Production Day Completed",
      itemName: req.params.id,
      itemType: "ProductionDay",
    });
    res.redirect(
      "/production-day/" + req.params.id + "?success=Day marked complete",
    );
  } catch (error) {
    res.redirect(
      "/production-day/" +
        req.params.id +
        "?error=" +
        encodeURIComponent(error.message),
    );
  }
});

// ── DELETE /production-day/:id ───────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await ProductionDay.delete(req.params.id);
    res.redirect("/production-day?success=Production day deleted");
  } catch (error) {
    res.redirect("/production-day?error=" + encodeURIComponent(error.message));
  }
});

module.exports = router;
