const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath, DATABASE_SCHEMA_VERSION } = require('./connection');
const { addColumnIfMissing } = require('./migrations/helpers');

// Columns that very old databases may lack: [table, column, definition].
const LEGACY_COLUMNS = [
  ['sales', 'shift_id', 'INTEGER'],
  ['sales', 'customer_name', 'TEXT'],
  ['sales', 'customer_phone', 'TEXT'],
  ['sales', 'due_date', 'DATETIME'],
  ['sales', 'order_id', 'INTEGER'],
  ['sales', 'subscription_id', 'INTEGER'],
  ['sales', 'branch_id', 'INTEGER REFERENCES branches(id)'],
  ['sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)'],
  ['shifts', 'branch_id', 'INTEGER REFERENCES branches(id)'],
  ['shifts', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)'],
  ['shifts', 'shift_type', "TEXT DEFAULT 'morning'"],
  ['shifts', 'pos_station', "TEXT DEFAULT 'الدرج الرئيسي - POS 1'"],
  ['shifts', 'opening_notes', 'TEXT'],
  ['shifts', 'opening_cash_breakdown', 'TEXT'],
  ['product_batches', 'warehouse_id', 'INTEGER REFERENCES warehouses(id) ON DELETE SET NULL'],
  ['returns', 'refund_amount', 'REAL DEFAULT 0'],
  ['returns', 'exchange_variant_id', 'INTEGER'],
  ['returns', 'user_id', 'INTEGER'],
  ['customers', 'rating', 'INTEGER DEFAULT 5'],
  ['customers', 'tier', "TEXT DEFAULT 'Regular'"],
  ['customers', 'last_interaction_at', 'DATETIME'],
  ['supplier_payments', 'user_id', 'INTEGER'],
  ['supplier_payments', 'shift_id', 'INTEGER'],
  ['orders', 'appointment_id', 'INTEGER'],
  ['workflow_definitions', 'entity_type', "TEXT NOT NULL DEFAULT 'general'"],
  ['workflow_definitions', 'business_profile_key', 'TEXT'],
  ['workflow_definitions', 'is_active', 'INTEGER DEFAULT 1'],
  ['workflow_statuses', 'sla_hours', 'INTEGER DEFAULT 0'],
  // Salon chairs track the live customer, stylist and service.
  ['salon_chairs', 'current_customer_name', 'TEXT'],
  ['salon_chairs', 'current_customer_phone', 'TEXT'],
  ['salon_chairs', 'current_stylist_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL'],
  ['salon_chairs', 'current_stylist_name', 'TEXT'],
  ['salon_chairs', 'current_service_id', 'INTEGER REFERENCES salon_services(id) ON DELETE SET NULL'],
  ['salon_chairs', 'current_service_name', 'TEXT'],
  ['salon_chairs', 'current_service_price', 'REAL DEFAULT 0'],
  ['salon_chairs', 'service_started_at', 'DATETIME'],
  // Salon sales support tips and discounts.
  ['salon_service_sales', 'tip_amount', 'REAL DEFAULT 0'],
  ['salon_service_sales', 'tip_recipient', "TEXT DEFAULT 'stylist'"],
  ['salon_service_sales', 'discount_amount', 'REAL DEFAULT 0'],
  ['salon_service_sales', 'customer_name', 'TEXT'],
];

function tableExists(table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

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
  // Old databases: add the columns later code expects before schema.sql runs.
  // Every addition goes through addColumnIfMissing, which throws on failure so a
  // broken upgrade stops here instead of leaving the app on a half-upgraded schema.
  for (const [table, column, definition] of LEGACY_COLUMNS) {
    if (tableExists(table)) addColumnIfMissing(table, column, definition);
  }

  // جدول كوبونات وعروض الصالون
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

  addColumnIfMissing('sales', 'branch_id', 'INTEGER REFERENCES branches(id)');
  addColumnIfMissing('sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');

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
