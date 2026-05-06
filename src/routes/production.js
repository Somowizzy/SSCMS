const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, logAudit, createNotification } = require('../middleware/auth');

const router = express.Router();

// GET /api/production - List production jobs
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    let query = `
      SELECT pj.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM production_jobs pj
      LEFT JOIN users u ON pj.created_by = u.id
    `;
    if (status) {
      query += ' WHERE pj.status = ?';
      const jobs = db.prepare(query + ' ORDER BY pj.created_at DESC').all(status);
      return res.json({ jobs });
    }
    const jobs = db.prepare(query + ' ORDER BY pj.created_at DESC').all();

    const stats = {
      total: jobs.length,
      scheduled: jobs.filter(j => j.status === 'scheduled').length,
      inProgress: jobs.filter(j => j.status === 'in_progress').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      totalRequested: jobs.reduce((s, j) => s + j.quantity_requested, 0),
      totalCompleted: jobs.reduce((s, j) => s + j.quantity_completed, 0),
      totalDefects: jobs.reduce((s, j) => s + j.defects, 0)
    };

    res.json({ jobs, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/production - Create production job
router.post('/', authenticate, (req, res) => {
  try {
    const { productName, productId, machine, quantityRequested, priority, scheduledDate, notes } = req.body;
    if (!productName) return res.status(400).json({ error: 'Product name is required' });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO production_jobs (product_name, product_id, machine, quantity_requested, priority, scheduled_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productName, productId || null, machine || '', quantityRequested || 0, priority || 'normal', scheduledDate || null, notes || '', req.user.id);

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Production job created', 'production',
      `Created job for ${productName} (${quantityRequested} units)`);

    // Notify production head
    const dept = db.prepare('SELECT head_user_id FROM departments WHERE id = 2').get();
    if (dept && dept.head_user_id && dept.head_user_id !== req.user.id) {
      createNotification(dept.head_user_id, 'New Production Job', 
        `${req.user.first_name} created a production job for ${productName}`, 'info', '/production');
    }

    res.status(201).json({ id: result.lastInsertRowid, message: 'Production job created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/production/:id - Update production job
router.patch('/:id', authenticate, (req, res) => {
  try {
    const { status, quantityCompleted, defects, machine, notes } = req.body;
    const db = getDb();

    const job = db.prepare('SELECT * FROM production_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?'); values.push(status);
      if (status === 'in_progress' && job.status === 'scheduled') {
        updates.push('start_time = CURRENT_TIMESTAMP');
      }
      if (status === 'completed') {
        updates.push('end_time = CURRENT_TIMESTAMP');
      }
    }
    if (quantityCompleted !== undefined) { updates.push('quantity_completed = ?'); values.push(quantityCompleted); }
    if (defects !== undefined) { updates.push('defects = ?'); values.push(defects); }
    if (machine) { updates.push('machine = ?'); values.push(machine); }
    if (notes) { updates.push('notes = ?'); values.push(notes); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE production_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // If completed, create finished goods entry and notify
    if (status === 'completed') {
      const finalQty = quantityCompleted || job.quantity_completed;
      const finalDefects = defects || job.defects;
      const goodQty = finalQty - finalDefects;
      
      db.prepare(`INSERT INTO finished_goods (product_name, production_job_id, quantity, batch_no, quality_status)
        VALUES (?, ?, ?, ?, 'pending')`)
        .run(job.product_name, job.id, goodQty, `FG-${Date.now()}`);

      // Notify finished goods head
      const fgDept = db.prepare('SELECT head_user_id FROM departments WHERE id = 3').get();
      if (fgDept) {
        createNotification(fgDept.head_user_id, 'Production Completed',
          `${job.product_name}: ${goodQty} units ready for quality check`, 'success', '/finished-goods');
      }

      // Notify admins
      const admins = db.prepare("SELECT id FROM users WHERE role = 'hr_admin'").all();
      admins.forEach(a => {
        createNotification(a.id, 'Production Completed',
          `Job #${job.id} (${job.product_name}) completed: ${goodQty} good units`, 'success', '/production');
      });
    }

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Production job updated', 'production',
      `Updated job #${req.params.id} - status: ${status || job.status}`);

    res.json({ message: 'Production job updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/production/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    db.prepare("UPDATE production_jobs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Production job cancelled', 'production', `Cancelled job #${req.params.id}`);
    res.json({ message: 'Production job cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
