const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'sscms.db');

let db;
let sqlJsDb;

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
        try {
          const stmt = database.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          const result = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return result;
        } catch (err) {
          throw err;
        }
      },
      all(...params) {
        try {
          const results = [];
          const stmt = database.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (err) {
          throw err;
        }
      },
      run(...params) {
        try {
          database.run(sql, params);
          const lastId = database.exec("SELECT last_insert_rowid() as id")[0];
          const changesResult = database.exec("SELECT changes() as c")[0];
          const lastInsertRowid = lastId ? lastId.values[0][0] : 0;
          const changes = changesResult ? changesResult.values[0][0] : 0;
          // Persist after each write operation
          saveDatabase();
          return { lastInsertRowid, changes };
        } catch (err) {
          throw err;
        }
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

function saveDatabase() {
  if (!sqlJsDb) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = sqlJsDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save database:', err);
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
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlJsDb = new SQL.Database(fileBuffer);
  } else {
    sqlJsDb = new SQL.Database();
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

  console.log('  ✓ Database initialized successfully');
  return db;
}

// Synchronous wrapper for backward compatibility
function initDatabase() {
  // This is called synchronously in server.js, but sql.js init is async.
  // We return a promise that server.js must await.
  return initDatabaseAsync();
}

module.exports = { getDb, initDatabase };
