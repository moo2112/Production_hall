const express = require('express');
const router = express.Router();
const FormTemplate = require('../models/formTemplate');
const ActivityLog = require('../models/activityLog');

// ── GET /form-builder ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const templates = await FormTemplate.getAll();
    res.render('formBuilder', {
      title: 'Form Builder',
      templates,
      mandatoryFields: FormTemplate.MANDATORY_FIELDS,
      error: null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render('formBuilder', {
      title: 'Form Builder',
      templates: [],
      mandatoryFields: FormTemplate.MANDATORY_FIELDS,
      error: error.message,
      success: null,
    });
  }
});

// ── POST /form-builder ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { templateName, fieldsJson } = req.body;

    let fields = [];
    if (fieldsJson) {
      try { fields = JSON.parse(fieldsJson); } catch (e) { throw new Error('Invalid fields data'); }
    }

    const errors = FormTemplate.validate({ name: templateName });
    if (errors.length > 0) {
      const templates = await FormTemplate.getAll();
      return res.render('formBuilder', {
        title: 'Form Builder', templates,
        mandatoryFields: FormTemplate.MANDATORY_FIELDS,
        error: errors.join(', '), success: null,
      });
    }

    await FormTemplate.create({ name: templateName, fields });

    await ActivityLog.log({
      action:   'Form Template Created',
      itemName: templateName,
      itemType: 'FormTemplate',
    });

    res.redirect('/form-builder?success=Form template saved successfully');
  } catch (error) {
    const templates = await FormTemplate.getAll();
    res.render('formBuilder', {
      title: 'Form Builder', templates,
      mandatoryFields: FormTemplate.MANDATORY_FIELDS,
      error: error.message, success: null,
    });
  }
});

// ── GET /form-builder/:id (JSON) ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const template = await FormTemplate.getById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ ...template, mandatoryFields: FormTemplate.MANDATORY_FIELDS });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /form-builder/:id ──────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { templateName, fieldsJson } = req.body;
    let fields = [];
    if (fieldsJson) {
      try { fields = JSON.parse(fieldsJson); } catch (e) { throw new Error('Invalid fields data'); }
    }
    await FormTemplate.update(req.params.id, { name: templateName, fields });
    await ActivityLog.log({ action: 'Form Template Updated', itemName: templateName, itemType: 'FormTemplate' });
    res.redirect('/form-builder?success=Form template updated successfully');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /form-builder/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const template = await FormTemplate.getById(req.params.id);
    await FormTemplate.delete(req.params.id);
    if (template) {
      await ActivityLog.log({ action: 'Form Template Deleted', itemName: template.name, itemType: 'FormTemplate' });
    }
    res.redirect('/form-builder?success=Template deleted successfully');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
