const express = require('express');
const router = express.Router();
const Batch = require('../models/batch');
const FormTemplate = require('../models/formTemplate');
const PrimaryProduct = require('../models/primaryProduct');
const SecondaryProduct = require('../models/secondaryProduct');
const TertiaryProduct = require('../models/tertiaryProduct');
const ActivityLog = require('../models/activityLog');

/** Helper: load all products (primary + secondary + tertiary) into one flat list. */
async function loadAllProducts() {
  const [primary, secondary, tertiary] = await Promise.all([
    PrimaryProduct.getAll(),
    SecondaryProduct.getAll(),
    TertiaryProduct.getAll(),
  ]);
  return [
    ...primary.map(p => ({ ...p, productType: 'Primary' })),
    ...secondary.map(p => ({ ...p, productType: 'Secondary' })),
    ...tertiary.map(p => ({ ...p, productType: 'Tertiary' })),
  ];
}

// ── GET /batch ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [batches, templates, allProducts] = await Promise.all([
      Batch.getAll(),
      FormTemplate.getAll(),
      loadAllProducts(),
    ]);

    res.render('batch', {
      title: 'Batch Management',
      batches,
      templates,
      allProducts,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render('batch', {
      title: 'Batch Management',
      batches: [],
      templates: [],
      allProducts: [],
      error: error.message,
      success: null,
    });
  }
});

// ── POST /batch ───────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { batchNumber, itemId, itemName, itemType, formTemplateId, formTemplateName } = req.body;

    // Collect dynamic field values from body (all keys starting with 'field_')
    const fieldValues = {};
    for (const key of Object.keys(req.body)) {
      if (key.startsWith('field_')) {
        fieldValues[key] = req.body[key];
      }
    }

    const errors = Batch.validate({ batchNumber, itemId });
    if (errors.length > 0) {
      const [batches, templates, allProducts] = await Promise.all([
        Batch.getAll(), FormTemplate.getAll(), loadAllProducts(),
      ]);
      return res.render('batch', {
        title: 'Batch Management', batches, templates, allProducts,
        error: errors.join(', '), success: null,
      });
    }

    await Batch.create({ batchNumber, itemId, itemName, itemType, formTemplateId, formTemplateName, fieldValues });

    await ActivityLog.log({
      action:      'Batch Created',
      itemName,
      itemType,
      batchNumber,
      notes: `Template: ${formTemplateName || 'None'}`,
    });

    res.redirect('/batch?success=Batch recorded successfully');
  } catch (error) {
    const [batches, templates, allProducts] = await Promise.all([
      Batch.getAll(), FormTemplate.getAll(), loadAllProducts(),
    ]);
    res.render('batch', {
      title: 'Batch Management', batches, templates, allProducts,
      error: error.message, success: null,
    });
  }
});

// ── DELETE /batch/:id ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const batch = await Batch.getById(req.params.id);
    await Batch.delete(req.params.id);

    if (batch) {
      await ActivityLog.log({
        action:      'Batch Deleted',
        itemName:    batch.itemName,
        itemType:    batch.itemType,
        batchNumber: batch.batchNumber,
      });
    }

    res.redirect('/batch?success=Batch deleted successfully');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /batch/api/all ─────────────────────────────────────────────────────────
// Returns all batches as JSON (used by secondary/tertiary forms for batch selector)
router.get('/api/all', async (req, res) => {
  try {
    const batches = await Batch.getAll();
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
