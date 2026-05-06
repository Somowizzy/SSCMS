const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authenticate, authorize, logAudit } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - List all users
router.get('/', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department_id, 
             u.is_active, u.last_login, u.created_at, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department_id,
             u.is_active, u.last_login, u.created_at, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Create new user
router.post('/', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const { firstName, lastName, email, password, role, departmentId } = req.body;
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, email, password_hash, role, department_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(firstName, lastName, email.toLowerCase(), hash, role, departmentId || null);

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'User created', 'users', `Created user ${firstName} ${lastName} (${role})`);

    res.status(201).json({ id: result.lastInsertRowid, message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id - Update user
router.patch('/:id', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const { firstName, lastName, email, role, departmentId, isActive, password } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const values = [];

    if (firstName) { updates.push('first_name = ?'); values.push(firstName); }
    if (lastName) { updates.push('last_name = ?'); values.push(lastName); }
    if (email) { updates.push('email = ?'); values.push(email.toLowerCase()); }
    if (role) { updates.push('role = ?'); values.push(role); }
    if (departmentId !== undefined) { updates.push('department_id = ?'); values.push(departmentId); }
    if (isActive !== undefined) { updates.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (password) {
      const salt = bcrypt.genSaltSync(10);
      updates.push('password_hash = ?');
      values.push(bcrypt.hashSync(password, salt));
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'User updated', 'users', `Updated user #${req.params.id}`);

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - Deactivate user
router.delete('/:id', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'User deactivated', 'users', `Deactivated user #${req.params.id}`);
    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
