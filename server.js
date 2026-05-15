const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const { initDatabase } = require('./src/db/database');
const { seedDatabase } = require('./src/db/seed');

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const departmentRoutes = require('./src/routes/departments');
const inventoryRoutes = require('./src/routes/inventory');
const requestRoutes = require('./src/routes/requests');
const productionRoutes = require('./src/routes/production');
const finishedGoodsRoutes = require('./src/routes/finishedGoods');
const shippingRoutes = require('./src/routes/shipping');
const reportRoutes = require('./src/routes/reports');
const auditRoutes = require('./src/routes/audit');
const notificationRoutes = require('./src/routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;

// Gzip all responses
app.use(compression());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Serve all public assets with ETag revalidation — browsers check freshness
// on every request but get a fast 304 when unchanged. Avoids stale JS/CSS
// being served from a long-lived cache after a deploy.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/finished-goods', finishedGoodsRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);

// Return JSON 404 for undefined API routes (prevents HTML being returned for missing endpoints)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    seedDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  ╔══════════════════════════════════════════════╗`);
      console.log(`  ║   SSCMS - Smart Supply Chain Management     ║`);
      console.log(`  ║   Server running on port ${PORT}                ║`);
      console.log(`  ╚══════════════════════════════════════════════╝\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
