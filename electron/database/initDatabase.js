const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath, DATABASE_SCHEMA_VERSION } = require('./connection');
const { addColumnIfMissing } = require('./migrations/helpers');

function initDatabase() {
  const currentVersion = db.pragma('user_version', { simple: true }) || 0;
  if (currentVersion >= DATABASE_SCHEMA_VERSION) {
    try {
      const hasSales = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
      if (hasSales) {
        return;
      }
    } catch {}
  }
  // فحص أولي لضمان وجود أعمدة sales الأساسية في قواعد البيانات القديمة قبل تنفيذ الـ schema
  try {
    const hasSales = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
    if (hasSales) {
      addColumnIfMissing('sales', 'shift_id', 'INTEGER');
      addColumnIfMissing('sales', 'customer_name', 'TEXT');
      addColumnIfMissing('sales', 'customer_phone', 'TEXT');
      addColumnIfMissing('sales', 'due_date', 'DATETIME');
      addColumnIfMissing('sales', 'order_id', 'INTEGER');
      addColumnIfMissing('sales', 'subscription_id', 'INTEGER');
      addColumnIfMissing('sales', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfMissing('sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');
    }
    const hasShifts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shifts'").get();
    if (hasShifts) {
      addColumnIfMissing('shifts', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfMissing('shifts', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');
      addColumnIfMissing('shifts', 'shift_type', "TEXT DEFAULT 'morning'");
      addColumnIfMissing('shifts', 'pos_station', "TEXT DEFAULT 'الدرج الرئيسي - POS 1'");
      addColumnIfMissing('shifts', 'opening_notes', 'TEXT');
      addColumnIfMissing('shifts', 'opening_cash_breakdown', 'TEXT');
    }
    const hasBatches = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_batches'").get();
    if (hasBatches) {
      addColumnIfMissing('product_batches', 'warehouse_id', 'INTEGER REFERENCES warehouses(id) ON DELETE SET NULL');
    }
    const hasReturns = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='returns'").get();
    if (hasReturns) {
      const returnsCols = db.prepare("PRAGMA table_info(returns)").all().map((c) => c.name);
      if (!returnsCols.includes('refund_amount')) {
        try { db.exec("ALTER TABLE returns ADD COLUMN refund_amount REAL DEFAULT 0;"); } catch {}
      }
      if (!returnsCols.includes('exchange_variant_id')) {
        try { db.exec("ALTER TABLE returns ADD COLUMN exchange_variant_id INTEGER;"); } catch {}
      }
      if (!returnsCols.includes('user_id')) {
        try { db.exec("ALTER TABLE returns ADD COLUMN user_id INTEGER;"); } catch {}
      }
    }
    const hasCustomers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'").get();
    if (hasCustomers) {
      const custCols = db.prepare("PRAGMA table_info(customers)").all().map((c) => c.name);
      if (!custCols.includes('rating')) {
        try { db.exec("ALTER TABLE customers ADD COLUMN rating INTEGER DEFAULT 5;"); } catch {}
      }
      if (!custCols.includes('tier')) {
        try { db.exec("ALTER TABLE customers ADD COLUMN tier TEXT DEFAULT 'Regular';"); } catch {}
      }
      if (!custCols.includes('last_interaction_at')) {
        try { db.exec("ALTER TABLE customers ADD COLUMN last_interaction_at DATETIME;"); } catch {}
      }
    }
    const hasSupplierPayments = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_payments'").get();
    if (hasSupplierPayments) {
      const spCols = db.prepare("PRAGMA table_info(supplier_payments)").all().map((c) => c.name);
      if (!spCols.includes('user_id')) {
        try { db.exec("ALTER TABLE supplier_payments ADD COLUMN user_id INTEGER;"); } catch {}
      }
      if (!spCols.includes('shift_id')) {
        try { db.exec("ALTER TABLE supplier_payments ADD COLUMN shift_id INTEGER;"); } catch {}
      }
    }
    const hasOrders = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (hasOrders) {
      const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
      if (!orderCols.includes('appointment_id')) {
        try { db.exec("ALTER TABLE orders ADD COLUMN appointment_id INTEGER;"); } catch {}
      }
    }

    const hasWorkflows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_definitions'").get();
    if (hasWorkflows) {
      const wfCols = db.prepare("PRAGMA table_info(workflow_definitions)").all().map((c) => c.name);
      if (!wfCols.includes('entity_type')) {
        try { db.exec("ALTER TABLE workflow_definitions ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'general';"); } catch {}
      }
      if (!wfCols.includes('business_profile_key')) {
        try { db.exec("ALTER TABLE workflow_definitions ADD COLUMN business_profile_key TEXT;"); } catch {}
      }
      if (!wfCols.includes('is_active')) {
        try { db.exec("ALTER TABLE workflow_definitions ADD COLUMN is_active INTEGER DEFAULT 1;"); } catch {}
      }
    }
    const hasWfStatuses = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_statuses'").get();
    if (hasWfStatuses) {
      const stCols = db.prepare("PRAGMA table_info(workflow_statuses)").all().map((c) => c.name);
      if (!stCols.includes('sla_hours')) {
        try { db.exec("ALTER TABLE workflow_statuses ADD COLUMN sla_hours INTEGER DEFAULT 0;"); } catch {}
      }
    }

    // فحص وتحديث كراسي الصالون لربط الكرسي بالحلاق والعميل حياً
    const hasSalonChairs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='salon_chairs'").get();
    if (hasSalonChairs) {
      const chairCols = db.prepare("PRAGMA table_info(salon_chairs)").all().map((c) => c.name);
      if (!chairCols.includes('current_customer_name')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_customer_name TEXT;"); } catch {}
      }
      if (!chairCols.includes('current_customer_phone')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_customer_phone TEXT;"); } catch {}
      }
      if (!chairCols.includes('current_stylist_id')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_stylist_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"); } catch {}
      }
      if (!chairCols.includes('current_stylist_name')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_stylist_name TEXT;"); } catch {}
      }
      if (!chairCols.includes('current_service_id')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_service_id INTEGER REFERENCES salon_services(id) ON DELETE SET NULL;"); } catch {}
      }
      if (!chairCols.includes('current_service_name')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_service_name TEXT;"); } catch {}
      }
      if (!chairCols.includes('current_service_price')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN current_service_price REAL DEFAULT 0;"); } catch {}
      }
      if (!chairCols.includes('service_started_at')) {
        try { db.exec("ALTER TABLE salon_chairs ADD COLUMN service_started_at DATETIME;"); } catch {}
      }
    }

    // فحص وتحديث مبيعات الصالون لدعم البقشيش والخصومات
    const hasSalonSales = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='salon_service_sales'").get();
    if (hasSalonSales) {
      const saleCols = db.prepare("PRAGMA table_info(salon_service_sales)").all().map((c) => c.name);
      if (!saleCols.includes('tip_amount')) {
        try { db.exec("ALTER TABLE salon_service_sales ADD COLUMN tip_amount REAL DEFAULT 0;"); } catch {}
      }
      if (!saleCols.includes('tip_recipient')) {
        try { db.exec("ALTER TABLE salon_service_sales ADD COLUMN tip_recipient TEXT DEFAULT 'stylist';"); } catch {}
      }
      if (!saleCols.includes('discount_amount')) {
        try { db.exec("ALTER TABLE salon_service_sales ADD COLUMN discount_amount REAL DEFAULT 0;"); } catch {}
      }
      if (!saleCols.includes('customer_name')) {
        try { db.exec("ALTER TABLE salon_service_sales ADD COLUMN customer_name TEXT;"); } catch {}
      }
    }

    // جدول كوبونات وعروض الصالون
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS salon_coupons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
          discount_value REAL NOT NULL,
          min_spend REAL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          start_date TEXT,
          end_date TEXT,
          usage_count INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch {}
  } catch (e) {
    console.warn('تنبيه فحص جداول النظام والصالون:', e.message);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  for (const tableName of ['products', 'customers', 'suppliers']) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === 'is_active')) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
    }
    if (tableName === 'products' && !columns.some((column) => column.name === 'is_service')) {
      db.exec('ALTER TABLE products ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0');
    }
  }

  const salesColumns = db.prepare('PRAGMA table_info(sales)').all();
  if (!salesColumns.some((column) => column.name === 'branch_id')) {
    try { db.exec('ALTER TABLE sales ADD COLUMN branch_id INTEGER REFERENCES branches(id)'); } catch {}
  }
  if (!salesColumns.some((column) => column.name === 'warehouse_id')) {
    try { db.exec('ALTER TABLE sales ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id)'); } catch {}
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        from_status_key TEXT NOT NULL,
        to_status_key TEXT NOT NULL,
        allowed_roles_json TEXT DEFAULT '["admin","manager","cashier"]',
        auto_action_type TEXT DEFAULT 'none',
        auto_action_payload_json TEXT DEFAULT '{}',
        sla_limit_hours INTEGER DEFAULT 0,
        sla_alert_message TEXT DEFAULT 'تنبيه تجاوز فترة SLA المحددة',
        FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
    );

    DELETE FROM workflow_statuses
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM workflow_statuses
      GROUP BY workflow_id, status_key
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_statuses_unique_workflow_key
      ON workflow_statuses(workflow_id, status_key);

    CREATE TABLE IF NOT EXISTS workflow_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL UNIQUE,
        workflow_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        current_status_key TEXT NOT NULL,
        assigned_role TEXT DEFAULT 'admin',
        assigned_user TEXT,
        notes TEXT,
        entered_current_status_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_transitions_wf ON workflow_transitions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_tickets_wf ON workflow_tickets(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_tickets_status ON workflow_tickets(current_status_key);
  `);

  // Performance Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
    CREATE INDEX IF NOT EXISTS idx_returns_variant ON returns(variant_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_variant ON purchase_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON inventory_movements(variant_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  console.log('Database initialized at:', dbPath);
}

module.exports = { initDatabase };
