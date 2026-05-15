const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize, logAudit } = require('../middleware/auth');

const router = express.Router();

// GET /api/departments
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const departments = db.prepare(`
      SELECT d.*, u.first_name || ' ' || u.last_name as head_name, u.email as head_email
      FROM departments d
      LEFT JOIN users u ON d.head_user_id = u.id
      ORDER BY d.id
    `).all();
    res.json({ departments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments - Create department
router.post('/', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO departments (name, description) VALUES (?, ?)'
    ).run(name, description || '');
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Department created', 'departments', `Created department: ${name}`);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Department created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Department deleted', 'departments', `Deleted department #${req.params.id}`);
    res.json({ message: 'Department deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/departments/:id - Update department (assign head)
router.patch('/:id', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const { name, description, headUserId } = req.body;
    const db = getDb();

    const updates = [];
    const values = [];
    if (name) { updates.push('name = ?'); values.push(name); }
    if (description) { updates.push('description = ?'); values.push(description); }
    if (headUserId !== undefined) { updates.push('head_user_id = ?'); values.push(headUserId); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Department updated', 'departments', `Updated department #${req.params.id}`);
    res.json({ message: 'Department updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
