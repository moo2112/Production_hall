const express = require("express");
const router = express.Router();
const Batch = require("../models/batch");
const FormTemplate = require("../models/formTemplate");
const PrimaryProduct = require("../models/primaryProduct");
const SecondaryProduct = require("../models/secondaryProduct");
const TertiaryProduct = require("../models/tertiaryProduct");
const ActivityLog = require("../models/activityLog");

function toNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFieldKey(key) {
  let normalized = String(key || "").trim();
  while (normalized.startsWith("field_field_")) {
    normalized = normalized.replace(/^field_/, "");
  }
  return normalized;
}

function toFieldInputName(fieldId) {
  const id = String(fieldId || "").trim();
  if (!id) return "";
  return id.startsWith("field_") ? id : `field_${id}`;
}

function humanizeFieldKey(key) {
  return (
    String(key || "")
      .replace(/^field_/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || "Custom Field"
  );
}

function buildFieldVariants(fieldId) {
  const rawId = String(fieldId || "").trim();
  const inputName = toFieldInputName(rawId);
  return Array.from(
    new Set(
      [rawId, inputName, `field_${inputName}`]
        .filter(Boolean)
        .map(normalizeFieldKey),
    ),
  );
}

async function buildCustomFieldEntries(batch) {
  const rawFieldValues = batch.fieldValues || {};
  const normalizedFieldValues = {};

  Object.entries(rawFieldValues).forEach(([rawKey, value]) => {
    const normalizedKey = normalizeFieldKey(rawKey);
    normalizedFieldValues[normalizedKey] = value;
  });

  let template = null;
  if (batch.formTemplateId) {
    try {
      template = await FormTemplate.getById(batch.formTemplateId);
    } catch (error) {
      template = null;
    }
  }

  const entries = [];
  const usedKeys = new Set();
  const templateFields = template?.fields || [];

  templateFields.forEach((field) => {
    const variants = buildFieldVariants(field.id);
    const matchedKey = variants.find((key) =>
      Object.prototype.hasOwnProperty.call(normalizedFieldValues, key),
    );

    if (matchedKey) {
      usedKeys.add(matchedKey);
      entries.push({
        key: matchedKey,
        label: field.label || humanizeFieldKey(matchedKey),
        value: normalizedFieldValues[matchedKey],
        type: field.type || "text",
        required: Boolean(field.required),
      });
    }
  });

  Object.entries(normalizedFieldValues).forEach(([key, value]) => {
    if (!usedKeys.has(key)) {
      entries.push({
        key,
        label: humanizeFieldKey(key),
        value,
        type: "text",
        required: false,
      });
    }
  });

  return {
    templateName: template?.name || batch.formTemplateName || null,
    customFields: entries,
  };
}

/** Helper: load all products (primary + secondary + tertiary) into one flat list. */
async function loadAllProducts() {
  const [primary, secondary, tertiary] = await Promise.all([
    PrimaryProduct.getAll(),
    SecondaryProduct.getAll(),
    TertiaryProduct.getAll(),
  ]);
  return [
    ...primary.map((p) => ({ ...p, productType: "Primary" })),
    ...secondary.map((p) => ({ ...p, productType: "Secondary" })),
    ...tertiary.map((p) => ({ ...p, productType: "Tertiary" })),
  ];
}

async function buildBatchDetails(batchId) {
  const batch = await Batch.getById(batchId);
  if (!batch) return null;

  const [secondaryProducts, tertiaryProducts, customFieldData] =
    await Promise.all([
      SecondaryProduct.getAll(),
      TertiaryProduct.getAll(),
      buildCustomFieldEntries(batch),
    ]);

  const directProducts = [];
  const consumedByProducts = [];

  secondaryProducts.forEach((product) => {
    (product.batchStock || []).forEach((entry) => {
      if (entry.batchId === batchId) {
        directProducts.push({
          tier: "Secondary",
          productId: product.id,
          productName: product.name,
          batchNumber: entry.batchNumber,
          units: toNumber(entry.quantity),
          relationship: "Available stock in this batch",
        });
      }
    });
  });

  tertiaryProducts.forEach((product) => {
    (product.batchStock || []).forEach((entry) => {
      if (entry.batchId === batchId) {
        directProducts.push({
          tier: "Tertiary",
          productId: product.id,
          productName: product.name,
          batchNumber: entry.batchNumber,
          units: toNumber(entry.quantity),
          relationship: "Available stock in this batch",
        });
      }

      (entry.sourceBatches || []).forEach((source) => {
        if (source.batchId === batchId) {
          consumedByProducts.push({
            tier: "Tertiary",
            productId: product.id,
            productName: product.name,
            tertiaryBatchNumber: entry.batchNumber,
            sourceProductName:
              source.secondaryProductName || source.productName,
            sourceBatchNumber: source.batchNumber,
            units: toNumber(source.quantity),
            relationship: "Consumed as secondary input for this tertiary batch",
          });
        }
      });
    });
  });

  const alreadyHasLinkedProduct = directProducts.some(
    (item) => item.productId === batch.itemId && item.tier === batch.itemType,
  );

  if (
    batch.itemId &&
    ["Secondary", "Tertiary"].includes(batch.itemType) &&
    !alreadyHasLinkedProduct
  ) {
    directProducts.unshift({
      tier: batch.itemType,
      productId: batch.itemId,
      productName: batch.itemName,
      batchNumber: batch.batchNumber,
      units: 0,
      relationship:
        "Batch record linked to this product. No available batch stock has been credited yet.",
    });
  }

  return {
    batch,
    templateName: customFieldData.templateName,
    customFields: customFieldData.customFields,
    directProducts,
    consumedByProducts,
    totals: {
      directUnits: directProducts.reduce(
        (sum, item) => sum + toNumber(item.units),
        0,
      ),
      consumedUnits: consumedByProducts.reduce(
        (sum, item) => sum + toNumber(item.units),
        0,
      ),
    },
  };
}

// ── GET /batch ────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [batches, templates, allProducts] = await Promise.all([
      Batch.getAll(),
      FormTemplate.getAll(),
      loadAllProducts(),
    ]);

    res.render("batch", {
      title: "Batch Management",
      batches,
      templates,
      allProducts,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("batch", {
      title: "Batch Management",
      batches: [],
      templates: [],
      allProducts: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /batch ───────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      batchNumber,
      itemId,
      itemName,
      itemType,
      formTemplateId,
      formTemplateName,
    } = req.body;

    // Collect dynamic field values from body.
    // Form-builder fields already use IDs such as field_177..., so normalize
    // legacy double-prefixed names like field_field_177... into field_177... .
    const fieldValues = {};
    for (const key of Object.keys(req.body)) {
      if (key.startsWith("field_")) {
        fieldValues[normalizeFieldKey(key)] = req.body[key];
      }
    }

    const errors = Batch.validate({ batchNumber, itemId });
    if (errors.length > 0) {
      const [batches, templates, allProducts] = await Promise.all([
        Batch.getAll(),
        FormTemplate.getAll(),
        loadAllProducts(),
      ]);
      return res.render("batch", {
        title: "Batch Management",
        batches,
        templates,
        allProducts,
        error: errors.join(", "),
        success: null,
      });
    }

    await Batch.create({
      batchNumber,
      itemId,
      itemName,
      itemType,
      formTemplateId,
      formTemplateName,
      fieldValues,
    });

    await ActivityLog.log({
      action: "Batch Created",
      itemName,
      itemType,
      batchNumber,
      notes: `Template: ${formTemplateName || "None"}`,
    });

    res.redirect("/batch?success=Batch recorded successfully");
  } catch (error) {
    const [batches, templates, allProducts] = await Promise.all([
      Batch.getAll(),
      FormTemplate.getAll(),
      loadAllProducts(),
    ]);
    res.render("batch", {
      title: "Batch Management",
      batches,
      templates,
      allProducts,
      error: error.message,
      success: null,
    });
  }
});

// ── DELETE /batch/:id ─────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const batch = await Batch.getById(req.params.id);
    await Batch.delete(req.params.id);

    if (batch) {
      await ActivityLog.log({
        action: "Batch Deleted",
        itemName: batch.itemName,
        itemType: batch.itemType,
        batchNumber: batch.batchNumber,
      });
    }

    res.redirect("/batch?success=Batch deleted successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /batch/api/all ───────────────────────────────────────────────────────
// Returns all batches as JSON (used by secondary/tertiary forms for batch selector)
router.get("/api/all", async (req, res) => {
  try {
    const batches = await Batch.getAll();
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /batch/api/:id/details ───────────────────────────────────────────────
// Returns the clicked batch plus all secondary/tertiary product relationships.
router.get("/api/:id/details", async (req, res) => {
  try {
    const details = await buildBatchDetails(req.params.id);
    if (!details) return res.status(404).json({ error: "Batch not found" });
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
