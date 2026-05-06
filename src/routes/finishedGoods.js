const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, logAudit, createNotification } = require('../middleware/auth');

const router = express.Router();

// GET /api/finished-goods
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare(`
      SELECT fg.*, pj.machine, pj.quantity_requested as job_qty_requested
      FROM finished_goods fg
      LEFT JOIN production_jobs pj ON fg.production_job_id = pj.id
      ORDER BY fg.created_at DESC
    `).all();

    const stats = {
      total: items.length,
      totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
      passed: items.filter(i => i.quality_status === 'passed').length,
      pending: items.filter(i => i.quality_status === 'pending').length,
      pendingQC: items.filter(i => i.quality_status === 'pending' || i.quality_status === 'under_review').length,
      failed: items.filter(i => i.quality_status === 'failed' || i.quality_status === 'rejected').length,
      rejectedCount: items.filter(i => i.quality_status === 'failed' || i.quality_status === 'rejected').length,
      availableForShipping: items.filter(i => i.available_for_shipping).length,
      readyToShip: items.filter(i => i.available_for_shipping).reduce((s, i) => s + i.quantity, 0)
    };

    res.json({ items, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finished-goods
router.post('/', authenticate, (req, res) => {
  try {
    const { productName, quantity, batchNo, qualityStatus, productionJobId } = req.body;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO finished_goods (product_name, production_job_id, quantity, batch_no, quality_status)
      VALUES (?, ?, ?, ?, ?)
    `).run(productName, productionJobId || null, quantity || 0, batchNo || `FG-${Date.now()}`, qualityStatus || 'pending');

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Finished good added', 'finished_goods', `Added ${productName} (${quantity} units)`);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Finished good record created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/finished-goods/:id - Update (quality status, shipping availability)
router.patch('/:id', authenticate, (req, res) => {
  try {
    const { qualityStatus, availableForShipping, quantity } = req.body;
    const db = getDb();

    const fg = db.prepare('SELECT * FROM finished_goods WHERE id = ?').get(req.params.id);
    if (!fg) return res.status(404).json({ error: 'Not found' });

    const updates = [];
    const values = [];
    if (qualityStatus) { updates.push('quality_status = ?'); values.push(qualityStatus); }
    if (availableForShipping !== undefined) { updates.push('available_for_shipping = ?'); values.push(availableForShipping ? 1 : 0); }
    if (quantity !== undefined) { updates.push('quantity = ?'); values.push(quantity); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE finished_goods SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (qualityStatus === 'passed') {
      db.prepare('UPDATE finished_goods SET available_for_shipping = 1 WHERE id = ?').run(req.params.id);
      // Notify shipping head
      const shippingDept = db.prepare('SELECT head_user_id FROM departments WHERE id = 4').get();
      if (shippingDept) {
        createNotification(shippingDept.head_user_id, 'Goods Ready for Shipping',
          `${fg.product_name}: ${fg.quantity} units passed quality check`, 'success', '/finished-goods');
      }
    }

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Finished good updated', 'finished_goods',
      `Updated FG #${req.params.id} - quality: ${qualityStatus || fg.quality_status}`);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/finished-goods/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM finished_goods WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Finished good deleted', 'finished_goods', `Deleted FG #${req.params.id}`);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
