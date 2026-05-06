const { getDb } = require('../db/database');

/**
 * AI Service - Demand Forecasting, Anomaly Detection, and Reorder Suggestions
 * Uses simple heuristic models based on historical stock movement data.
 * Architecture allows future replacement with advanced ML models.
 */

// Simple Moving Average forecast
function getDemandForecast() {
  try {
    const db = getDb();
    
    // Get products with stock movement history
    const products = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.unit, p.reorder_level, i.quantity_on_hand
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.category = 'raw_material'
    `).all();

    const forecasts = products.map(product => {
      // Get daily consumption over last 30 days
      const movements = db.prepare(`
        SELECT 
          DATE(created_at) as date,
          SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as daily_consumption,
          SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as daily_inbound
        FROM stock_movements
        WHERE product_id = ? AND created_at >= DATE('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date
      `).all(product.id);

      if (movements.length === 0) return null;

      // Calculate average daily consumption
      const totalConsumption = movements.reduce((s, m) => s + m.daily_consumption, 0);
      const avgDailyConsumption = totalConsumption / Math.max(movements.length, 1);
      
      // Calculate trend (is consumption increasing or decreasing?)
      const recentConsumption = movements.slice(-7).reduce((s, m) => s + m.daily_consumption, 0) / Math.min(7, movements.length);
      const olderConsumption = movements.slice(0, -7).reduce((s, m) => s + m.daily_consumption, 0) / Math.max(movements.length - 7, 1);
      const trend = olderConsumption > 0 ? ((recentConsumption - olderConsumption) / olderConsumption) * 100 : 0;

      // Forecast next 7 days consumption
      const forecastDaily = avgDailyConsumption * (1 + trend / 100);
      const forecast7Day = Math.round(forecastDaily * 7);
      
      // Days until stockout
      const daysUntilStockout = avgDailyConsumption > 0 
        ? Math.round(product.quantity_on_hand / avgDailyConsumption) 
        : 999;

      // Suggested reorder quantity
      const safetyStock = Math.round(avgDailyConsumption * 7); // 7 days safety stock
      const reorderQty = Math.max(0, Math.round(forecast7Day + safetyStock - product.quantity_on_hand));

      return {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        currentStock: product.quantity_on_hand,
        avgDailyConsumption: Math.round(avgDailyConsumption * 10) / 10,
        trend: Math.round(trend * 10) / 10,
        trendDirection: trend > 5 ? 'increasing' : trend < -5 ? 'decreasing' : 'stable',
        forecast7Day,
        daysUntilStockout,
        suggestedReorderQty: reorderQty,
        riskLevel: daysUntilStockout <= 3 ? 'critical' : daysUntilStockout <= 7 ? 'high' : daysUntilStockout <= 14 ? 'medium' : 'low'
      };
    }).filter(Boolean);

    return forecasts;
  } catch (err) {
    console.error('Forecast error:', err);
    return [];
  }
}

// Anomaly Detection - identifies unusual patterns
function getAnomalies() {
  try {
    const db = getDb();
    const anomalies = [];

    // Check for unusual stock movements (> 2 standard deviations from mean)
    const products = db.prepare(`
      SELECT DISTINCT product_id FROM stock_movements WHERE created_at >= DATE('now', '-30 days')
    `).all();

    products.forEach(({ product_id }) => {
      const stats = db.prepare(`
        SELECT AVG(ABS(quantity)) as avg_qty, 
               AVG(ABS(quantity) * ABS(quantity)) as avg_qty_sq
        FROM stock_movements 
        WHERE product_id = ? AND created_at >= DATE('now', '-30 days')
      `).get(product_id);

      if (!stats || !stats.avg_qty) return;

      const stdDev = Math.sqrt(Math.max(0, stats.avg_qty_sq - stats.avg_qty * stats.avg_qty));
      const threshold = stats.avg_qty + 2 * stdDev;

      const unusual = db.prepare(`
        SELECT sm.*, p.name as product_name
        FROM stock_movements sm 
        JOIN products p ON sm.product_id = p.id
        WHERE sm.product_id = ? AND ABS(sm.quantity) > ? AND sm.created_at >= DATE('now', '-7 days')
        ORDER BY sm.created_at DESC LIMIT 5
      `).all(product_id, threshold);

      unusual.forEach(m => {
        anomalies.push({
          type: 'unusual_movement',
          severity: Math.abs(m.quantity) > threshold * 1.5 ? 'high' : 'medium',
          productName: m.product_name,
          detail: `Unusual ${m.movement_type} of ${Math.abs(m.quantity)} units (avg: ${Math.round(stats.avg_qty)})`,
          date: m.created_at
        });
      });
    });

    // Check for products with rapid depletion
    const rapidDepletion = db.prepare(`
      SELECT p.name, i.quantity_on_hand, p.reorder_level,
             (SELECT SUM(ABS(quantity)) FROM stock_movements 
              WHERE product_id = p.id AND quantity < 0 AND created_at >= DATE('now', '-3 days')) as recent_consumption
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE i.quantity_on_hand > 0
    `).all();

    rapidDepletion.forEach(item => {
      if (item.recent_consumption && item.recent_consumption > item.quantity_on_hand * 0.5) {
        anomalies.push({
          type: 'rapid_depletion',
          severity: 'high',
          productName: item.name,
          detail: `Consumed ${Math.round(item.recent_consumption)} units in 3 days (${Math.round(item.quantity_on_hand)} remaining)`,
          date: new Date().toISOString()
        });
      }
    });

    return anomalies;
  } catch (err) {
    console.error('Anomaly detection error:', err);
    return [];
  }
}

// Reorder Suggestions
function getReorderSuggestions() {
  try {
    const db = getDb();
    const suggestions = db.prepare(`
      SELECT p.id, p.name, p.unit, p.reorder_level, p.unit_price,
             i.quantity_on_hand, s.name as supplier_name
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE i.quantity_on_hand <= p.reorder_level
      ORDER BY (i.quantity_on_hand * 1.0 / NULLIF(p.reorder_level, 0)) ASC
    `).all();

    return suggestions.map(s => ({
      productId: s.id,
      productName: s.name,
      unit: s.unit,
      currentStock: s.quantity_on_hand,
      reorderLevel: s.reorder_level,
      suggestedQty: Math.max(s.reorder_level * 2 - s.quantity_on_hand, s.reorder_level),
      estimatedCost: Math.round((Math.max(s.reorder_level * 2 - s.quantity_on_hand, s.reorder_level)) * s.unit_price),
      supplier: s.supplier_name,
      urgency: s.quantity_on_hand <= 0 ? 'critical' : s.quantity_on_hand <= s.reorder_level * 0.5 ? 'high' : 'medium'
    }));
  } catch (err) {
    console.error('Reorder suggestion error:', err);
    return [];
  }
}

module.exports = { getDemandForecast, getAnomalies, getReorderSuggestions };
