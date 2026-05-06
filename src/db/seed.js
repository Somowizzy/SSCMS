const bcrypt = require('bcryptjs');
const { getDb } = require('./database');

function seedDatabase() {
  const db = getDb();

  // Check if already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    console.log('  ✓ Database already seeded');
    return;
  }

  console.log('  → Seeding database...');

  // Create departments
  const insertDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
  const depts = [
    ['Raw Materials', 'Manages raw material inventory, receiving, and warehouse operations'],
    ['Production', 'Manages production scheduling, machine operations, and manufacturing'],
    ['Finished Goods', 'Manages finished product inventory, quality checks, and storage'],
    ['Shipping', 'Manages shipment manifests, delivery scheduling, and dispatch'],
    ['HR & Administration', 'Manages personnel, roles, and system administration']
  ];
  depts.forEach(d => insertDept.run(d[0], d[1]));

  // Create users with hashed passwords
  const salt = bcrypt.genSaltSync(10);
  const insertUser = db.prepare(`
    INSERT INTO users (first_name, last_name, email, password_hash, role, department_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const users = [
    ['Admin', 'System', 'admin@sscms.com', bcrypt.hashSync('admin123', salt), 'hr_admin', 5],
    ['Oluwatobi', 'Somoye', 'tobi@sscms.com', bcrypt.hashSync('tobi123', salt), 'hr_admin', 5],
    ['Adewale', 'Okonkwo', 'adewale@sscms.com', bcrypt.hashSync('adewale123', salt), 'dept_head', 1],
    ['Chioma', 'Nwankwo', 'chioma@sscms.com', bcrypt.hashSync('chioma123', salt), 'dept_head', 2],
    ['Emeka', 'Okafor', 'emeka@sscms.com', bcrypt.hashSync('emeka123', salt), 'dept_head', 3],
    ['Fatima', 'Bello', 'fatima@sscms.com', bcrypt.hashSync('fatima123', salt), 'dept_head', 4],
    ['Yusuf', 'Ibrahim', 'yusuf@sscms.com', bcrypt.hashSync('yusuf123', salt), 'dept_user', 1],
    ['Ngozi', 'Eze', 'ngozi@sscms.com', bcrypt.hashSync('ngozi123', salt), 'dept_user', 2],
    ['Tunde', 'Bakare', 'tunde@sscms.com', bcrypt.hashSync('tunde123', salt), 'dept_user', 3],
    ['Aisha', 'Mohammed', 'aisha@sscms.com', bcrypt.hashSync('aisha123', salt), 'dept_user', 4]
  ];
  users.forEach(u => insertUser.run(...u));

  // Update department heads
  db.prepare('UPDATE departments SET head_user_id = 3 WHERE id = 1').run();
  db.prepare('UPDATE departments SET head_user_id = 4 WHERE id = 2').run();
  db.prepare('UPDATE departments SET head_user_id = 5 WHERE id = 3').run();
  db.prepare('UPDATE departments SET head_user_id = 6 WHERE id = 4').run();
  db.prepare('UPDATE departments SET head_user_id = 1 WHERE id = 5').run();

  // Create suppliers
  const insertSupplier = db.prepare('INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)');
  const suppliers = [
    ['PET Resin Nigeria Ltd', 'Mr. Adebayo', 'contact@petresin.ng', '+234-801-234-5678', 'Lagos, Nigeria'],
    ['Colorant Masters Co.', 'Mrs. Olumide', 'sales@colorantmasters.com', '+234-802-345-6789', 'Ibadan, Nigeria'],
    ['Packaging Solutions Int.', 'Mr. Chen Wei', 'info@packsol.com', '+86-21-5678-9012', 'Shanghai, China'],
    ['Closure Systems Africa', 'Ms. Fatima', 'orders@closuresys.co.za', '+27-11-234-5678', 'Johannesburg, SA'],
    ['Nigerian Chemical Supply', 'Dr. Emeka', 'supply@nichemsupply.ng', '+234-803-456-7890', 'Port Harcourt, Nigeria']
  ];
  suppliers.forEach(s => insertSupplier.run(...s));

  // Create products (raw materials)
  const insertProduct = db.prepare(`
    INSERT INTO products (name, description, category, unit, unit_price, reorder_level, supplier_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const products = [
    ['PET Resin (Grade A)', 'High-grade polyethylene terephthalate resin for preform production', 'raw_material', 'kg', 850.00, 500, 1],
    ['PET Resin (Grade B)', 'Standard PET resin for standard preforms', 'raw_material', 'kg', 720.00, 300, 1],
    ['HDPE Granules', 'High-density polyethylene for cap production', 'raw_material', 'kg', 650.00, 200, 1],
    ['PP Granules', 'Polypropylene granules for closure production', 'raw_material', 'kg', 580.00, 200, 1],
    ['Blue Colorant Master Batch', 'Blue color master batch for tinted preforms', 'raw_material', 'kg', 1200.00, 50, 2],
    ['Green Colorant Master Batch', 'Green color master batch', 'raw_material', 'kg', 1150.00, 50, 2],
    ['White Colorant Master Batch', 'White titanium dioxide master batch for caps', 'raw_material', 'kg', 980.00, 80, 2],
    ['Lubricant Additive', 'Processing lubricant for injection molding', 'raw_material', 'litre', 2500.00, 20, 5],
    ['Anti-static Agent', 'Anti-static additive for PET processing', 'raw_material', 'kg', 3200.00, 10, 5],
    ['Packaging Film', 'Shrink wrap film for finished goods packaging', 'packaging', 'roll', 4500.00, 30, 3],
    ['Carton Boxes (Large)', 'Large carton boxes for preform packaging', 'packaging', 'pcs', 350.00, 100, 3],
    ['Carton Boxes (Small)', 'Small carton boxes for cap packaging', 'packaging', 'pcs', 250.00, 150, 3]
  ];
  products.forEach(p => insertProduct.run(...p));

  // Create inventory records
  const insertInventory = db.prepare('INSERT INTO inventory (product_id, quantity_on_hand, batch_no, location) VALUES (?, ?, ?, ?)');
  const inventoryItems = [
    [1, 2500, 'BATCH-PET-A-001', 'Warehouse A'],
    [2, 1800, 'BATCH-PET-B-001', 'Warehouse A'],
    [3, 950, 'BATCH-HDPE-001', 'Warehouse A'],
    [4, 1200, 'BATCH-PP-001', 'Warehouse A'],
    [5, 120, 'BATCH-BLUE-001', 'Warehouse B'],
    [6, 85, 'BATCH-GREEN-001', 'Warehouse B'],
    [7, 200, 'BATCH-WHITE-001', 'Warehouse B'],
    [8, 45, 'BATCH-LUB-001', 'Chemical Store'],
    [9, 8, 'BATCH-ANTI-001', 'Chemical Store'],
    [10, 75, 'BATCH-FILM-001', 'Packaging Store'],
    [11, 250, 'BATCH-CTNL-001', 'Packaging Store'],
    [12, 400, 'BATCH-CTNS-001', 'Packaging Store']
  ];
  inventoryItems.forEach(i => insertInventory.run(...i));

  // Create some production jobs
  const insertJob = db.prepare(`
    INSERT INTO production_jobs (product_name, machine, quantity_requested, quantity_completed, defects, status, priority, scheduled_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const jobs = [
    ['28mm Preform (Clear)', 'Injection Mold M1', 50000, 50000, 120, 'completed', 'high', '2025-10-01', 4],
    ['38mm Preform (Blue)', 'Injection Mold M2', 30000, 28500, 85, 'in_progress', 'normal', '2025-10-03', 4],
    ['28mm Cap (White)', 'Cap Mold C1', 60000, 0, 0, 'scheduled', 'high', '2025-10-05', 4],
    ['38mm Preform (Clear)', 'Injection Mold M1', 40000, 40000, 95, 'completed', 'normal', '2025-09-28', 4],
    ['28mm Cap (Red)', 'Cap Mold C2', 25000, 12000, 30, 'in_progress', 'urgent', '2025-10-02', 4]
  ];
  jobs.forEach(j => insertJob.run(...j));

  // Create finished goods
  const insertFG = db.prepare(`
    INSERT INTO finished_goods (product_name, production_job_id, quantity, batch_no, quality_status, available_for_shipping)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const fgItems = [
    ['28mm Preform (Clear)', 1, 49880, 'FG-PF28C-001', 'passed', 1],
    ['38mm Preform (Clear)', 4, 39905, 'FG-PF38C-001', 'passed', 1],
    ['28mm Preform (Blue)', null, 15000, 'FG-PF28B-001', 'under_review', 0],
    ['28mm Cap (White)', null, 35000, 'FG-CP28W-001', 'passed', 1]
  ];
  fgItems.forEach(f => insertFG.run(...f));

  // Create shipments
  const insertShipment = db.prepare(`
    INSERT INTO shipments (manifest_no, customer_name, destination, carrier, status, scheduled_pickup, total_items, total_weight, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const shipments = [
    ['MAN-2025-001', 'Nigerian Bottling Company', 'Lagos, Ikeja', 'TransCorp Logistics', 'delivered', '2025-09-30', 49880, 12470, 6],
    ['MAN-2025-002', 'Seven-Up Bottling Co.', 'Ibadan, Oyo', 'DHL Nigeria', 'in_transit', '2025-10-03', 39905, 9976, 6],
    ['MAN-2025-003', 'Coca-Cola HBC Nigeria', 'Abuja, FCT', 'Maersk Logistics', 'scheduled', '2025-10-06', 35000, 8750, 6]
  ];
  shipments.forEach(s => insertShipment.run(...s));

  // Create stock movements for AI forecasting
  const insertMovement = db.prepare(`
    INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, performed_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const movements = [];
  // Generate 30 days of historical stock movements for products 1-4
  for (let day = 30; day >= 0; day--) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString();
    
    [1, 2, 3, 4].forEach(productId => {
      // Inbound (receiving)
      if (day % 7 === 0) {
        const qty = Math.floor(Math.random() * 500) + 200;
        movements.push([productId, 'inbound', qty, 'purchase_order', 1, 'Weekly restock', dateStr]);
      }
      // Outbound (production consumption)
      const dailyUse = Math.floor(Math.random() * 150) + 50;
      movements.push([productId, 'production_consumption', -dailyUse, 'production', 4, 'Daily production usage', dateStr]);
    });
  }
  movements.forEach(m => insertMovement.run(...m));

  // Create sample requests
  const insertRequest = db.prepare(`
    INSERT INTO requests (requester_id, request_type, department_id, target_department_id, product_id, quantity, priority, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const requests = [
    [8, 'material_requisition', 2, 1, 1, 500, 'high', 'approved', 'Urgent: PET resin needed for large order'],
    [8, 'material_requisition', 2, 1, 5, 25, 'normal', 'pending', 'Blue colorant for tinted preform batch'],
    [7, 'stock_adjustment', 1, null, 3, 50, 'low', 'pending', 'Correction: physical count mismatch'],
    [9, 'transfer_to_fg', 3, 2, null, 28500, 'normal', 'approved', 'Transfer completed preforms to FG warehouse'],
    [10, 'shipping_request', 4, 3, null, 35000, 'high', 'pending', 'Ship caps to NBC Lagos']
  ];
  requests.forEach(r => insertRequest.run(...r));

  // Create approvals for approved requests
  const insertApproval = db.prepare('INSERT INTO approvals (request_id, approver_id, action, comment) VALUES (?, ?, ?, ?)');
  insertApproval.run(1, 3, 'approved', 'Approved - priority production order');
  insertApproval.run(4, 5, 'approved', 'Quality verified, transfer approved');

  // Create notifications
  const insertNotif = db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)');
  const notifications = [
    [3, 'New Material Request', 'Ngozi Eze has requested 25 kg of Blue Colorant Master Batch', 'approval', '/requests'],
    [3, 'Low Stock Alert', 'Anti-static Agent is below reorder level (8 units remaining)', 'warning', '/inventory'],
    [5, 'Shipment Request', 'Aisha Mohammed has submitted a shipping request for 35,000 caps', 'approval', '/requests'],
    [1, 'Production Completed', 'Production job #1 (28mm Preform Clear) has been completed', 'success', '/production'],
    [4, 'Quality Review Needed', '15,000 units of 28mm Preform (Blue) awaiting quality review', 'info', '/finished-goods']
  ];
  notifications.forEach(n => insertNotif.run(...n));

  // Create audit logs
  const insertAudit = db.prepare('INSERT INTO audit_logs (user_id, user_name, action, module, detail) VALUES (?, ?, ?, ?, ?)');
  const auditEntries = [
    [1, 'Admin System', 'System initialized', 'system', 'Database seeded with initial data'],
    [3, 'Adewale Okonkwo', 'Request approved', 'requests', 'Approved material requisition #1 for 500kg PET Resin'],
    [4, 'Chioma Nwankwo', 'Production started', 'production', 'Started production job #2 - 38mm Preform (Blue)'],
    [5, 'Emeka Okafor', 'Transfer approved', 'finished_goods', 'Approved transfer of 28,500 preforms to FG warehouse'],
    [6, 'Fatima Bello', 'Shipment created', 'shipping', 'Created shipment MAN-2025-002 to Seven-Up Bottling']
  ];
  auditEntries.forEach(a => insertAudit.run(...a));

  console.log('  ✓ Database seeded with sample data');
}

module.exports = { seedDatabase };
