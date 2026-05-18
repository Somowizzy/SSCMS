const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'sscms.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_NEON = !!DATABASE_URL;

let db;
let sqlJsDb;
let pgPool = null;

// Debounced/periodic flush state for Neon snapshot persistence
let flushTimer = null;
let periodicTimer = null;
let flushing = false;
let pendingFlush = false;
let dirty = false;

/**
 * Compatibility wrapper around sql.js to match the better-sqlite3 API.
 * This allows all existing route code to work without changes.
 */
class BetterSqlite3Compat {
  constructor(sqlJsDatabase) {
    this._db = sqlJsDatabase;
  }

  prepare(sql) {
    const database = this._db;
    return {
      get(...params) {
        const stmt = database.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return result;
      },
      all(...params) {
        const results = [];
        const stmt = database.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
      run(...params) {
        database.run(sql, params);
        const lastId = database.exec("SELECT last_insert_rowid() as id")[0];
        const changesResult = database.exec("SELECT changes() as c")[0];
        const lastInsertRowid = lastId ? lastId.values[0][0] : 0;
        const changes = changesResult ? changesResult.values[0][0] : 0;
        // Persist after each write operation
        saveDatabase();
        return { lastInsertRowid, changes };
      }
    };
  }

  exec(sql) {
    this._db.run(sql);
    saveDatabase();
  }

  pragma(pragmaStr) {
    try {
      this._db.run(`PRAGMA ${pragmaStr}`);
    } catch (e) {
      // Ignore pragma errors (WAL mode not supported in sql.js)
    }
  }
}

/**
 * Persist the in-memory database.
 * - Neon mode: schedule a debounced async snapshot upload (non-blocking).
 * - Local mode: write the .db file to disk (original behaviour).
 */
function saveDatabase() {
  if (!sqlJsDb) return;

  if (USE_NEON) {
    dirty = true;
    scheduleNeonFlush();
    return;
  }

  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = sqlJsDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

function scheduleNeonFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  // Debounce: wait for a brief lull in writes, then upload the snapshot.
  flushTimer = setTimeout(() => { flushToNeon().catch(() => {}); }, 1500);
}

async function flushToNeon() {
  if (!USE_NEON || !sqlJsDb || !pgPool || !dirty) return;
  if (flushing) { pendingFlush = true; return; }
  flushing = true;
  dirty = false;
  try {
    const buffer = Buffer.from(sqlJsDb.export());
    await pgPool.query(
      `INSERT INTO db_snapshot (id, data, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [buffer]
    );
  } catch (err) {
    dirty = true; // retry on next cycle
    console.error('Neon snapshot flush failed:', err.message);
  } finally {
    flushing = false;
    if (pendingFlush) {
      pendingFlush = false;
      scheduleNeonFlush();
    }
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

async function initDatabaseAsync() {
  const SQL = await initSqlJs();

  if (USE_NEON) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });

    // Ensure the snapshot table exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS db_snapshot (
        id INTEGER PRIMARY KEY,
        data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Load the existing snapshot, or start fresh (server.js will seed it)
    const { rows } = await pgPool.query('SELECT data FROM db_snapshot WHERE id = 1');
    if (rows.length && rows[0].data) {
      sqlJsDb = new SQL.Database(new Uint8Array(rows[0].data));
      console.log('  ✓ Database restored from Neon snapshot');
    } else {
      sqlJsDb = new SQL.Database();
      console.log('  ✓ No Neon snapshot found — starting fresh');
    }

    // Safety net: periodic flush in case writes never pause
    periodicTimer = setInterval(() => { flushToNeon().catch(() => {}); }, 20000);
    if (periodicTimer.unref) periodicTimer.unref();
  } else {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(DB_PATH)) {
      sqlJsDb = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      sqlJsDb = new SQL.Database();
    }
  }

  db = new BetterSqlite3Compat(sqlJsDb);
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Departments table
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      head_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('hr_admin','dept_head','dept_user','system_admin')),
      department_id INTEGER,
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    -- Suppliers table
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products / Raw Materials table
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('raw_material','finished_good','packaging','spare_part')),
      unit TEXT NOT NULL DEFAULT 'kg',
      unit_price REAL DEFAULT 0,
      reorder_level INTEGER DEFAULT 10,
      supplier_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    -- Inventory table
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity_on_hand REAL DEFAULT 0,
      batch_no TEXT,
      location TEXT DEFAULT 'Warehouse',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Requests table
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      request_type TEXT NOT NULL CHECK(request_type IN ('material_requisition','production_run','transfer_to_fg','shipping_request','stock_adjustment')),
      department_id INTEGER NOT NULL,
      target_department_id INTEGER,
      product_id INTEGER,
      quantity REAL,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','in_progress','completed','cancelled')),
      notes TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Approvals table
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      approver_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('approved','rejected')),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES requests(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );

    -- Production Jobs table
    CREATE TABLE IF NOT EXISTS production_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      machine TEXT,
      quantity_requested REAL DEFAULT 0,
      quantity_completed REAL DEFAULT 0,
      defects REAL DEFAULT 0,
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','paused','cancelled')),
      priority TEXT DEFAULT 'normal',
      scheduled_date DATE,
      start_time DATETIME,
      end_time DATETIME,
      created_by INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Finished Goods table
    CREATE TABLE IF NOT EXISTS finished_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      production_job_id INTEGER,
      quantity REAL DEFAULT 0,
      batch_no TEXT,
      quality_status TEXT DEFAULT 'pending' CHECK(quality_status IN ('pending','passed','failed','under_review')),
      location TEXT DEFAULT 'Finished Goods Warehouse',
      available_for_shipping INTEGER DEFAULT 0,
      produced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (production_job_id) REFERENCES production_jobs(id)
    );

    -- Shipments table
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manifest_no TEXT NOT NULL UNIQUE,
      customer_name TEXT,
      destination TEXT,
      carrier TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','scheduled','in_transit','delivered','cancelled')),
      scheduled_pickup DATETIME,
      actual_pickup DATETIME,
      delivery_date DATETIME,
      total_items INTEGER DEFAULT 0,
      total_weight REAL DEFAULT 0,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Shipment Items table
    CREATE TABLE IF NOT EXISTS shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      finished_good_id INTEGER,
      product_name TEXT,
      quantity REAL DEFAULT 0,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id),
      FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id)
    );

    -- Audit Logs table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      module TEXT,
      detail TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','success','error','approval')),
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Stock Movement History (for AI forecasting)
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('inbound','outbound','adjustment','production_consumption','production_output')),
      quantity REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      performed_by INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (performed_by) REFERENCES users(id)
    );
  `);

  console.log(`  ✓ Database initialized successfully (${USE_NEON ? 'Neon-persisted' : 'local file'})`);
  return db;
}

// Synchronous wrapper for backward compatibility
function initDatabase() {
  // This is called synchronously in server.js, but sql.js init is async.
  // We return a promise that server.js must await.
  return initDatabaseAsync();
}

/**
 * Flush any pending changes and close the pool. Called on graceful shutdown
 * (Render sends SIGTERM before a deploy) so the latest data reaches Neon.
 */
async function closeDatabase() {
  if (flushTimer) clearTimeout(flushTimer);
  if (periodicTimer) clearInterval(periodicTimer);
  if (USE_NEON) {
    try { await flushToNeon(); } catch (e) { /* best effort */ }
    try { if (pgPool) await pgPool.end(); } catch (e) { /* ignore */ }
  }
}

module.exports = { getDb, initDatabase, closeDatabase };
