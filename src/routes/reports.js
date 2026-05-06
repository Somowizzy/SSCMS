const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { getDemandForecast, getAnomalies, getReorderSuggestions } = require('../services/ai');

const router = express.Router();

// GET /api/reports/dashboard - Main dashboard data
router.get('/dashboard', authenticate, (req, res) => {
  try {
    const db = getDb();

    // Inventory stats
    const inventoryStats = db.prepare(`
      SELECT 
        COUNT(*) as totalProducts,
        SUM(i.quantity_on_hand * p.unit_price) as totalValue,
        SUM(CASE WHEN i.quantity_on_hand <= p.reorder_level AND i.quantity_on_hand > 0 THEN 1 ELSE 0 END) as lowStock,
        SUM(CASE WHEN i.quantity_on_hand <= 0 THEN 1 ELSE 0 END) as outOfStock
      FROM inventory i JOIN products p ON i.product_id = p.id
    `).get();

    const activeSuppliers = db.prepare("SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'").get();

    // Production stats
    const productionStats = db.prepare(`
      SELECT
        COUNT(*) as totalJobs,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
        SUM(quantity_requested) as totalRequested,
        SUM(quantity_completed) as totalCompleted,
        SUM(defects) as totalDefects
      FROM production_jobs
    `).get();

    // Finished goods stats
    const fgStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(quantity) as totalQuantity,
        SUM(CASE WHEN quality_status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN quality_status = 'pending' THEN 1 ELSE 0 END) as pendingQC,
        SUM(CASE WHEN available_for_shipping = 1 THEN quantity ELSE 0 END) as readyToShip
      FROM finished_goods
    `).get();

    // Shipping stats
    const shippingStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as inTransit,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(total_items) as totalItemsShipped
      FROM shipments
    `).get();

    // Request stats
    const requestStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM requests
    `).get();

    // User stats
    const userStats = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active FROM users
    `).get();

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10
    `).all();

    // AI insights
    let aiInsights = {};
    try {
      aiInsights = {
        forecast: getDemandForecast(),
        anomalies: getAnomalies(),
        reorderSuggestions: getReorderSuggestions()
      };
    } catch (e) {
      aiInsights = { forecast: [], anomalies: [], reorderSuggestions: [] };
    }

    res.json({
      inventory: { ...inventoryStats, activeSuppliers: activeSuppliers.count },
      production: productionStats,
      finishedGoods: fgStats,
      shipping: shippingStats,
      requests: requestStats,
      users: userStats,
      recentActivity,
      aiInsights
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/stock-levels
router.get('/stock-levels', authenticate, (req, res) => {
  try {
    const db = getDb();
    const data = db.prepare(`
      SELECT p.name, p.category, p.unit, p.reorder_level, p.unit_price,
             i.quantity_on_hand, i.batch_no, i.location,
             s.name as supplier_name,
             CASE 
               WHEN i.quantity_on_hand <= 0 THEN 'Out of Stock'
               WHEN i.quantity_on_hand <= p.reorder_level THEN 'Low Stock'
               ELSE 'In Stock'
             END as status
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY 
        CASE WHEN i.quantity_on_hand <= 0 THEN 0 WHEN i.quantity_on_hand <= p.reorder_level THEN 1 ELSE 2 END,
        p.name
    `).all();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/forecast
router.get('/forecast', authenticate, (req, res) => {
  try {
    const forecast = getDemandForecast();
    res.json({ forecast });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/export/:type - CSV export
router.get('/export/:type', authenticate, (req, res) => {
  try {
    const db = getDb();
    let data, filename, headers;

    switch (req.params.type) {
      case 'inventory':
        data = db.prepare(`
          SELECT p.name as "Product Name", p.category as "Category", p.unit as "Unit",
                 i.quantity_on_hand as "Quantity", p.unit_price as "Unit Price",
                 (i.quantity_on_hand * p.unit_price) as "Total Value",
                 i.batch_no as "Batch No", i.location as "Location",
                 s.name as "Supplier"
          FROM inventory i JOIN products p ON i.product_id = p.id
          LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.name
        `).all();
        filename = 'inventory_report.csv';
        break;

      case 'production':
        data = db.prepare(`
          SELECT product_name as "Product", machine as "Machine",
                 quantity_requested as "Qty Requested", quantity_completed as "Qty Completed",
                 defects as "Defects", status as "Status", scheduled_date as "Scheduled Date"
          FROM production_jobs ORDER BY created_at DESC
        `).all();
        filename = 'production_report.csv';
        break;

      case 'finished-goods':
        data = db.prepare(`
          SELECT product_name as "Product", quantity as "Quantity", batch_no as "Batch No",
                 quality_status as "Quality Status", 
                 CASE WHEN available_for_shipping THEN 'Yes' ELSE 'No' END as "Available for Shipping",
                 produced_at as "Produced At"
          FROM finished_goods ORDER BY created_at DESC
        `).all();
        filename = 'finished_goods_report.csv';
        break;

      case 'shipments':
        data = db.prepare(`
          SELECT manifest_no as "Manifest No", customer_name as "Customer", destination as "Destination",
                 carrier as "Carrier", status as "Status", total_items as "Total Items",
                 scheduled_pickup as "Scheduled Pickup"
          FROM shipments ORDER BY created_at DESC
        `).all();
        filename = 'shipments_report.csv';
        break;

      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    // Convert to CSV
    if (data.length === 0) return res.status(404).json({ error: 'No data to export' });
    
    headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
