const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - Get audit logs
// Optional query params:
//   ?module=<name>       — filter by module (e.g. 'inventory')
//   ?departmentId=<id>   — only entries by users in that department
//   ?limit=<n>           — cap rows (default 100)
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { module, limit, departmentId } = req.query;

    // Always join users so we can apply a department-based filter and also
    // surface the actor's department alongside each log entry. LEFT JOIN
    // keeps system-generated rows (user_id null) visible when unfiltered.
    let query = `
      SELECT a.*, u.department_id as actor_department_id
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
    `;
    const conditions = [];
    const params = [];

    if (module) { conditions.push('a.module = ?'); params.push(module); }
    if (departmentId) { conditions.push('u.department_id = ?'); params.push(parseInt(departmentId)); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY a.created_at DESC';
    if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
    else       { query += ' LIMIT 100'; }

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
