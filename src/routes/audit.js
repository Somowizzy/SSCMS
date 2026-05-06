const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - Get audit logs
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { module, limit } = req.query;
    let query = 'SELECT * FROM audit_logs';
    const params = [];
    if (module) { query += ' WHERE module = ?'; params.push(module); }
    query += ' ORDER BY created_at DESC';
    if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
    else { query += ' LIMIT 100'; }

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
