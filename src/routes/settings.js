const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize, logAudit } = require('../middleware/auth');

const router = express.Router();

const DEFAULTS = {
  company: {
    name: 'Preform & Cap Mfg. Ltd',
    industry: 'Plastics Manufacturing',
    timezone: 'Africa/Lagos (WAT, UTC+1)',
    currency: 'Nigerian Naira (₦)',
  },
  notifications: {
    lowStock: true, machineDowntime: true, rpet: true,
    aiForecast: true, orderDelay: true, dailyDigest: false,
  },
  security: {
    twoFactor: false, sessionTimeout: '4 hours', auditRetention: '12 months',
  },
  ai: { enabled: true, horizonWeeks: 6, autoReorder: false },
  integrations: { sapErp: false, sageX3: false, slack: false },
};

function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) {
      base[k] = deepMerge(base[k] || {}, over[k]);
    } else base[k] = over[k];
  }
  return base;
}

function readSettings() {
  const db = getDb();
  let row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run(JSON.stringify(DEFAULTS));
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  let stored;
  try { stored = JSON.parse(row.data || '{}'); } catch { stored = {}; }
  return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), stored);
}

// GET /api/settings — current settings (defaults merged in for any new keys)
router.get('/', authenticate, (req, res) => {
  try {
    res.json({ settings: readSettings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings — deep-merge the partial payload into the stored blob.
// Admin-only (hr_admin / system_admin).
router.patch('/', authenticate, authorize('hr_admin', 'system_admin'), (req, res) => {
  try {
    const db = getDb();
    const current = readSettings();
    const incoming = req.body || {};
    const merged = deepMerge(current, incoming);
    const data = JSON.stringify(merged);
    db.prepare(`
      INSERT INTO settings (id, data, updated_by) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(data, req.user.id);
    logAudit(req.user.id, `${req.user.first_name} ${req.user.last_name}`,
      'Settings updated', 'settings',
      `Updated keys: ${Object.keys(incoming).join(', ') || '(none)'}`);
    res.json({ settings: merged, message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
