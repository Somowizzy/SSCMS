const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, logAudit, createNotification } = require('../middleware/auth');

const router = express.Router();

// GET /api/requests
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { status, type, department } = req.query;
    
    let query = `
      SELECT r.*, 
             u.first_name || ' ' || u.last_name as requester_name,
             d.name as department_name,
             td.name as target_department_name,
             p.name as product_name, p.unit as product_unit
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      LEFT JOIN departments td ON r.target_department_id = td.id
      LEFT JOIN products p ON r.product_id = p.id
    `;

    const conditions = [];
    const params = [];

    // Filter by role: dept users see their own, dept heads see their dept's, admins see all
    if (req.user.role === 'dept_user') {
      conditions.push('r.requester_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'dept_head') {
      conditions.push('(r.department_id = ? OR r.target_department_id = ? OR r.requester_id = ?)');
      params.push(req.user.department_id, req.user.department_id, req.user.id);
    }

    if (status) { conditions.push('r.status = ?'); params.push(status); }
    if (type) { conditions.push('r.request_type = ?'); params.push(type); }
    if (department) { conditions.push('(r.department_id = ? OR r.target_department_id = ?)'); params.push(department, department); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.created_at DESC';

    const requests = db.prepare(query).all(...params);

    // Get approval info for each request
    const getApprovals = db.prepare(`
      SELECT a.*, u.first_name || ' ' || u.last_name as approver_name
      FROM approvals a JOIN users u ON a.approver_id = u.id
      WHERE a.request_id = ?
    `);
    
    requests.forEach(r => {
      r.approvals = getApprovals.all(r.id);
    });

    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests - Create new request
router.post('/', authenticate, (req, res) => {
  try {
    const { requestType, targetDepartmentId, productId, quantity, priority, notes } = req.body;
    if (!requestType) return res.status(400).json({ error: 'Request type is required' });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO requests (requester_id, request_type, department_id, target_department_id, product_id, quantity, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, requestType, req.user.department_id, targetDepartmentId || null, productId || null, quantity || 0, priority || 'normal', notes || '');

    // Notify department head of target department
    const targetDeptId = targetDepartmentId || req.user.department_id;
    const dept = db.prepare('SELECT head_user_id, name FROM departments WHERE id = ?').get(targetDeptId);
    if (dept && dept.head_user_id) {
      createNotification(
        dept.head_user_id,
        'New Request Pending Approval',
        `${req.user.first_name} ${req.user.last_name} submitted a ${requestType.replace(/_/g, ' ')} request`,
        'approval',
        '/requests'
      );
    }

    // Also notify HR admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'hr_admin' AND is_active = 1").all();
    admins.forEach(admin => {
      if (admin.id !== req.user.id) {
        createNotification(admin.id, 'New Request', 
          `${req.user.first_name} ${req.user.last_name} submitted a ${requestType.replace(/_/g, ' ')} request to ${dept?.name || 'department'}`,
          'info', '/requests');
      }
    });

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Request created', 'requests', 
      `Created ${requestType} request #${result.lastInsertRowid}`);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Request submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id/approve - Approve or reject request
router.patch('/:id/approve', authenticate, (req, res) => {
  try {
    const { action, comment } = req.body;
    if (!action || !['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approved or rejected' });
    }

    const db = getDb();
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is no longer pending' });

    // Check if user has authority to approve
    const targetDeptId = request.target_department_id || request.department_id;
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(targetDeptId);
    
    const isAuthorized = req.user.role === 'hr_admin' || req.user.role === 'system_admin' ||
      (req.user.role === 'dept_head' && dept && dept.head_user_id === req.user.id);

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Only the department head or admin can approve/reject requests' });
    }

    // Create approval record
    db.prepare('INSERT INTO approvals (request_id, approver_id, action, comment) VALUES (?, ?, ?, ?)')
      .run(req.params.id, req.user.id, action, comment || '');

    // Update request status
    db.prepare('UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(action, req.params.id);

    // If approved, handle downstream actions
    if (action === 'approved') {
      if (request.request_type === 'material_requisition' && request.product_id) {
        // Deduct from inventory
        const inv = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(request.product_id);
        if (inv) {
          const newQty = Math.max(0, inv.quantity_on_hand - request.quantity);
          db.prepare('UPDATE inventory SET quantity_on_hand = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newQty, inv.id);
          db.prepare(`INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, performed_by, notes)
            VALUES (?, 'outbound', ?, 'request_approved', ?, ?, 'Material requisition approved')`)
            .run(request.product_id, -request.quantity, request.id, req.user.id);
        }
      }
    }

    // Notify requester
    createNotification(
      request.requester_id,
      `Request ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      `Your ${request.request_type.replace(/_/g, ' ')} request has been ${action} by ${req.user.first_name} ${req.user.last_name}`,
      action === 'approved' ? 'success' : 'error',
      '/requests'
    );

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, `Request ${action}`, 'requests',
      `${action} request #${req.params.id}${comment ? ': ' + comment : ''}`);

    res.json({ message: `Request ${action} successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
