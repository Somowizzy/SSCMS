const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, logAudit, createNotification } = require('../middleware/auth');

const router = express.Router();

// GET /api/shipping
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    let query = `
      SELECT s.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM shipments s
      LEFT JOIN users u ON s.created_by = u.id
    `;
    const params = [];
    if (status) { query += ' WHERE s.status = ?'; params.push(status); }
    query += ' ORDER BY s.created_at DESC';

    const shipments = db.prepare(query).all(...params);

    // Get items for each shipment
    const getItems = db.prepare('SELECT * FROM shipment_items WHERE shipment_id = ?');
    shipments.forEach(s => {
      s.items = getItems.all(s.id);
    });

    const stats = {
      total: shipments.length,
      pending: shipments.filter(s => s.status === 'pending').length,
      scheduled: shipments.filter(s => s.status === 'scheduled').length,
      inTransit: shipments.filter(s => s.status === 'in_transit').length,
      delivered: shipments.filter(s => s.status === 'delivered').length,
      totalItems: shipments.reduce((s, sh) => s + sh.total_items, 0)
    };

    res.json({ shipments, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shipping - Create shipment
router.post('/', authenticate, (req, res) => {
  try {
    const { customerName, destination, carrier, scheduledPickup, items, notes } = req.body;
    if (!customerName) return res.status(400).json({ error: 'Customer name required' });

    const db = getDb();
    const manifestNo = `MAN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    
    const totalItems = items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0;

    const result = db.prepare(`
      INSERT INTO shipments (manifest_no, customer_name, destination, carrier, scheduled_pickup, total_items, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(manifestNo, customerName, destination || '', carrier || '', scheduledPickup || null, totalItems, notes || '', req.user.id);

    // Add shipment items
    if (items && items.length > 0) {
      const insertItem = db.prepare('INSERT INTO shipment_items (shipment_id, finished_good_id, product_name, quantity) VALUES (?, ?, ?, ?)');
      items.forEach(item => {
        insertItem.run(result.lastInsertRowid, item.finishedGoodId || null, item.productName || '', item.quantity || 0);
      });
    }

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Shipment created', 'shipping',
      `Created shipment ${manifestNo} to ${customerName}`);

    // Notify admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'hr_admin'").all();
    admins.forEach(a => {
      createNotification(a.id, 'New Shipment Created',
        `Shipment ${manifestNo} to ${customerName} (${totalItems} items)`, 'info', '/shipping');
    });

    res.status(201).json({ id: result.lastInsertRowid, manifestNo, message: 'Shipment created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shipping/:id - Update shipment status
router.patch('/:id', authenticate, (req, res) => {
  try {
    const { status, carrier, scheduledPickup, notes } = req.body;
    const db = getDb();

    const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    const updates = [];
    const values = [];
    if (status) {
      updates.push('status = ?'); values.push(status);
      if (status === 'in_transit') updates.push('actual_pickup = CURRENT_TIMESTAMP');
      if (status === 'delivered') updates.push('delivery_date = CURRENT_TIMESTAMP');
    }
    if (carrier) { updates.push('carrier = ?'); values.push(carrier); }
    if (scheduledPickup) { updates.push('scheduled_pickup = ?'); values.push(scheduledPickup); }
    if (notes) { updates.push('notes = ?'); values.push(notes); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Shipment updated', 'shipping',
      `Updated shipment #${req.params.id} (${shipment.manifest_no}) - ${status || 'details updated'}`);

    res.json({ message: 'Shipment updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
