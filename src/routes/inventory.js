const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize, logAudit, createNotification } = require('../middleware/auth');

const router = express.Router();

// GET /api/inventory - List all inventory with product details
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { category, search, lowStock } = req.query;
    
    let query = `
      SELECT i.*, p.name, p.description, p.category, p.unit, p.unit_price, p.reorder_level,
             s.name as supplier_name, s.id as supplier_id
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
    `;
    const conditions = [];
    const params = [];

    if (category) { conditions.push('p.category = ?'); params.push(category); }
    if (search) { conditions.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (lowStock === 'true') { conditions.push('i.quantity_on_hand <= p.reorder_level'); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.name';

    const items = db.prepare(query).all(...params);
    
    // Calculate summary stats
    const stats = {
      totalItems: items.length,
      totalValue: items.reduce((sum, i) => sum + (i.quantity_on_hand * i.unit_price), 0),
      lowStockCount: items.filter(i => i.quantity_on_hand <= i.reorder_level && i.quantity_on_hand > 0).length,
      outOfStockCount: items.filter(i => i.quantity_on_hand <= 0).length,
      inStockCount: items.filter(i => i.quantity_on_hand > i.reorder_level).length
    };

    res.json({ items, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/suppliers
router.get('/suppliers', authenticate, (req, res) => {
  try {
    const db = getDb();
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
    res.json({ suppliers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/suppliers
router.post('/suppliers', authenticate, authorize('hr_admin', 'dept_head'), (req, res) => {
  try {
    const { name, contactPerson, email, phone, address } = req.body;
    const db = getDb();
    const result = db.prepare('INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)')
      .run(name, contactPerson, email, phone, address);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Supplier added', 'inventory', `Added supplier: ${name}`);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Supplier added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory - Add new product with inventory
router.post('/', authenticate, authorize('hr_admin', 'dept_head', 'dept_user'), (req, res) => {
  try {
    const { name, description, category, unit, unitPrice, reorderLevel, supplierId, quantity, batchNo, location } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Name and category required' });

    const db = getDb();
    
    const productResult = db.prepare(`
      INSERT INTO products (name, description, category, unit, unit_price, reorder_level, supplier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, description || '', category, unit || 'kg', unitPrice || 0, reorderLevel || 10, supplierId || null);

    const invResult = db.prepare(`
      INSERT INTO inventory (product_id, quantity_on_hand, batch_no, location)
      VALUES (?, ?, ?, ?)
    `).run(productResult.lastInsertRowid, quantity || 0, batchNo || '', location || 'Warehouse');

    // Record stock movement
    if (quantity > 0) {
      db.prepare(`INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, performed_by, notes)
        VALUES (?, 'inbound', ?, 'initial_stock', ?, 'Initial stock entry')`).run(productResult.lastInsertRowid, quantity, req.user.id);
    }

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Product added', 'inventory', `Added ${name} with ${quantity || 0} ${unit || 'kg'}`);

    res.status(201).json({ productId: productResult.lastInsertRowid, inventoryId: invResult.lastInsertRowid, message: 'Product added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/:id - Update inventory item
router.patch('/:id', authenticate, (req, res) => {
  try {
    const { quantityOnHand, batchNo, location, name, description, unitPrice, reorderLevel, supplierId } = req.body;
    const db = getDb();

    const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Inventory item not found' });

    // Update inventory
    if (quantityOnHand !== undefined || batchNo || location) {
      const invUpdates = [];
      const invVals = [];
      if (quantityOnHand !== undefined) {
        invUpdates.push('quantity_on_hand = ?');
        invVals.push(quantityOnHand);
        // Log stock movement
        const diff = quantityOnHand - inv.quantity_on_hand;
        if (diff !== 0) {
          db.prepare(`INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, performed_by, notes)
            VALUES (?, ?, ?, 'manual_adjustment', ?, 'Manual stock adjustment')`).run(inv.product_id, diff > 0 ? 'inbound' : 'outbound', diff, req.user.id);
        }
      }
      if (batchNo) { invUpdates.push('batch_no = ?'); invVals.push(batchNo); }
      if (location) { invUpdates.push('location = ?'); invVals.push(location); }
      invUpdates.push('last_updated = CURRENT_TIMESTAMP');
      invVals.push(req.params.id);
      db.prepare(`UPDATE inventory SET ${invUpdates.join(', ')} WHERE id = ?`).run(...invVals);
    }

    // Update product info
    if (name || description || unitPrice !== undefined || reorderLevel !== undefined || supplierId !== undefined) {
      const prodUpdates = [];
      const prodVals = [];
      if (name) { prodUpdates.push('name = ?'); prodVals.push(name); }
      if (description) { prodUpdates.push('description = ?'); prodVals.push(description); }
      if (unitPrice !== undefined) { prodUpdates.push('unit_price = ?'); prodVals.push(unitPrice); }
      if (reorderLevel !== undefined) { prodUpdates.push('reorder_level = ?'); prodVals.push(reorderLevel); }
      if (supplierId !== undefined) { prodUpdates.push('supplier_id = ?'); prodVals.push(supplierId); }
      prodUpdates.push('updated_at = CURRENT_TIMESTAMP');
      prodVals.push(inv.product_id);
      db.prepare(`UPDATE products SET ${prodUpdates.join(', ')} WHERE id = ?`).run(...prodVals);
    }

    // Check for low stock alert
    if (quantityOnHand !== undefined) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(inv.product_id);
      if (quantityOnHand <= product.reorder_level) {
        // Notify warehouse head
        const dept = db.prepare('SELECT head_user_id FROM departments WHERE id = 1').get();
        if (dept) {
          createNotification(dept.head_user_id, 'Low Stock Alert', 
            `${product.name} is below reorder level (${quantityOnHand} ${product.unit} remaining)`, 'warning', '/inventory');
        }
      }
    }

    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Inventory updated', 'inventory', `Updated inventory #${req.params.id}`);
    res.json({ message: 'Inventory updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, authorize('hr_admin', 'dept_head'), (req, res) => {
  try {
    const db = getDb();
    const inv = db.prepare('SELECT i.*, p.name FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    
    db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(inv.product_id);
    
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`, 'Product deleted', 'inventory', `Deleted ${inv.name}`);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
