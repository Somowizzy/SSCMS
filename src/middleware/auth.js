const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'sscms-secret-key-preform-2025';

// Verify JWT token middleware
function authenticate(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, first_name, last_name, email, role, department_id, is_active FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Role-based authorization middleware
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Check if user is department head for the given department
function isDepartmentHead(departmentId) {
  return (req, res, next) => {
    if (req.user.role === 'hr_admin' || req.user.role === 'system_admin') {
      return next(); // Admins can do anything
    }
    
    const db = getDb();
    const dept = db.prepare('SELECT head_user_id FROM departments WHERE id = ?').get(departmentId || req.body.department_id || req.params.departmentId);
    
    if (!dept || dept.head_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the department head can perform this action' });
    }
    next();
  };
}

// Audit logging helper
function logAudit(userId, userName, action, module, detail) {
  const db = getDb();
  db.prepare('INSERT INTO audit_logs (user_id, user_name, action, module, detail) VALUES (?, ?, ?, ?, ?)')
    .run(userId, userName, action, module, detail);
}

// Create notification helper
function createNotification(userId, title, message, type = 'info', link = null) {
  const db = getDb();
  db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)')
    .run(userId, title, message, type, link);
}

module.exports = { authenticate, authorize, isDepartmentHead, logAudit, createNotification, JWT_SECRET };
