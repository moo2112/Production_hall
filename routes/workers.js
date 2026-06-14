const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const Worker = require("../models/worker");
const Batch = require("../models/batch");
const FormTemplate = require("../models/formTemplate");
const ActivityLog = require("../models/activityLog");

/* ── helpers ──────────────────────────────────────────────────────────────── */

function humanize(key) {
  return (
    String(key || "")
      .replace(/^field_/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || "Field"
  );
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    if (value.toDate) return value.toDate().toLocaleString();
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  } catch (_) {
    return String(value);
  }
}

function safeFile(name) {
  return (
    String(name || "worker")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "worker"
  );
}

/**
 * Resolve a batch's fields to a readable [{ label, value }] list, using the
 * form template for labels where possible. Any field answer can be a worker name.
 */
async function buildBatchFields(batch) {
  const out = [];
  out.push({ label: "Batch Number", value: batch.batchNumber || "" });
  out.push({ label: "Item Name", value: batch.itemName || "" });

  const fieldValues = batch.fieldValues || {};
  let template = null;
  if (batch.formTemplateId) {
    try {
      template = await FormTemplate.getById(batch.formTemplateId);
    } catch (_) {
      template = null;
    }
  }

  const used = new Set();
  const norm = (k) => String(k || "").replace(/^field_/, "");

  if (template && Array.isArray(template.fields)) {
    template.fields.forEach((f) => {
      const key = norm(f.id);
      // try a few key variants
      const variants = [key, f.id, "field_" + key];
      const matchKey = variants.find((v) =>
        Object.prototype.hasOwnProperty.call(fieldValues, norm(v)),
      );
      const value = matchKey ? fieldValues[norm(matchKey)] : "";
      if (matchKey) used.add(norm(matchKey));
      out.push({ label: f.label || humanize(key), value: value || "" });
    });
  }

  Object.entries(fieldValues).forEach(([k, v]) => {
    if (!used.has(norm(k))) out.push({ label: humanize(k), value: v || "" });
  });

  return out;
}

/* ── PDF generation ───────────────────────────────────────────────────────── */

const TEAL = "#0f766e";
const LIGHT = "#e6f4f1";
const INK = "#1f2a37";
const MUTED = "#64748b";

function pdfTable(doc, columns, rows, startX, startY) {
  const widths = columns.map((c) => c.width);
  const rowH = 22;
  let y = startY;

  // header
  doc
    .rect(
      startX,
      y,
      widths.reduce((a, b) => a + b, 0),
      rowH,
    )
    .fill(TEAL);
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
  let x = startX;
  columns.forEach((c, i) => {
    doc.text(c.label, x + 5, y + 6, { width: widths[i] - 10 });
    x += widths[i];
  });
  y += rowH;

  doc.font("Helvetica").fontSize(9);
  rows.forEach((r, idx) => {
    const cellHeights = columns.map((c) => {
      const t = String(r[c.key] == null ? "" : r[c.key]);
      return doc.heightOfString(t, { width: c.width - 10 }) + 10;
    });
    const h = Math.max(rowH, ...cellHeights);
    if (y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    if (idx % 2 === 0) {
      doc
        .rect(
          startX,
          y,
          widths.reduce((a, b) => a + b, 0),
          h,
        )
        .fill(LIGHT);
    }
    x = startX;
    columns.forEach((c) => {
      const t = String(r[c.key] == null ? "" : r[c.key]);
      doc.fillColor(c.color ? c.color(r) : INK).text(t, x + 5, y + 5, {
        width: c.width - 10,
      });
      x += c.width;
    });
    doc.fillColor(INK);
    y += h;
  });
  return y;
}

function renderWorkerPage(doc, worker, isFirst) {
  if (!isFirst) doc.addPage();
  const left = doc.page.margins.left;
  const contentW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header band
  doc.rect(left, doc.y, contentW, 46).fill(TEAL);
  doc
    .fillColor("#ffffff")
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(worker.name || "Worker", left + 12, doc.y + 8);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#d8f3ee")
    .text(
      (worker.role ? worker.role + "  ·  " : "") + "Production Room Quality",
      left + 12,
      doc.y + 4,
    );
  doc.moveDown(2);
  doc.fillColor(INK);

  const rounds = Array.isArray(worker.qualityRounds)
    ? worker.qualityRounds
    : [];
  const errors = Array.isArray(worker.productionErrors)
    ? worker.productionErrors
    : [];

  // Quality rounds
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(TEAL)
    .text("Quality Precaution Rounds", left, doc.y + 6);
  doc.moveDown(0.4);
  doc.fillColor(INK);
  if (!rounds.length) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text("No rounds recorded.");
  } else {
    pdfTable(
      doc,
      [
        { key: "date", label: "Date", width: 80 },
        { key: "area", label: "Area / Line", width: 130 },
        {
          key: "precautions",
          label: "Precautions",
          width: 90,
          color: (r) => (r.precautions === "yes" ? "#15803d" : "#dc2626"),
        },
        { key: "notes", label: "Notes", width: contentW - 300 },
      ],
      rounds.map((r) => ({
        date: r.date || "",
        area: r.area || "",
        precautions: r.precautions === "yes" ? "YES ✓" : "NO ✗",
        notes: r.notes || "",
      })),
      left,
      doc.y,
    );
  }

  doc.moveDown(1);

  // Production errors
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(TEAL)
    .text("Production Errors", left, doc.y + 6);
  doc.moveDown(0.4);
  doc.fillColor(INK);
  if (!errors.length) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text("No errors recorded.");
  } else {
    pdfTable(
      doc,
      [
        { key: "date", label: "Date", width: 70 },
        { key: "batchNumber", label: "Patch #", width: 80 },
        { key: "fieldLabel", label: "Field", width: 110 },
        { key: "description", label: "Description", width: contentW - 260 },
      ],
      errors.map((e) => ({
        date: e.date || "",
        batchNumber: e.batchNumber || "",
        fieldLabel: e.fieldLabel || "",
        description: e.description || "",
      })),
      left,
      doc.y,
    );
  }
}

function streamWorkersPdf(res, workers, filename) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
  workers.forEach((w, i) => renderWorkerPage(doc, w, i === 0));
  if (!workers.length) {
    doc.fontSize(14).text("No worker profiles to export.", { align: "center" });
  }
  doc.end();
}

/**
 * Distinct patch (batch) numbers for the lookup dropdown, newest first.
 * Returns [{ batchNumber, itemName }].
 */
async function loadPatchOptions() {
  const all = await Batch.getAll(); // already newest-first
  const seen = new Set();
  const out = [];
  all.forEach((b) => {
    const num = String(b.batchNumber || "").trim();
    if (!num || seen.has(num)) return;
    seen.add(num);
    out.push({ batchNumber: num, itemName: b.itemName || "" });
  });
  return out;
}

/* ── ROUTES ───────────────────────────────────────────────────────────────── */
/* NOTE: all static paths are declared BEFORE "/:id" so they are not swallowed. */

// Hub: list workers + add-worker form
router.get("/", async (req, res) => {
  try {
    const workers = await Worker.getAll();
    res.render("workers", {
      title: "Production Room Quality",
      workers,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("workers", {
      title: "Production Room Quality",
      workers: [],
      error: error.message,
      success: null,
    });
  }
});

// Create a worker
router.post("/", async (req, res) => {
  try {
    const { name, role } = req.body;
    const errors = Worker.validate({ name });
    if (errors.length) {
      const workers = await Worker.getAll();
      return res.render("workers", {
        title: "Production Room Quality",
        workers,
        error: errors.join(", "),
        success: null,
      });
    }
    const worker = await Worker.create({ name, role });
    await ActivityLog.log({
      action: "Worker Created",
      itemName: worker.name,
      itemType: "Worker",
    });
    res.redirect("/workers?success=Worker added successfully");
  } catch (error) {
    const workers = await Worker.getAll().catch(() => []);
    res.render("workers", {
      title: "Production Room Quality",
      workers,
      error: error.message,
      success: null,
    });
  }
});

// Record a precaution round
router.get("/quality", async (req, res) => {
  try {
    const workers = await Worker.getAll();
    res.render("quality", {
      title: "Record Quality Round",
      workers,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("quality", {
      title: "Record Quality Round",
      workers: [],
      error: error.message,
      success: null,
    });
  }
});

router.post("/quality", async (req, res) => {
  try {
    const { workerId, date, area, precautions, notes } = req.body;
    if (!workerId) throw new Error("Please choose a worker");
    await Worker.addQualityRound(workerId, { date, area, precautions, notes });
    const worker = await Worker.getById(workerId);
    await ActivityLog.log({
      action: `Quality round recorded (precautions: ${precautions === "yes" ? "yes" : "no"})`,
      itemName: worker ? worker.name : "Worker",
      itemType: "Worker",
    });
    res.redirect("/workers/" + workerId + "?success=Round recorded");
  } catch (error) {
    const workers = await Worker.getAll().catch(() => []);
    res.render("quality", {
      title: "Record Quality Round",
      workers,
      error: error.message,
      success: null,
    });
  }
});

// Record a production error against a batch + worker
router.get("/errors", async (req, res) => {
  try {
    const [workers, allBatches] = await Promise.all([
      Worker.getAll(),
      loadPatchOptions(),
    ]);
    const batchNumber = (req.query.batchNumber || "").trim();
    let batch = null;
    let batchFields = [];
    let lookupError = null;
    if (batchNumber) {
      batch = await Batch.getByNumber(batchNumber);
      if (batch) batchFields = await buildBatchFields(batch);
      else lookupError = `No patch found with number "${batchNumber}"`;
    }
    res.render("errors", {
      title: "Record Production Error",
      workers,
      allBatches,
      batchNumber,
      batch,
      batchFields,
      lookupError,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("errors", {
      title: "Record Production Error",
      workers: [],
      allBatches: [],
      batchNumber: "",
      batch: null,
      batchFields: [],
      lookupError: null,
      error: error.message,
      success: null,
    });
  }
});

router.post("/errors", async (req, res) => {
  try {
    const {
      workerId,
      batchNumber,
      batchId,
      fieldLabel,
      fieldValue,
      description,
      date,
    } = req.body;
    if (!workerId) throw new Error("Please choose a worker");
    await Worker.addError(workerId, {
      batchNumber,
      batchId: batchId || null,
      fieldLabel,
      fieldValue,
      description,
      date,
    });
    const worker = await Worker.getById(workerId);
    await ActivityLog.log({
      action: `Production error recorded for patch ${batchNumber || "?"}`,
      itemName: worker ? worker.name : "Worker",
      itemType: "Worker",
      batchNumber: batchNumber || null,
      notes: description || null,
    });
    res.redirect("/workers/" + workerId + "?success=Production error recorded");
  } catch (error) {
    const workers = await Worker.getAll().catch(() => []);
    const allBatches = await loadPatchOptions().catch(() => []);
    res.render("errors", {
      title: "Record Production Error",
      workers,
      allBatches,
      batchNumber: req.body.batchNumber || "",
      batch: null,
      batchFields: [],
      lookupError: null,
      error: error.message,
      success: null,
    });
  }
});

// Download ALL worker profiles as one PDF
router.get("/pdf/all", async (req, res) => {
  try {
    const workers = await Worker.getAll();
    streamWorkersPdf(res, workers, "all-worker-profiles.pdf");
  } catch (error) {
    res.status(500).send("Error generating PDF: " + error.message);
  }
});

// Download ONE worker profile as PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const worker = await Worker.getById(req.params.id);
    if (!worker) return res.status(404).send("Worker not found");
    streamWorkersPdf(res, [worker], `${safeFile(worker.name)}-profile.pdf`);
  } catch (error) {
    res.status(500).send("Error generating PDF: " + error.message);
  }
});

// Delete a worker
router.delete("/:id", async (req, res) => {
  try {
    const worker = await Worker.getById(req.params.id);
    await Worker.delete(req.params.id);
    if (worker)
      await ActivityLog.log({
        action: "Worker Deleted",
        itemName: worker.name,
        itemType: "Worker",
      });
    res.redirect("/workers?success=Worker deleted");
  } catch (error) {
    res.redirect("/workers");
  }
});

// Edit worker basic info (name / role)
router.put("/:id", async (req, res) => {
  try {
    await Worker.update(req.params.id, {
      name: req.body.name,
      role: req.body.role,
    });
    await ActivityLog.log({
      action: "Worker Updated",
      itemName: req.body.name || "Worker",
      itemType: "Worker",
    });
    res.redirect("/workers/" + req.params.id + "?success=Worker updated");
  } catch (error) {
    res.redirect("/workers/" + req.params.id);
  }
});

// Edit / delete a single quality round
router.put("/:id/rounds/:roundId", async (req, res) => {
  try {
    await Worker.updateRound(req.params.id, req.params.roundId, {
      date: req.body.date,
      area: req.body.area,
      precautions: req.body.precautions,
      notes: req.body.notes,
    });
    res.redirect("/workers/" + req.params.id + "?success=Round updated");
  } catch (error) {
    res.redirect("/workers/" + req.params.id);
  }
});

router.delete("/:id/rounds/:roundId", async (req, res) => {
  try {
    await Worker.deleteRound(req.params.id, req.params.roundId);
    res.redirect("/workers/" + req.params.id + "?success=Round deleted");
  } catch (error) {
    res.redirect("/workers/" + req.params.id);
  }
});

// Edit / delete a single production error
router.put("/:id/errors/:errorId", async (req, res) => {
  try {
    await Worker.updateError(req.params.id, req.params.errorId, {
      batchNumber: req.body.batchNumber,
      fieldLabel: req.body.fieldLabel,
      description: req.body.description,
      date: req.body.date,
    });
    res.redirect("/workers/" + req.params.id + "?success=Error updated");
  } catch (error) {
    res.redirect("/workers/" + req.params.id);
  }
});

router.delete("/:id/errors/:errorId", async (req, res) => {
  try {
    await Worker.deleteError(req.params.id, req.params.errorId);
    res.redirect("/workers/" + req.params.id + "?success=Error deleted");
  } catch (error) {
    res.redirect("/workers/" + req.params.id);
  }
});

// Worker profile (LAST — catches the remaining single-segment paths)
router.get("/:id", async (req, res) => {
  try {
    const worker = await Worker.getById(req.params.id);
    if (!worker)
      return res.status(404).render("error", {
        title: "Not Found",
        message: "Worker not found.",
      });
    res.render("worker-profile", {
      title: worker.name,
      worker,
      fmtDate,
      success: req.query.success || null,
    });
  } catch (error) {
    res.status(500).render("error", {
      title: "Server Error",
      message: error.message,
    });
  }
});

module.exports = router;
