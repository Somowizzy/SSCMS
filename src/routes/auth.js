const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticate, logAudit, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const user = db.prepare(`
      SELECT u.*, d.name as department_name 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      WHERE u.email = ?
    `).get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated. Contact HR admin.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role, departmentId: user.department_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    logAudit(user.id, `${user.first_name} ${user.last_name}`, 'Login', 'auth', `User logged in from ${req.ip}`);

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        departmentId: user.department_id,
        departmentName: user.department_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Logout', 'auth', 'User logged out');
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.department_id, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(req.user.id);

  res.json({
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name
    }
  });
});

// POST /api/auth/reset-request - Request a password reset (public endpoint)
router.post('/reset-request', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getDb();
    const user = db.prepare('SELECT id, first_name, last_name, email FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());

    // Always respond success to prevent email enumeration
    if (user) {
      // Notify all HR admins
      const { createNotification } = require('../middleware/auth');
      const admins = db.prepare("SELECT id FROM users WHERE role = 'hr_admin' AND is_active = 1").all();
      admins.forEach(admin => {
        createNotification(
          admin.id,
          'Password Reset Requested',
          `${user.first_name} ${user.last_name} (${user.email}) has requested a password reset`,
          'warning',
          '/users'
        );
      });
      logAudit(user.id, `${user.first_name} ${user.last_name}`, 'Password reset requested', 'auth', `User requested password reset from login page`);
    }

    res.json({ message: 'If the email exists, HR Admin has been notified' });
  } catch (err) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: 'Failed to process reset request' });
  }
});

module.exports = router;
