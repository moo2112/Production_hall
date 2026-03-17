const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/activityLog');

// ── GET /timeline ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const logs = await ActivityLog.getAll();
    res.render('timeline', {
      title: 'Activity Timeline',
      logs,
      error: null,
    });
  } catch (error) {
    res.render('timeline', {
      title: 'Activity Timeline',
      logs: [],
      error: error.message,
    });
  }
});

module.exports = router;
