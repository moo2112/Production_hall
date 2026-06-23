/**
 * productionPlanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns "what should we produce today" into a concrete, executable task list.
 *
 * Inputs combined here:
 *   1. statisticsService.getProductionTasks() — secondary & tertiary products
 *      that are below their target coverage (smart sold/consumed analysis).
 *   2. Workflow designs — the ordered steps, expected time, and workers needed
 *      to produce each product (and to package/sell).
 *   3. Pending invoices — customer orders that must be prepared today.
 *   4. Worker attendance — how many workers are actually present, so the plan
 *      can flag tasks that need more hands than are available.
 *
 * The result is handed to ProductionDay.create() and then executed step-by-step.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const statisticsService = require("./statisticsService");
const Workflow = require("../models/workflow");
const Invoice = require("../models/invoice");
const Attendance = require("../models/attendance");

/** Copy a workflow's steps into a fresh executable step list. */
function stepsFromWorkflow(workflow) {
  if (!workflow || !Array.isArray(workflow.steps)) return [];
  return workflow.steps.map((s) => ({
    name: s.name,
    description: s.description,
    expectedMinutes: s.expectedMinutes,
    workersNeeded: s.workersNeeded,
  }));
}

/**
 * Build the recommended task list for a production day.
 *
 * @param {Object} opts
 * @param {number} opts.targetDays  coverage target for production tasks
 * @param {string} opts.date        YYYY-MM-DD
 * @returns {Object} { date, targetDays, workersPresent, workersNeeded,
 *                      capacityWarning, tasks[], summary }
 */
async function buildPlan(opts = {}) {
  const targetDays = opts.targetDays || statisticsService.SAFE_STOCK_DAYS;
  const date = opts.date || new Date().toISOString().slice(0, 10);

  const [taskRec, workflows, pendingInvoices, attendance] = await Promise.all([
    statisticsService.getProductionTasks(targetDays),
    Workflow.getAll().catch(() => []),
    Invoice.getPending().catch(() => []),
    Attendance.getByDate(date).catch(() => ({ records: [] })),
  ]);

  const workersPresent = Attendance.presentCount(attendance);
  const workflowByProduct = {};
  workflows.forEach((w) => {
    if (w.productId) workflowByProduct[w.productId] = w;
  });
  // A reusable packaging/selling workflow (first one of that type).
  const packagingWorkflow =
    workflows.find((w) => w.type === "packaging_selling") || null;

  const tasks = [];

  // ── 1. Production tasks for secondary & tertiary products below coverage ────
  for (const rec of taskRec.tasks) {
    if (!rec.needsProduction) continue; // only act on real shortages
    const workflow = workflowByProduct[rec.id] || null;
    const steps = stepsFromWorkflow(workflow);
    tasks.push({
      source: "auto",
      productId: rec.id,
      productName: rec.name,
      tier: rec.tier,
      quantity: rec.suggestedProduction,
      reason:
        `Stock ${rec.currentStock} is below the ${targetDays}-day target ` +
        `(${rec.requiredStock}). Produce ${rec.suggestedProduction} to restore coverage.`,
      workflowId: workflow ? workflow.id : null,
      workflowName: workflow ? workflow.name : "",
      workersNeeded: workflow ? workflow.peakWorkers : 0,
      expectedMinutes: workflow ? workflow.totalExpectedMinutes : 0,
      steps,
      missingWorkflow: !workflow,
    });
  }

  // ── 2. Invoice preparation tasks (packaging & selling) ──────────────────────
  for (const inv of pendingInvoices) {
    const steps = stepsFromWorkflow(packagingWorkflow);
    const itemSummary = (inv.items || [])
      .map((it) => `${it.quantity}× ${it.productName}`)
      .join(", ");
    tasks.push({
      source: "invoice",
      invoiceId: inv.id,
      productName: `Invoice ${inv.invoiceNumber} — ${inv.customer && inv.customer.name}`,
      tier: "Sale",
      quantity: null,
      reason: `Prepare & package order for ${inv.customer && inv.customer.name}: ${itemSummary}. Total ${Number(inv.total || 0).toFixed(2)}.`,
      workflowId: packagingWorkflow ? packagingWorkflow.id : null,
      workflowName: packagingWorkflow
        ? packagingWorkflow.name
        : "Packaging & Selling",
      workersNeeded: packagingWorkflow ? packagingWorkflow.peakWorkers : 0,
      expectedMinutes: packagingWorkflow
        ? packagingWorkflow.totalExpectedMinutes
        : 0,
      steps:
        steps.length > 0
          ? steps
          : [
              {
                name: "Pick items from stock",
                description: itemSummary,
                expectedMinutes: 0,
                workersNeeded: 1,
              },
              {
                name: "Package order",
                description: "",
                expectedMinutes: 0,
                workersNeeded: 1,
              },
              {
                name: "Hand over / dispatch & mark invoice prepared",
                description: "",
                expectedMinutes: 0,
                workersNeeded: 1,
              },
            ],
      missingWorkflow: !packagingWorkflow,
    });
  }

  // ── Capacity analysis ───────────────────────────────────────────────────────
  // Peak simultaneous workers required = the busiest single task (tasks run
  // sequentially through the day, so capacity must cover the largest one).
  const workersNeeded = tasks.reduce(
    (m, t) => Math.max(m, t.workersNeeded || 0),
    0,
  );
  const totalMinutes = tasks.reduce((s, t) => s + (t.expectedMinutes || 0), 0);

  return {
    date,
    targetDays,
    workersPresent,
    workersNeeded,
    capacityWarning:
      workersPresent > 0 && workersNeeded > workersPresent
        ? `This plan needs ${workersNeeded} workers at peak but only ${workersPresent} are marked present today.`
        : null,
    noAttendance: workersPresent === 0,
    tasks,
    summary: {
      productionTasks: tasks.filter((t) => t.source === "auto").length,
      invoiceTasks: tasks.filter((t) => t.source === "invoice").length,
      totalEstimatedMinutes: totalMinutes,
      missingWorkflows: tasks.filter((t) => t.missingWorkflow).length,
    },
  };
}

module.exports = { buildPlan };
