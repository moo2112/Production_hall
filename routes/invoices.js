const express = require("express");
const router = express.Router();
const Invoice = require("../models/invoice");
const TertiaryProduct = require("../models/tertiaryProduct");
const ActivityLog = require("../models/activityLog");

function parseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ── GET /invoices — list + create form ───────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const Client = require("../models/client");
    const Bridge = require("../models/bridge");
    const [invoices, tertiary, clients, bridges] = await Promise.all([
      Invoice.getAll(),
      TertiaryProduct.getAll().catch(() => []),
      Client.getAll().catch(() => []),
      Bridge.getAll().catch(() => []),
    ]);
    const nextNumber = await Invoice.nextNumber();
    res.render("invoices", {
      title: "Invoices",
      invoices,
      tertiaryProducts: tertiary,
      clients,
      bridges,
      nextNumber,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("invoices", {
      title: "Invoices",
      invoices: [],
      tertiaryProducts: [],
      clients: [],
      bridges: [],
      nextNumber: "",
      error: error.message,
      success: null,
    });
  }
});

// ── POST /invoices — create ──────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      itemsJson,
      taxRate,
      notes,
      date,
      dueDate,
    } = req.body;
    const items = parseJson(itemsJson, []);
    const data = {
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        address: customerAddress,
      },
      items,
      taxRate,
      notes,
      date,
      dueDate,
    };
    const errors = Invoice.validate(data);
    if (errors.length) throw new Error(errors.join(", "));
    const inv = await Invoice.create(data);
    // Optionally save the client for reuse later.
    if (req.body.saveClient === "on" || req.body.saveClient === "true") {
      try {
        const Client = require("../models/client");
        await Client.upsertByName({
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress,
        });
      } catch (_) {
        /* non-critical */
      }
    }
    await ActivityLog.log({
      action: "Invoice Created",
      itemName: `${inv.invoiceNumber} — ${inv.customer.name}`,
      itemType: "Invoice",
      quantity: inv.total,
    });
    res.redirect(
      "/invoices?success=" +
        encodeURIComponent(
          "Invoice " +
            inv.invoiceNumber +
            " created. It will appear as a task when you start a production day.",
        ),
    );
  } catch (error) {
    res.redirect("/invoices?error=" + encodeURIComponent(error.message));
  }
});

// ── GET /invoices/:id/plan — batch allocation plan (FIFO by production date) ──
// Tells the user which batch to take from first, how much, and what's short.
router.get("/:id/plan", async (req, res) => {
  try {
    const inv = await Invoice.getById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    const flat = Invoice.expandItems(inv.items || []);
    const items = [];
    for (const item of flat) {
      if (!item.productId) {
        items.push({
          productName: item.productName,
          quantity: item.quantity,
          viaBridge: item.viaBridge,

          unlinked: true,
          allocations: [],
          shortfall: item.quantity,
          fulfillable: false,
        });
        continue;
      }
      try {
        const plan = await TertiaryProduct.planSale(
          item.productId,
          item.quantity,
        );
        items.push({
          productName: item.productName,
          quantity: item.quantity,
          viaBridge: item.viaBridge,
          ...plan,
        });
      } catch (e) {
        items.push({
          productName: item.productName,
          quantity: item.quantity,
          error: e.message,
          allocations: [],
          shortfall: item.quantity,
          fulfillable: false,
        });
      }
    }
    res.json({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer,
      items,
      fulfillable: items.every((i) => i.fulfillable),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /invoices/:id/status — change status ────────────────────────────────
router.post("/:id/status", async (req, res) => {
  try {
    await Invoice.updateStatus(req.params.id, req.body.status);
    res.redirect("/invoices?success=Invoice status updated");
  } catch (error) {
    res.redirect("/invoices?error=" + encodeURIComponent(error.message));
  }
});

// ── DELETE /invoices/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await Invoice.delete(req.params.id);
    res.redirect("/invoices?success=Invoice deleted");
  } catch (error) {
    res.redirect("/invoices?error=" + encodeURIComponent(error.message));
  }
});

// ── GET /invoices/:id/pdf — printable invoice (PDFKit) ───────────────────────
router.get("/:id/pdf", async (req, res) => {
  try {
    const inv = await Invoice.getById(req.params.id);
    if (!inv) return res.status(404).send("Invoice not found");

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${inv.invoiceNumber}.pdf"`,
    );
    doc.pipe(res);

    // Header
    doc.fontSize(22).fillColor("#1e3a5f").text("INVOICE", { align: "right" });
    doc
      .fontSize(10)
      .fillColor("#666")
      .text(inv.invoiceNumber, { align: "right" });
    doc.moveDown(0.5);
    doc.fillColor("#1e3a5f").fontSize(16).text("Production Hall", 50, 50);
    doc
      .fillColor("#666")
      .fontSize(10)
      .text("Multi-level Production Management", 50, 72);

    doc.moveDown(2);
    const top = 120;
    doc.fillColor("#000").fontSize(11).text("Bill To:", 50, top);
    doc
      .fontSize(10)
      .fillColor("#333")
      .text(inv.customer.name || "", 50, top + 16)
      .text(inv.customer.phone || "", 50, top + 30)
      .text(inv.customer.email || "", 50, top + 44)
      .text(inv.customer.address || "", 50, top + 58, { width: 240 });

    doc
      .fontSize(10)
      .fillColor("#333")
      .text("Date: " + (inv.date || ""), 350, top + 16)
      .text("Due: " + (inv.dueDate || "—"), 350, top + 30)
      .text("Status: " + (inv.status || ""), 350, top + 44);

    // Table header
    let y = top + 100;
    doc.fontSize(10).fillColor("#fff").rect(50, y, 500, 20).fill("#2d6a9f");
    doc
      .fillColor("#fff")
      .text("Item", 56, y + 5)
      .text("Qty", 320, y + 5)
      .text("Unit Price", 380, y + 5)
      .text("Line Total", 470, y + 5);
    y += 24;

    doc.fillColor("#000");
    (inv.items || []).forEach((it) => {
      doc
        .fontSize(10)
        .text(it.productName, 56, y, { width: 250 })
        .text(String(it.quantity), 320, y)
        .text(Number(it.unitPrice).toFixed(2), 380, y)
        .text(Number(it.lineTotal).toFixed(2), 470, y);
      y += 20;
    });

    // Totals
    y += 10;
    doc.moveTo(350, y).lineTo(550, y).stroke("#ccc");
    y += 8;
    doc
      .fontSize(10)
      .text("Subtotal:", 380, y)
      .text(Number(inv.subtotal).toFixed(2), 470, y);
    y += 16;
    doc
      .text(`Tax (${inv.taxRate || 0}%):`, 380, y)
      .text(Number(inv.taxAmount).toFixed(2), 470, y);
    y += 16;
    doc
      .fontSize(12)
      .fillColor("#1e3a5f")
      .text("Total:", 380, y)
      .text(Number(inv.total).toFixed(2), 470, y);

    if (inv.notes) {
      doc
        .moveDown(3)
        .fillColor("#666")
        .fontSize(9)
        .text("Notes: " + inv.notes, 50, y + 40, { width: 500 });
    }

    doc.end();
  } catch (error) {
    res.status(500).send("Error generating PDF: " + error.message);
  }
});

module.exports = router;
