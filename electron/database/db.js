const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

let app;
try {
  app = require('electron').app;
} catch {
  app = null;
}

const isDev = !app?.isPackaged;
const defaultAppData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : __dirname);
const fallbackDataDir = (isDev && fs.existsSync('D:\\my-electron-app\\data'))
  ? 'D:\\my-electron-app\\data'
  : path.join(defaultAppData, 'kashiear');

const userDataDir = app?.getPath
  ? app.getPath('userData')
  : (process.env.FOX_USER_DATA_DIR || process.env.FOX_E2E_USER_DATA_DIR || (process.env.NODE_ENV === 'test' ? path.join(process.env.TEMP || 'D:\\temp', 'kashiear') : fallbackDataDir));
if (userDataDir !== ':memory:' && !fs.existsSync(userDataDir)) {
  try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
}
const dbPath = userDataDir === ':memory:' ? ':memory:' : path.join(userDataDir, 'shop.db');
const DATABASE_SCHEMA_VERSION = 11;
const SALES_SCHEMA_VERSION = 6;

const DATABASE_LOCK_TIMEOUT_MS = 30000;

const db = new Database(dbPath, {
  timeout: DATABASE_LOCK_TIMEOUT_MS,
});

function configureDatabaseConnection(database = db) {
  if (!database || typeof database.pragma !== 'function') {
    return database;
  }

  try {
    database.pragma('foreign_keys = ON');
  } catch (e) {
    console.warn('تعذر ضبط foreign_keys = ON:', e.message);
  }

  try {
    database.pragma('journal_mode = WAL');
  } catch (e) {
    console.warn('تعذر ضبط journal_mode = WAL:', e.message);
  }

  try {
    database.pragma(`busy_timeout = ${DATABASE_LOCK_TIMEOUT_MS}`);
  } catch (e) {
    console.warn('تعذر ضبط busy_timeout:', e.message);
  }

  try {
    database.pragma('synchronous = NORMAL');
    database.pragma('cache_size = -64000');
    database.pragma('temp_store = MEMORY');
  } catch (e) {
    console.warn('تعذر ضبط إعدادات الأداء لقاعدة البيانات:', e.message);
  }

  return database;
}

function addColumnIfMissing(tableName, columnName, columnDefinition) {
  if (!tableName || !columnName || !columnDefinition) {
    return false;
  }

  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some((column) => column.name === columnName)) {
      return false;
    }

    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
    return true;
  } catch (err) {
    console.warn(`تعذر إضافة عمود ${columnName} إلى ${tableName}:`, err.message);
    return false;
  }
}

function checkpointWalIfNeeded(database = db) {
  if (!database || typeof database.pragma !== 'function') return;

  try {
    database.pragma('wal_checkpoint(PASSIVE)');
  } catch (e) {
    // Do not fail shutdown or backup because WAL checkpoint is advisory only.
  }
}

const LICENSE_SETTINGS_TO_PRESERVE = [
  'trial_start_date',
  'last_known_server_clock',
  'clock_rollback_detected',
  'license_key',
  'license_activated_at',
  'license_trial_purged',
];

function clearExpiredTrialData(database = db) {
  const settingsTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'"
  ).get();
  if (!settingsTable) {
    throw new Error('تعذر تصفير بيانات المتجر: جدول إعدادات الترخيص غير موجود');
  }

  const purgeAlreadyCompleted = database.prepare(
    "SELECT 1 FROM settings WHERE key = 'license_trial_purged' AND value = '1'"
  ).get();

  const existingLicenseSettings = database.prepare(
    `SELECT key, value FROM settings WHERE key IN (${LICENSE_SETTINGS_TO_PRESERVE.map(() => '?').join(', ')})`
  ).all(...LICENSE_SETTINGS_TO_PRESERVE);
  const tableRows = database.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != 'settings'
    ORDER BY name
  `).all();
  const virtualTableNames = tableRows
    .filter(({ sql }) => /^create virtual table/i.test(sql || ''))
    .map(({ name }) => name);
  const virtualShadowTables = new Set(tableRows
    .filter(({ name, sql }) => !sql && virtualTableNames.some((virtualName) => name.startsWith(`${virtualName}_`)))
    .map(({ name }) => name));
  const tables = tableRows
    .filter(({ name }) => !virtualShadowTables.has(name))
    .map(({ name }) => name);
  const wasForeignKeysEnabled = Boolean(database.pragma('foreign_keys', { simple: true }));

  database.pragma('secure_delete = ON');
  database.pragma('foreign_keys = OFF');

  try {
    const clearData = database.transaction(() => {
      for (const tableName of tables) {
        const quotedName = `"${tableName.replace(/"/g, '""')}"`;
        database.exec(`DELETE FROM ${quotedName}`);
      }

      database.prepare('DELETE FROM settings').run();
      const restoreLicenseSetting = database.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?)'
      );
      for (const setting of existingLicenseSettings) {
        restoreLicenseSetting.run(setting.key, setting.value);
      }

      const hasSequenceTable = database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'"
      ).get();
      if (hasSequenceTable) {
        database.prepare('DELETE FROM sqlite_sequence').run();
      }
      if (database.pragma('foreign_key_check').length > 0) {
        throw new Error('تعذر تصفير بيانات المتجر بسبب تعارض في المفاتيح الأجنبية');
      }
    });

    clearData();
    if (purgeAlreadyCompleted) return false;

    database.exec('VACUUM');
    database.pragma('wal_checkpoint(TRUNCATE)');

    const markTrialPurged = database.transaction(() => {
      database.prepare(`
        INSERT INTO settings (key, value)
        VALUES ('license_trial_purged', '1')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run();
    });
    markTrialPurged();
    return true;
  } finally {
    database.pragma(`foreign_keys = ${wasForeignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

configureDatabaseConnection(db);

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

function migrateSalesTable() {
  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion >= SALES_SCHEMA_VERSION) return;

  const salesTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sales'"
  ).get();
  const salesColumns = db.prepare('PRAGMA table_info(sales)').all();
  const salesColumnNames = new Set(salesColumns.map((column) => column.name));
  const hasCreditConstraint = salesTable?.sql?.includes("'credit'") ?? false;
  const salesSchemaIsCurrent = (
    salesColumnNames.has('customer_name')
    && salesColumnNames.has('customer_phone')
    && salesColumnNames.has('due_date')
    && salesColumnNames.has('shift_id')
    && salesColumnNames.has('branch_id')
    && salesColumnNames.has('warehouse_id')
    && hasCreditConstraint
  );

  try {
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      if (!salesSchemaIsCurrent) {
        const customerName = salesColumnNames.has('customer_name') ? 'customer_name' : 'NULL';
        const customerPhone = salesColumnNames.has('customer_phone') ? 'customer_phone' : 'NULL';
        const dueDate = salesColumnNames.has('due_date') ? 'due_date' : 'NULL';
        const shiftIdCol = salesColumnNames.has('shift_id') ? 'shift_id' : 'NULL';
        const branchIdCol = salesColumnNames.has('branch_id') ? 'branch_id' : 'NULL';
        const warehouseIdCol = salesColumnNames.has('warehouse_id') ? 'warehouse_id' : 'NULL';

        db.exec(`
          DROP TRIGGER IF EXISTS trg_restrict_customer_delete_with_history;
          CREATE TABLE sales_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              shift_id INTEGER,
              branch_id INTEGER,
              warehouse_id INTEGER,
              customer_id INTEGER,
              customer_name TEXT,
              customer_phone TEXT,
              user_id INTEGER,
              total_amount REAL NOT NULL,
              discount REAL DEFAULT 0,
              payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'credit')),
              due_date DATETIME,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (shift_id) REFERENCES shifts(id),
              FOREIGN KEY (branch_id) REFERENCES branches(id),
              FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
              FOREIGN KEY (customer_id) REFERENCES customers(id),
              FOREIGN KEY (user_id) REFERENCES users(id)
          );

          INSERT INTO sales_new
            (id, shift_id, branch_id, warehouse_id, customer_id, customer_name, customer_phone, user_id, total_amount, discount, payment_method, due_date, created_at)
          SELECT id, ${shiftIdCol}, ${branchIdCol}, ${warehouseIdCol}, customer_id, ${customerName}, ${customerPhone}, user_id, total_amount, discount, payment_method, ${dueDate}, created_at
          FROM sales;

          DROP TABLE sales;
          ALTER TABLE sales_new RENAME TO sales;

          CREATE TRIGGER IF NOT EXISTS trg_restrict_customer_delete_with_history
          BEFORE DELETE ON customers
          WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
           AND (EXISTS (SELECT 1 FROM customer_payments WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM sales WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM legal_cases WHERE client_id = OLD.id)
            OR EXISTS (SELECT 1 FROM customer_subscriptions WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM subscription_usage_logs WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM crm_interactions WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM crm_opportunities WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM salon_package_subscriptions WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM salon_appointments WHERE customer_id = OLD.id)
            OR EXISTS (SELECT 1 FROM appointments WHERE customer_id = OLD.id))
          BEGIN
              SELECT RAISE(ABORT, 'Cannot delete a customer with financial or business history');
          END;
        `);
      }

      const userColumns = db.prepare('PRAGMA table_info(users)').all();
      if (!userColumns.some((column) => column.name === 'force_password_change')) {
        db.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0');
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
        CREATE INDEX IF NOT EXISTS idx_sales_due_date ON sales(due_date);
      `);

      // v2: إصلاح sale_items FK — إضافة ON DELETE SET NULL لمنع crash عند حذف variant مُباع
      if (currentVersion < 2) {
        const hasSaleItems = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sale_items'"
        ).get();
        if (hasSaleItems) {
          const variantForeignKey = db.prepare('PRAGMA foreign_key_list(sale_items)')
            .all()
            .find((foreignKey) => foreignKey.from === 'variant_id');
          const variantDeleteAction = variantForeignKey?.on_delete?.toUpperCase();

          if (variantDeleteAction !== 'SET NULL') {
            db.exec(`
              DROP TRIGGER IF EXISTS trg_restrict_variant_delete_with_history;
              CREATE TABLE sale_items_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                variant_id INTEGER,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
              );
              INSERT INTO sale_items_new SELECT * FROM sale_items;
              DROP TABLE sale_items;
              ALTER TABLE sale_items_new RENAME TO sale_items;
              CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
              CREATE TRIGGER IF NOT EXISTS trg_restrict_variant_delete_with_history
              BEFORE DELETE ON product_variants
              WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
               AND (EXISTS (SELECT 1 FROM sale_items WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM purchase_items WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM returns WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM inventory_movements WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM inventory_transfer_items WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM inventory_count_items WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM warehouse_stock WHERE variant_id = OLD.id)
                OR EXISTS (SELECT 1 FROM product_batches WHERE variant_id = OLD.id))
              BEGIN
                SELECT RAISE(ABORT, 'Cannot delete a product variant with transaction or inventory history');
              END;
            `);
          }
        }
      }

      db.pragma(`user_version = ${SALES_SCHEMA_VERSION}`);
    });

    migrate();
  } catch (err) {
    // NOTE: We intentionally use console.error here instead of logError because
    // db.js is loaded before logger.service (which itself may require db),
    // so importing logger.service here would create a circular dependency.
    // The DatabaseInit error in main.js will also be logged via logError there.
    console.error('خطأ أثناء ترقية قاعدة البيانات:', err.message);
    throw err;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function closeDatabase() {
  if (!db || !db.open) return;

  try {
    checkpointWalIfNeeded(db);
  } catch {}

  try {
    db.close();
  } catch (err) {
    console.warn('تعذر إغلاق اتصال قاعدة البيانات بشكل نظيف:', err.message);
  }
}

function migrateUsersTable() {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const statements = [];
  if (!columns.some((c) => c.name === 'is_active')) {
    statements.push('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
  }
  if (!columns.some((c) => c.name === 'force_password_change')) {
    statements.push('ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.some((c) => c.name === 'recovery_key_hash')) {
    statements.push('ALTER TABLE users ADD COLUMN recovery_key_hash TEXT');
  }
  if (!columns.some((c) => c.name === 'full_name')) {
    statements.push('ALTER TABLE users ADD COLUMN full_name TEXT');
  }
  if (!columns.some((c) => c.name === 'first_name')) {
    statements.push('ALTER TABLE users ADD COLUMN first_name TEXT');
  }
  if (!columns.some((c) => c.name === 'last_name')) {
    statements.push('ALTER TABLE users ADD COLUMN last_name TEXT');
  }
  if (!columns.some((c) => c.name === 'phone')) {
    statements.push('ALTER TABLE users ADD COLUMN phone TEXT');
  }
  if (!columns.some((c) => c.name === 'email')) {
    statements.push('ALTER TABLE users ADD COLUMN email TEXT');
  }
  if (!columns.some((c) => c.name === 'gender')) {
    statements.push("ALTER TABLE users ADD COLUMN gender TEXT CHECK(gender IS NULL OR gender IN ('male', 'female', 'prefer_not_to_say'))");
  }
  if (!columns.some((c) => c.name === 'date_of_birth')) {
    statements.push('ALTER TABLE users ADD COLUMN date_of_birth TEXT');
  }
  if (!columns.some((c) => c.name === 'country')) {
    statements.push('ALTER TABLE users ADD COLUMN country TEXT');
  }
  if (!columns.some((c) => c.name === 'city')) {
    statements.push('ALTER TABLE users ADD COLUMN city TEXT');
  }
  if (!columns.some((c) => c.name === 'address')) {
    statements.push('ALTER TABLE users ADD COLUMN address TEXT');
  }
  if (!columns.some((c) => c.name === 'notes')) {
    statements.push('ALTER TABLE users ADD COLUMN notes TEXT');
  }
  if (!columns.some((c) => c.name === 'job_title')) {
    statements.push('ALTER TABLE users ADD COLUMN job_title TEXT');
  }
  if (!columns.some((c) => c.name === 'specialty')) {
    statements.push('ALTER TABLE users ADD COLUMN specialty TEXT');
  }
  if (!columns.some((c) => c.name === 'working_hours')) {
    statements.push('ALTER TABLE users ADD COLUMN working_hours TEXT');
  }
  if (!columns.some((c) => c.name === 'scheduled_start')) {
    statements.push('ALTER TABLE users ADD COLUMN scheduled_start TEXT');
  }
  if (!columns.some((c) => c.name === 'scheduled_end')) {
    statements.push('ALTER TABLE users ADD COLUMN scheduled_end TEXT');
  }
  if (!columns.some((c) => c.name === 'profile_image')) {
    statements.push('ALTER TABLE users ADD COLUMN profile_image TEXT');
  }
  if (!columns.some((c) => c.name === 'pay_type')) {
    statements.push('ALTER TABLE users ADD COLUMN pay_type TEXT');
  }
  if (!columns.some((c) => c.name === 'pay_amount')) {
    statements.push('ALTER TABLE users ADD COLUMN pay_amount REAL');
  }
  if (!columns.some((c) => c.name === 'commission_rate')) {
    statements.push('ALTER TABLE users ADD COLUMN commission_rate REAL');
  }
  if (!columns.some((c) => c.name === 'system_role_key')) {
    statements.push('ALTER TABLE users ADD COLUMN system_role_key TEXT');
  }
  if (statements.length > 0) {
    db.exec(statements.join(';'));
    console.log('تم تحديث جدول users لدعم بيانات المستخدمين الإضافية وحالة الحساب ومفتاح الاسترداد');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, attendance_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date);
  `);
}

function migrateReviewsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      tags TEXT NOT NULL DEFAULT '[]',
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'hidden')),
      sector TEXT,
      app_version TEXT,
      consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0, 1)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS review_prompt_state (
      tenant_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_prompted_at DATETIME,
      PRIMARY KEY (tenant_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS review_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, user_id)
      
    );

    CREATE TABLE IF NOT EXISTS review_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('sale', 'appointment')),
      activity_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, user_id, activity_type, activity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review_activity_user
      ON review_activity(tenant_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_reviews_status_updated
      ON reviews(status, updated_at);
  `);
}

function migrateLeaveRequestsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      requested_by_user_id INTEGER,
      reviewed_by_user_id INTEGER,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leave_requests_dates_status
      ON leave_requests(start_date, end_date, status);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_user
      ON leave_requests(user_id, start_date);
  `);
}

function migrateSuppliersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        address TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        invoice_number TEXT,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        remaining_amount REAL NOT NULL DEFAULT 0,
        payment_status TEXT CHECK(payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
        due_date DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        variant_id INTEGER,
        product_name TEXT NOT NULL,
        size TEXT,
        color TEXT,
        quantity INTEGER NOT NULL,
        purchase_price REAL NOT NULL,
        selling_price REAL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        purchase_id INTEGER,
        amount REAL NOT NULL,
        payment_method TEXT CHECK(payment_method IN ('cash', 'bank_transfer', 'cheque')) DEFAULT 'cash',
        notes TEXT,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
    CREATE INDEX IF NOT EXISTS idx_purchases_due_date ON purchases(due_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
  `);
  console.log('تم التحقق من جداول الموردين وفواتير الشراء والمدفوعات');
}

function migrateShiftsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        opened_by_name TEXT,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        opening_cash REAL NOT NULL DEFAULT 0,
        status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
        total_cash_sales REAL DEFAULT 0,
        total_card_sales REAL DEFAULT 0,
        total_credit_sales REAL DEFAULT 0,
        total_refunds REAL DEFAULT 0,
        total_expenses REAL DEFAULT 0,
        expected_cash REAL DEFAULT 0,
        actual_cash REAL,
        cash_difference REAL,
        cash_breakdown TEXT,
        closing_notes TEXT,
        closed_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS shift_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);
    CREATE INDEX IF NOT EXISTS idx_shift_expenses_shift ON shift_expenses(shift_id);
  `);

  const shiftCols = db.prepare("PRAGMA table_info(shifts)").all();
  const addShiftCol = (name, typeDef) => {
    if (!shiftCols.some((c) => c.name === name)) {
      try {
        db.exec(`ALTER TABLE shifts ADD COLUMN ${name} ${typeDef}`);
      } catch (e) {
        console.warn(`تنبيه أثناء إضافة عمود ${name} لجدول shifts:`, e.message);
      }
    }
  };
  addShiftCol('shift_type', "TEXT DEFAULT 'morning'");
  addShiftCol('pos_station', "TEXT DEFAULT 'الدرج الرئيسي - POS 1'");
  addShiftCol('opening_notes', 'TEXT');
  addShiftCol('opening_cash_breakdown', 'TEXT');
  addShiftCol('branch_id', 'INTEGER REFERENCES branches(id)');
  addShiftCol('warehouse_id', 'INTEGER REFERENCES warehouses(id)');
  addShiftCol('attendance_record_id', 'INTEGER REFERENCES attendance_records(id)');
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_warehouse ON shifts(warehouse_id);
    `);
  } catch {}

  const salesColumns = db.prepare("PRAGMA table_info(sales)").all();
  const hasShiftId = salesColumns.some((c) => c.name === 'shift_id');
  if (!hasShiftId) {
    try {
      db.exec(`
        ALTER TABLE sales ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
        CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
      `);
      console.log('تم إضافة عمود shift_id لجدول sales');
    } catch (e) {
      console.warn('تنبيه أثناء إضافة shift_id لجدول sales:', e.message);
    }
  }

  console.log('تم التحقق من جداول الورديات ومصروفات الدرج');
}

function migrateReturnsTable() {
  const columns = db.prepare("PRAGMA table_info(returns)").all();
  const alreadyMigrated = columns.some((c) => c.name === 'refund_amount');
  if (!alreadyMigrated) {
    db.exec(`
      ALTER TABLE returns ADD COLUMN refund_amount REAL DEFAULT 0;
      ALTER TABLE returns ADD COLUMN exchange_variant_id INTEGER;
      ALTER TABLE returns ADD COLUMN user_id INTEGER;
    `);
    console.log('تم تحديث جدول returns لدعم المرتجعات والاستبدال');
  }

  if (!columns.some((c) => c.name === 'shift_id')) {
    try {
      db.exec(`
        ALTER TABLE returns ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
        CREATE INDEX IF NOT EXISTS idx_returns_shift ON returns(shift_id);
      `);
      console.log('تم إضافة عمود shift_id لجدول returns');
    } catch (e) {
      console.warn('تنبيه أثناء إضافة shift_id لجدول returns:', e.message);
    }
  }

  if (!columns.some((c) => c.name === 'exchange_price_difference')) {
    db.exec('ALTER TABLE returns ADD COLUMN exchange_price_difference REAL NOT NULL DEFAULT 0');
  }
  if (!columns.some((c) => c.name === 'exchange_payment_method')) {
    db.exec('ALTER TABLE returns ADD COLUMN exchange_payment_method TEXT');
  }
}

function migrateSettingsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
  `);

  const defaultSettings = {
    store_name: 'بوتيك الفخامة',
    store_tagline: 'أحدث صيحات الموضة والأزياء',
    store_phone: '01000000000',
    store_address: 'العنوان الرئيسي - المحل',
    store_logo: '',
    receipt_footer: 'الاستبدال والاسترجاع خلال 14 يوماً من تاريخ الشراء بالفاتورة الأصلية. شكراً لزيارتكم!',
    receipt_paper_size: '80mm',
    show_logo_on_receipt: '1',
    show_barcode_on_receipt: '1',
    show_cashier_name: '1',
    app_branding_mode: 'fox_with_store',
    thermal_printer_name: '',
    cash_drawer_pin: '2'
  };

  const insertStmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  const initDefaults = db.transaction(() => {
    for (const [key, val] of Object.entries(defaultSettings)) {
      insertStmt.run(key, String(val));
    }
  });
  initDefaults();
  console.log('تم التحقق من جدول settings والإعدادات الافتراضية');
}

function migrateNotificationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link_page TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  `);
  console.log('تم التحقق من جدول notifications');
}

function migrateCustomersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'bank_transfer')),
      notes TEXT,
      user_id INTEGER,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
  `);

  const custPayCols = db.prepare("PRAGMA table_info(customer_payments)").all();
  if (!custPayCols.some((c) => c.name === 'shift_id')) {
    try {
      db.exec(`
        ALTER TABLE customer_payments ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
        CREATE INDEX IF NOT EXISTS idx_customer_payments_shift ON customer_payments(shift_id);
      `);
      console.log('تم إضافة عمود shift_id لجدول customer_payments');
    } catch (e) {
      console.warn('تنبيه أثناء إضافة shift_id لجدول customer_payments:', e.message);
    }
  }
}

function migrateOrdersTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        order_type TEXT NOT NULL CHECK(order_type IN ('pos_sale', 'online', 'delivery', 'reservation', 'maintenance', 'tailoring', 'manufacturing', 'service')),
        customer_id INTEGER,
        customer_name TEXT,
        customer_phone TEXT,
        assigned_user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'ready', 'delivered', 'cancelled', 'on_hold')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        due_date DATETIME,
        estimated_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        vehicle_plate TEXT,
        vehicle_make TEXT,
        vehicle_model TEXT,
        vehicle_year INTEGER,
        odometer INTEGER,
        fault_description TEXT,
        requested_part TEXT,
        part_number TEXT,
        requested_quantity INTEGER NOT NULL DEFAULT 1,
        sale_id INTEGER UNIQUE REFERENCES sales(id) ON DELETE SET NULL,
        notes TEXT,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        variant_id INTEGER,
        title TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        user_id INTEGER,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        uploaded_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_assigned ON orders(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_due_date ON orders(due_date);
    CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_history(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_comments_order ON order_comments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON order_attachments(order_id);
  `);
  const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name));
  const orderColumnMigrations = [
    ['vehicle_plate', 'TEXT'],
    ['vehicle_make', 'TEXT'],
    ['vehicle_model', 'TEXT'],
    ['vehicle_year', 'INTEGER'],
    ['odometer', 'INTEGER'],
    ['fault_description', 'TEXT'],
    ['requested_part', 'TEXT'],
    ['part_number', 'TEXT'],
    ['requested_quantity', 'INTEGER NOT NULL DEFAULT 1'],
    ['sale_id', 'INTEGER REFERENCES sales(id) ON DELETE SET NULL'],
  ];
  for (const [column, definition] of orderColumnMigrations) {
    if (!orderColumns.has(column)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
    }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_sale ON orders(sale_id) WHERE sale_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_vehicle_plate ON orders(vehicle_plate)');
  console.log('تم التحقق من جداول مركز الطلبات والعمليات (orders)');
}

function migrateAppointmentsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointment_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      resource_type TEXT NOT NULL CHECK(resource_type IN ('employee', 'room', 'chair', 'car', 'device', 'other')),
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointment_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
      buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK(buffer_minutes >= 0),
      price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
      resource_type TEXT CHECK(resource_type IN ('employee', 'room', 'chair', 'car', 'device', 'other')),
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointment_working_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      UNIQUE(resource_id, weekday),
      FOREIGN KEY (resource_id) REFERENCES appointment_resources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appointment_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES appointment_resources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      resource_id INTEGER NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked'
        CHECK(status IN ('booked', 'confirmed', 'completed', 'cancelled', 'no_show', 'converted')),
      deposit_amount REAL NOT NULL DEFAULT 0 CHECK(deposit_amount >= 0),
      reminder_minutes INTEGER NOT NULL DEFAULT 60 CHECK(reminder_minutes >= 0),
      reminder_sent INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_user_id INTEGER,
      converted_order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_id) REFERENCES appointment_services(id),
      FOREIGN KEY (resource_id) REFERENCES appointment_resources(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(resource_id, start_at, end_at, status);
    CREATE INDEX IF NOT EXISTS idx_appointments_reminders ON appointments(status, reminder_sent, start_at);
    CREATE INDEX IF NOT EXISTS idx_appointment_holidays_dates ON appointment_holidays(start_date, end_date);
  `);

  const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name));
  if (!orderColumns.has('appointment_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN appointment_id INTEGER REFERENCES appointments(id)');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_appointment ON orders(appointment_id) WHERE appointment_id IS NOT NULL');
}

function migrateSubscriptionsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('time_based', 'session_based', 'product_quota', 'membership')),
        price REAL NOT NULL DEFAULT 0,
        duration_days INTEGER NOT NULL DEFAULT 30,
        total_credits INTEGER DEFAULT 0,
        discount_percentage REAL DEFAULT 0,
        max_freeze_days INTEGER DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        package_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'expired', 'depleted', 'cancelled')),
        start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_date DATETIME NOT NULL,
        total_credits INTEGER DEFAULT 0,
        remaining_credits INTEGER DEFAULT 0,
        frozen_days_used INTEGER DEFAULT 0,
        last_freeze_date DATETIME,
        auto_renew INTEGER DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS subscription_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        user_id INTEGER,
        sale_id INTEGER,
        credits_deducted INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS subscription_freeze_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        freeze_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unfreeze_date DATETIME,
        days_frozen INTEGER DEFAULT 0,
        reason TEXT,
        user_id INTEGER,
        FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer ON customer_subscriptions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_status ON customer_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_end_date ON customer_subscriptions(end_date);
    CREATE INDEX IF NOT EXISTS idx_subscription_usage_sub ON subscription_usage_logs(subscription_id);
  `);

  try {
    const packageColumns = new Set(db.prepare('PRAGMA table_info(packages)').all().map((c) => c.name));
    
    if (!packageColumns.has('original_price')) {
      db.prepare('ALTER TABLE packages ADD COLUMN original_price REAL DEFAULT 0').run();
    }
    if (!packageColumns.has('billing_cycle')) {
      db.prepare("ALTER TABLE packages ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'").run();
    }
    if (!packageColumns.has('eligible_services')) {
      db.prepare("ALTER TABLE packages ADD COLUMN eligible_services TEXT DEFAULT '[]'").run();
    }
    if (!packageColumns.has('is_unlimited_sessions')) {
      db.prepare('ALTER TABLE packages ADD COLUMN is_unlimited_sessions INTEGER DEFAULT 0').run();
    }
    if (!packageColumns.has('advance_booking_days')) {
      db.prepare('ALTER TABLE packages ADD COLUMN advance_booking_days INTEGER DEFAULT 0').run();
    }
    if (!packageColumns.has('grace_period_days')) {
      db.prepare('ALTER TABLE packages ADD COLUMN grace_period_days INTEGER DEFAULT 3').run();
    }
    if (!packageColumns.has('trial_days')) {
      db.prepare('ALTER TABLE packages ADD COLUMN trial_days INTEGER DEFAULT 1').run();
    }
    if (!packageColumns.has('is_active')) {
      db.prepare('ALTER TABLE packages ADD COLUMN is_active INTEGER DEFAULT 1').run();
    }
    if (!packageColumns.has('is_featured')) {
      db.prepare('ALTER TABLE packages ADD COLUMN is_featured INTEGER DEFAULT 0').run();
    }
    if (!packageColumns.has('badge_text')) {
      db.prepare('ALTER TABLE packages ADD COLUMN badge_text TEXT').run();
    }
    if (!packageColumns.has('badge_color')) {
      db.prepare("ALTER TABLE packages ADD COLUMN badge_color TEXT DEFAULT '#3b82f6'").run();
    }
    if (!packageColumns.has('branch_ids')) {
      db.prepare("ALTER TABLE packages ADD COLUMN branch_ids TEXT DEFAULT '[]'").run();
    }
  } catch (err) {
    console.warn('تنبيه أثناء ترقية أعمدة جدول الباقات (packages):', err.message);
  }

  console.log('تم التحقق من جداول الاشتراكات والباقات (subscriptions)');
}

function migrateCommissionsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commission_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK(target_type IN ('all_sales', 'product', 'category', 'employee', 'debt_collection', 'net_profit', 'sales_target')),
        target_id INTEGER,
        calculation_type TEXT NOT NULL CHECK(calculation_type IN ('percentage', 'fixed_amount', 'lump_sum_bonus')),
        rate_value REAL NOT NULL DEFAULT 0,
        min_sales_threshold REAL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commission_earnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        rule_id INTEGER,
        sale_id INTEGER,
        payment_id INTEGER,
        base_amount REAL NOT NULL DEFAULT 0,
        commission_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
        payout_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE SET NULL,
        FOREIGN KEY (payout_id) REFERENCES commission_payouts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS commission_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total_amount REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'cash',
        notes TEXT,
        paid_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_commission_rules_type ON commission_rules(target_type);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_user ON commission_earnings(user_id);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_status ON commission_earnings(status);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_sale ON commission_earnings(sale_id);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_payout ON commission_earnings(payout_id);
  `);
  console.log('تم التحقق من جداول العمولات والحوافز (commissions)');
}

function migrateCRMTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        campaign_id INTEGER,
        user_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('call', 'note', 'message', 'complaint', 'offer')),
        subject TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'pending')),
        follow_up_date DATETIME,
        reminder_sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES crm_campaigns(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        user_id INTEGER,
        title TEXT NOT NULL,
        expected_value REAL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead', 'qualified', 'proposal', 'won', 'lost')),
        expected_close_date DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_criteria TEXT,
        discount_percentage REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON crm_interactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_type ON crm_interactions(type);
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_followup ON crm_interactions(follow_up_date);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_customer ON crm_opportunities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);
  `);
  const interactionColumns = db.prepare('PRAGMA table_info(crm_interactions)').all().map((column) => column.name);
  if (!interactionColumns.includes('campaign_id')) {
    db.exec('ALTER TABLE crm_interactions ADD COLUMN campaign_id INTEGER REFERENCES crm_campaigns(id) ON DELETE SET NULL;');
  }
  if (!interactionColumns.includes('reminder_sent_at')) {
    db.exec('ALTER TABLE crm_interactions ADD COLUMN reminder_sent_at DATETIME;');
  }
  const customersTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'"
  ).get();
  if (!customersTable) {
    throw new Error('لا يمكن ترحيل CRM لأن جدول customers غير موجود');
  }
  const customerColumns = db.prepare('PRAGMA table_info(customers)').all()
    .map((column) => column.name);
  if (!customerColumns.includes('last_interaction_at')) {
    db.exec('ALTER TABLE customers ADD COLUMN last_interaction_at DATETIME;');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_customer ON crm_interactions(campaign_id, customer_id) WHERE campaign_id IS NOT NULL;');
  db.exec(`
    UPDATE customers
    SET last_interaction_at = (
      SELECT MAX(ci.created_at) FROM crm_interactions ci WHERE ci.customer_id = customers.id
    )
    WHERE last_interaction_at IS NULL
      AND EXISTS (SELECT 1 FROM crm_interactions ci WHERE ci.customer_id = customers.id);
  `);
  console.log('تم التحقق من جداول مركز اتصالات العملاء والـ CRM (crm)');
}

function migrateAdvancedCRMTables(database = db) {
  const addColumn = (table, name, definition) => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };

  addColumn('customers', 'company_id', 'INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL');
  addColumn('customers', 'lead_source', 'TEXT');
  addColumn('customers', 'email_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customers', 'sms_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customers', 'consent_updated_at', 'DATETIME');
  addColumn('customers', 'gdpr_deleted_at', 'DATETIME');
  addColumn('crm_opportunities', 'company_id', 'INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'lead_id', 'INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'probability', 'INTEGER NOT NULL DEFAULT 10');
  addColumn('crm_opportunities', 'pipeline_stage_id', 'INTEGER REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'last_stage_changed_at', 'DATETIME');
  addColumn('crm_opportunities', 'updated_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'closed_at', 'DATETIME');
  addColumn('crm_opportunities', 'stage_stale_reminded_at', 'DATETIME');

  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_company_id INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      company_id INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'open' CHECK(outcome IN ('open', 'won', 'lost')),
      probability INTEGER NOT NULL DEFAULT 10 CHECK(probability BETWEEN 0 AND 100),
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_record_tags (
      tag_id INTEGER NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      PRIMARY KEY(tag_id, record_type, record_id)
    );

    CREATE TABLE IF NOT EXISTS crm_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('call', 'meeting', 'task', 'email', 'note')),
      title TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'cancelled')),
      due_at DATETIME,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reminder_sent_at DATETIME,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity')),
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN ('text', 'number', 'date', 'boolean')),
      is_required INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, field_key)
    );

    CREATE TABLE IF NOT EXISTS crm_custom_field_values (
      field_id INTEGER NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
      record_id INTEGER NOT NULL,
      value TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(field_id, record_id)
    );

    CREATE TABLE IF NOT EXISTS crm_saved_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity', 'activity')),
      filters_json TEXT NOT NULL DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, entity_type, name)
    );

    CREATE TABLE IF NOT EXISTS crm_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      to_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(from_customer_id != to_customer_id),
      UNIQUE(from_customer_id, to_customer_id, relationship_type)
    );

    CREATE TABLE IF NOT EXISTS crm_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      changes_json TEXT NOT NULL DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      trigger_type TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_crm_companies_parent ON crm_companies(parent_company_id);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_owner ON crm_leads(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_crm_activities_due ON crm_activities(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_crm_activities_record ON crm_activities(record_type, record_id);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage_id ON crm_opportunities(pipeline_stage_id);
    CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm_audit_log(entity_type, entity_id, created_at);
  `);

  const insertStage = database.prepare(`
    INSERT OR IGNORE INTO crm_pipeline_stages (stage_key, label, outcome, probability, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  [
    ['lead', 'عميل محتمل', 'open', 10, 0],
    ['qualified', 'مؤهل', 'open', 25, 1],
    ['proposal', 'عرض سعر', 'open', 60, 2],
    ['won', 'ناجحة', 'won', 100, 3],
    ['lost', 'خاسرة', 'lost', 0, 4],
  ].forEach((stage) => insertStage.run(...stage));
  database.prepare(`
    INSERT OR IGNORE INTO crm_automation_rules (name, trigger_type, config_json)
    VALUES ('تنبيه الصفقات المتوقفة', 'opportunity_stale', '{"days":7}')
  `).run();

  database.exec(`
    UPDATE crm_opportunities
    SET pipeline_stage_id = (
      SELECT id FROM crm_pipeline_stages WHERE stage_key = crm_opportunities.stage
    ),
    last_stage_changed_at = COALESCE(last_stage_changed_at, updated_at)
    WHERE pipeline_stage_id IS NULL;
  `);
  database.exec(`
    UPDATE crm_opportunities
    SET closed_at = COALESCE(closed_at, updated_at)
    WHERE stage IN ('won', 'lost') AND closed_at IS NULL;
  `);
}

function migrateCashierAuditLogsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cashier_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        shift_id INTEGER,
        action_type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT,
        amount REAL DEFAULT 0,
        severity TEXT DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'danger', 'success')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON cashier_audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_shift ON cashier_audit_logs(shift_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON cashier_audit_logs(action_type);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON cashier_audit_logs(created_at);
  `);
  console.log('تم التحقق من جدول سجل تدقيق وحركات الكاشير (cashier_audit_logs)');
}

function migrateInventoryWarehouses() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id, name),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      warehouse_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (warehouse_id, variant_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_warehouse_id INTEGER NOT NULL,
      destination_warehouse_id INTEGER NOT NULL,
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      count_type TEXT NOT NULL CHECK(count_type IN ('full', 'partial')),
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      expected_quantity INTEGER NOT NULL,
      counted_quantity INTEGER NOT NULL CHECK(counted_quantity >= 0),
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('opening', 'sale', 'purchase', 'return', 'transfer_in', 'transfer_out', 'adjustment', 'count')),
      quantity_change INTEGER NOT NULL,
      quantity_after INTEGER NOT NULL CHECK(quantity_after >= 0),
      reference_type TEXT,
      reference_id INTEGER,
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_variant ON warehouse_stock(variant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_history ON inventory_movements(warehouse_id, variant_id, created_at DESC);
  `);

  addColumnIfMissing('sales', 'branch_id', 'INTEGER REFERENCES branches(id)');
  addColumnIfMissing('sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');

  const migrate = db.transaction(() => {
    let branch = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
    if (!branch) {
      const result = db.prepare('INSERT INTO branches (name) VALUES (?)').run('الفرع الرئيسي');
      branch = { id: result.lastInsertRowid };
    }

    let warehouse = db.prepare(
      'SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 ORDER BY id LIMIT 1'
    ).get(branch.id);
    if (!warehouse) {
      const existing = db.prepare(
        'SELECT id FROM warehouses WHERE branch_id = ? ORDER BY id LIMIT 1'
      ).get(branch.id);
      if (existing) {
        db.prepare('UPDATE warehouses SET is_default = 1 WHERE id = ?').run(existing.id);
        warehouse = existing;
      } else {
        const result = db.prepare(
          'INSERT INTO warehouses (branch_id, name, is_default) VALUES (?, ?, 1)'
        ).run(branch.id, 'المخزن الرئيسي');
        warehouse = { id: result.lastInsertRowid };
      }
    }

    const variants = db.prepare(`
      SELECT pv.id, pv.stock_quantity, pv.low_stock_threshold
      FROM product_variants pv
      LEFT JOIN warehouse_stock ws ON ws.variant_id = pv.id
      WHERE ws.variant_id IS NULL
    `).all();
    const insertStock = db.prepare(`
      INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
      VALUES (?, ?, ?, ?)
    `);
    const insertOpening = db.prepare(`
      INSERT INTO inventory_movements
        (warehouse_id, variant_id, movement_type, quantity_change, quantity_after, notes)
      VALUES (?, ?, 'opening', ?, ?, ?)
    `);
    for (const variant of variants) {
      const quantity = Math.max(0, Number(variant.stock_quantity) || 0);
      insertStock.run(warehouse.id, variant.id, quantity, Math.max(0, Number(variant.low_stock_threshold) || 0));
      if (quantity > 0) {
        insertOpening.run(warehouse.id, variant.id, quantity, quantity, 'ترحيل الرصيد الحالي إلى المخزن الرئيسي');
      }
    }
  });
  migrate();
}

function migrateChannelsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        channel_type TEXT NOT NULL CHECK(channel_type IN ('pos', 'online_store', 'salla', 'zid', 'woocommerce', 'shopify', 'branch_outlet', 'wholesale', 'other')),
        warehouse_id INTEGER,
        sync_mode TEXT DEFAULT 'auto' CHECK(sync_mode IN ('auto', 'manual', 'periodic')),
        auto_deduct_stock INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        api_key TEXT,
        api_secret TEXT,
        webhook_url TEXT,
        stock_buffer_percentage REAL DEFAULT 0,
        last_sync_at DATETIME,
        settings_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS channel_stock_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        variant_id INTEGER NOT NULL,
        allocated_quantity INTEGER NOT NULL DEFAULT 0,
        reserved_quantity INTEGER NOT NULL DEFAULT 0,
        channel_price REAL,
        is_synced INTEGER NOT NULL DEFAULT 1,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, variant_id),
        FOREIGN KEY (channel_id) REFERENCES sales_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        sync_action TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'warning')),
        items_count INTEGER DEFAULT 0,
        details_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES sales_channels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_channel_stock_channel ON channel_stock_allocations(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_stock_variant ON channel_stock_allocations(variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_logs_channel ON channel_sync_logs(channel_id, created_at DESC);
  `);

  // تهيئة قنوات افتراضية إن لم تكن موجودة
  const count = db.prepare('SELECT COUNT(*) as count FROM sales_channels').get();
  if (count.count === 0) {
    const defaultWh = db.prepare('SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1').get() ||
                      db.prepare('SELECT id FROM warehouses LIMIT 1').get();
    const whId = defaultWh ? defaultWh.id : null;
    const insertChannel = db.prepare(`
      INSERT INTO sales_channels (name, channel_type, warehouse_id, sync_mode, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    try {
      insertChannel.run('نقطة البيع الكاشير (POS)', 'pos', whId, 'auto');
      insertChannel.run('المتجر الإلكتروني (Online Store)', 'online_store', whId, 'auto');
      insertChannel.run('متجر سلة (Salla)', 'salla', whId, 'auto');
    } catch {}
  }
}

function migrateUIConfigTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ui_configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        config_key TEXT NOT NULL DEFAULT '_all',
        config_json TEXT NOT NULL DEFAULT '{}',
        role_or_user TEXT DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope, config_key, role_or_user)
    );

    DELETE FROM ui_configurations
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM ui_configurations
      GROUP BY scope, config_key, COALESCE(role_or_user, '')
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_configurations_unique_scope_key_role
      ON ui_configurations(scope, config_key, COALESCE(role_or_user, ''));
  `);
  
  const scopes = ['dashboard', 'pos', 'products_table', 'shortcuts', 'invoice', 'order_form'];
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO ui_configurations (scope, config_key, config_json)
    VALUES (?, '_all', ?)
  `);
  
  const initDefaults = db.transaction(() => {
    // We only insert default configurations if the table is empty for these scopes
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ui_configurations');
    if (countStmt.get().count === 0) {
      const defaults = {
        dashboard: { cards: [{id: 'sales_today', visible: true, order: 1}, {id: 'revenue_today', visible: true, order: 2}, {id: 'low_stock_count', visible: true, order: 3}, {id: 'customers_count', visible: true, order: 4}, {id: 'top_products', visible: true, order: 5}, {id: 'recent_sales', visible: true, order: 6}] },
        pos: { fields: [{id: 'barcode_search', visible: true, order: 1}, {id: 'category_filter', visible: true, order: 2}, {id: 'customer_select', visible: true, order: 3}, {id: 'discount_field', visible: true, order: 4}, {id: 'notes_field', visible: true, order: 5}] },
        products_table: { columns: [{id: 'name', visible: true, order: 1}, {id: 'sku', visible: true, order: 2}, {id: 'barcode', visible: true, order: 3}, {id: 'category', visible: true, order: 4}, {id: 'price', visible: true, order: 5}, {id: 'stock', visible: true, order: 6}, {id: 'image', visible: true, order: 7}] },
        shortcuts: { buttons: [{id: 'new_sale', visible: true, order: 1}, {id: 'quick_return', visible: true, order: 2}, {id: 'hold_order', visible: true, order: 3}, {id: 'open_drawer', visible: true, order: 4}] },
        invoice: { sections: [{id: 'header', visible: true, order: 1}, {id: 'logo', visible: true, order: 2}, {id: 'items_table', visible: true, order: 3}, {id: 'totals', visible: true, order: 4}, {id: 'footer', visible: true, order: 5}, {id: 'qr_code', visible: true, order: 6}] },
        order_form: { fields: [{id: 'customer_name', required: true, visible: true, order: 1}, {id: 'phone', required: true, visible: true, order: 2}, {id: 'address', required: false, visible: true, order: 3}, {id: 'delivery_date', required: false, visible: true, order: 4}, {id: 'notes', required: false, visible: true, order: 5}, {id: 'priority', required: false, visible: true, order: 6}] }
      };
      
      for (const scope of scopes) {
        insertStmt.run(scope, JSON.stringify(defaults[scope]));
      }
    }
  });
  
  initDefaults();
  console.log('تم التحقق من جدول إعدادات الشاشة (ui_configurations)');
}

function migrateOnboardingTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sector_key TEXT UNIQUE NOT NULL,
        sector_name TEXT NOT NULL,
        sector_tagline TEXT,
        icon TEXT,
        primary_action_title TEXT NOT NULL,
        primary_action_route TEXT NOT NULL,
        terminology_json TEXT NOT NULL DEFAULT '{}',
        enabled_modules_json TEXT NOT NULL DEFAULT '[]',
        default_units_json TEXT NOT NULL DEFAULT '[]',
        starter_categories_json TEXT NOT NULL DEFAULT '[]',
        starter_products_json TEXT NOT NULL DEFAULT '[]',
        starter_stations_json TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS onboarding_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_completed INTEGER NOT NULL DEFAULT 0,
        current_step INTEGER NOT NULL DEFAULT 1,
        selected_sector TEXT,
        custom_sector_name TEXT,
        setup_summary_json TEXT DEFAULT '{}',
        completed_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_onboarding_presets_key ON onboarding_presets(sector_key);
  `);

  // التحقق من وجود الأعمدة الجديدة
  try {
    const cols = db.prepare('PRAGMA table_info(onboarding_presets)').all().map((c) => c.name);
    if (!cols.includes('starter_working_hours_json')) {
      db.exec("ALTER TABLE onboarding_presets ADD COLUMN starter_working_hours_json TEXT DEFAULT '{}';");
    }
    if (!cols.includes('starter_addons_json')) {
      db.exec("ALTER TABLE onboarding_presets ADD COLUMN starter_addons_json TEXT DEFAULT '[]';");
    }
  } catch {}

  // تهيئة حالة الـ Onboarding الأولية إذا لم تكن موجودة
  db.prepare(`
    INSERT OR IGNORE INTO onboarding_state (id, is_completed, current_step)
    VALUES (1, 0, 1)
  `).run();

  // تغذية القوالب الافتراضية
  try {
    const { SECTOR_PRESETS } = require('./onboardingPresets.data');
    const insertPreset = db.prepare(`
      INSERT INTO onboarding_presets (
        sector_key, sector_name, sector_tagline, icon,
        primary_action_title, primary_action_route,
        terminology_json, enabled_modules_json, default_units_json,
        starter_working_hours_json, starter_categories_json,
        starter_addons_json, starter_products_json, starter_stations_json
      ) VALUES (
        @sector_key, @sector_name, @sector_tagline, @icon,
        @primary_action_title, @primary_action_route,
        @terminology_json, @enabled_modules_json, @default_units_json,
        @starter_working_hours_json, @starter_categories_json,
        @starter_addons_json, @starter_products_json, @starter_stations_json
      )
      ON CONFLICT(sector_key) DO UPDATE SET
        sector_name = excluded.sector_name,
        sector_tagline = excluded.sector_tagline,
        icon = excluded.icon,
        primary_action_title = excluded.primary_action_title,
        primary_action_route = excluded.primary_action_route,
        terminology_json = excluded.terminology_json,
        enabled_modules_json = excluded.enabled_modules_json,
        default_units_json = excluded.default_units_json,
        starter_working_hours_json = excluded.starter_working_hours_json,
        starter_categories_json = excluded.starter_categories_json,
        starter_addons_json = excluded.starter_addons_json,
        starter_products_json = excluded.starter_products_json,
        starter_stations_json = excluded.starter_stations_json
    `);

    const seedTx = db.transaction(() => {
      for (const preset of SECTOR_PRESETS) {
        insertPreset.run({
          sector_key: preset.sector_key,
          sector_name: preset.sector_name,
          sector_tagline: preset.sector_tagline || '',
          icon: preset.icon || 'store',
          primary_action_title: preset.primary_action_title,
          primary_action_route: preset.primary_action_route,
          terminology_json: JSON.stringify(preset.terminology || {}),
          enabled_modules_json: JSON.stringify(preset.enabled_modules || []),
          default_units_json: JSON.stringify(preset.default_units || []),
          starter_working_hours_json: JSON.stringify(preset.starter_working_hours || null),
          starter_categories_json: JSON.stringify(preset.starter_categories || []),
          starter_addons_json: JSON.stringify(preset.starter_addons || []),
          starter_products_json: JSON.stringify(preset.starter_products || []),
          starter_stations_json: JSON.stringify(preset.starter_stations || []),
        });
      }
    });
    seedTx();
    console.log('تم التحقق من جداول وقوالب معالج التهيئة الأولى (onboarding_presets)');
  } catch (err) {
    console.error('خطأ أثناء تهيئة قوالب onboarding:', err);
  }
}

function migrateGroceryTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        unit_name TEXT NOT NULL,
        conversion_factor REAL NOT NULL DEFAULT 1 CHECK(conversion_factor > 0),
        barcode TEXT UNIQUE,
        selling_price REAL NOT NULL CHECK(selling_price >= 0),
        purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
        is_base_unit INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id, unit_name),
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        warehouse_id INTEGER,
        batch_number TEXT,
        expiry_date DATE NOT NULL,
        production_date DATE,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
        supplier_id INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scale_barcode_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'ميزان الأجبان واللحوم',
        prefix TEXT NOT NULL DEFAULT '20',
        plu_length INTEGER NOT NULL DEFAULT 5,
        encoding_type TEXT NOT NULL DEFAULT 'weight_grams' CHECK(encoding_type IN ('weight_grams', 'total_price')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grocery_speed_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        shortcut_code TEXT,
        color TEXT DEFAULT '#10B981',
        icon TEXT DEFAULT '🛒',
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_units_variant ON product_units(variant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_units_variant_name ON product_units(variant_id, unit_name);
    CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date, quantity);
    CREATE INDEX IF NOT EXISTS idx_product_batches_variant ON product_batches(variant_id);
    CREATE INDEX IF NOT EXISTS idx_grocery_speed_keys_order ON grocery_speed_keys(display_order);
  `);

  try {
    const batchCols = db.prepare("PRAGMA table_info(product_batches)").all().map((c) => c.name);
    if (!batchCols.includes('warehouse_id')) {
      db.exec("ALTER TABLE product_batches ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON product_batches(warehouse_id);");
  } catch {}
}

function migrateCasesTables(dbInstance = db) {
  const hasLawyerTimeLogs = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lawyer_time_logs'").get();
  if (hasLawyerTimeLogs) {
    const fks = dbInstance.prepare('PRAGMA foreign_key_list(lawyer_time_logs)').all();
    const userFk = fks.find((f) => f.from === 'lawyer_id' && f.table === 'users');
    if (userFk && userFk.on_delete === 'SET NULL') {
      dbInstance.pragma('foreign_keys = OFF');
      try {
        dbInstance.exec(`
          BEGIN TRANSACTION;
          DROP TRIGGER IF EXISTS trg_restrict_case_delete_with_history;
          CREATE TABLE lawyer_time_logs_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              case_id INTEGER NOT NULL,
              lawyer_id INTEGER NOT NULL,
              hours REAL NOT NULL CHECK(hours > 0),
              hourly_rate REAL NOT NULL DEFAULT 0,
              total_amount REAL NOT NULL DEFAULT 0,
              activity_description TEXT NOT NULL,
              date DATE NOT NULL,
              is_billed INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
              FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE RESTRICT
          );
          INSERT INTO lawyer_time_logs_migrated (
            id, case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date, is_billed, created_at
          )
          SELECT 
            id, case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date, is_billed, created_at
          FROM lawyer_time_logs;
          DROP TABLE lawyer_time_logs;
          ALTER TABLE lawyer_time_logs_migrated RENAME TO lawyer_time_logs;
          CREATE INDEX IF NOT EXISTS idx_lawyer_time_logs_case ON lawyer_time_logs(case_id);
          CREATE TRIGGER IF NOT EXISTS trg_restrict_case_delete_with_history
          BEFORE DELETE ON legal_cases
          WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
           AND (EXISTS (SELECT 1 FROM case_financials WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM court_sessions WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM case_documents WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM lawyer_time_logs WHERE case_id = OLD.id))
          BEGIN
              SELECT RAISE(ABORT, 'Close cases instead of deleting case and financial history');
          END;
          COMMIT;
        `);
      } catch (err) {
        try { dbInstance.exec('ROLLBACK;'); } catch {}
        throw err;
      } finally {
        dbInstance.pragma('foreign_keys = ON');
      }
    }
  }
}

function migrateCloudSyncV3(dbInstance = db) {
  const syncTables = [
    'sales',
    'sale_items',
    'products',
    'product_variants',
    'customers',
    'returns',
    'shifts',
    'orders',
  ];

  dbInstance.transaction(() => {
    for (const table of syncTables) {
      const hasTable = dbInstance
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(table);
      if (!hasTable) continue;

      const columns = dbInstance
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);

      if (!columns.includes('uuid')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN uuid TEXT;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود uuid إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('is_synced')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود is_synced إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('synced_at')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN synced_at DATETIME;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود synced_at إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('updated_at')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود updated_at إلى ${table}:`, e.message);
          }
        }
      }

      // فهارس تسريع الاستعلامات والمزامنة
      try {
        dbInstance.exec(`
          CREATE INDEX IF NOT EXISTS idx_${table}_sync ON ${table}(is_synced);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid) WHERE uuid IS NOT NULL;
        `);
      } catch {}

      // توليد UUID فوري للسجلات الحالية التي لا تملك UUID
      try {
        const rowsWithoutUuid = dbInstance
          .prepare(`SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = '' LIMIT 5000`)
          .all();
        if (rowsWithoutUuid.length > 0) {
          const updateStmt = dbInstance.prepare(`UPDATE ${table} SET uuid = ? WHERE id = ?`);
          for (const row of rowsWithoutUuid) {
            updateStmt.run(crypto.randomUUID(), row.id);
          }
        }
      } catch {}
    }
  })();

  // فحص سلامة وتكامل المفاتيح الأجنبية
  try {
    const fkIssues = dbInstance.prepare('PRAGMA foreign_key_check').all();
    if (fkIssues.length > 0) {
      console.warn('[DB] تنبيه تكامل المفاتيح الأجنبية:', fkIssues);
    }
  } catch {}
}

function migrateKitchenOrdersV5(database = db) {
  const salesTable = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sales'"
  ).get();
  if (!salesTable) return;

  const columns = new Set(database.prepare('PRAGMA table_info(sales)').all().map((column) => column.name));
  if (!columns.has('order_mode')) {
    database.exec("ALTER TABLE sales ADD COLUMN order_mode TEXT CHECK(order_mode IS NULL OR order_mode IN ('dine_in', 'takeaway', 'delivery'))");
  }
  if (!columns.has('kitchen_status')) {
    database.exec("ALTER TABLE sales ADD COLUMN kitchen_status TEXT CHECK(kitchen_status IS NULL OR kitchen_status IN ('new', 'preparing', 'ready', 'served'))");
  }
}

function runAllMigrations(dbInstance = db) {
  const currentVersion = dbInstance.pragma('user_version', { simple: true }) || 0;

  if (currentVersion >= DATABASE_SCHEMA_VERSION) {
    // قاعدة البيانات محدثة بالفعل للإصدار المستهدف، تخطي الترحيلات لتسريع إقلاع التطبيق
    return;
  }

  console.log(`[DB] بدء فحص وترقية قاعدة البيانات (الإصدار الحالي: ${currentVersion} -> المستهدف: ${DATABASE_SCHEMA_VERSION})...`);

  // إذا كانت قاعدة بيانات جديدة أو قديمة بدون schema، قم بتهيئتها
  initDatabase();

  // ترحيلات الإصدارات السابقة (v1 -> v2)
  if (currentVersion < 2) {
    const migrations = [
      ['migrateSalesTable', migrateSalesTable],
      ['migrateUsersTable', migrateUsersTable],
      ['migrateReviewsTables', migrateReviewsTables],
      ['migrateLeaveRequestsTable', migrateLeaveRequestsTable],
      ['migrateReturnsTable', migrateReturnsTable],
      ['migrateSuppliersTable', migrateSuppliersTable],
      ['migrateShiftsTable', migrateShiftsTable],
      ['migrateSettingsTable', migrateSettingsTable],
      ['migrateNotificationsTable', migrateNotificationsTable],
      ['migrateCustomersTable', migrateCustomersTable],
      ['migrateOrdersTables', migrateOrdersTables],
      ['migrateAppointmentsTables', migrateAppointmentsTables],
      ['migrateSubscriptionsTables', migrateSubscriptionsTables],
      ['migrateCommissionsTables', migrateCommissionsTables],
      ['migrateCRMTables', migrateCRMTables],
      ['migrateCashierAuditLogsTable', migrateCashierAuditLogsTable],
      ['migrateInventoryWarehouses', migrateInventoryWarehouses],
      ['migrateChannelsTables', migrateChannelsTables],
      ['migrateUIConfigTables', migrateUIConfigTables],
      ['migrateOnboardingTables', migrateOnboardingTables],
      ['migrateGroceryTables', migrateGroceryTables],
      ['migrateCasesTables', () => migrateCasesTables(dbInstance)],
    ];

    for (const [name, fn] of migrations) {
      try {
        fn();
      } catch (err) {
        err.message = `[${name}] ${err.message}`;
        throw err;
      }
    }
    dbInstance.pragma('user_version = 2');
  }

  // ترقية الإصدار 3 (أعمدة المزامنة السحابية ومعرفات UUID وفهارس الأداء)
  if (currentVersion < 3) {
    migrateCloudSyncV3(dbInstance);
    dbInstance.pragma('user_version = 3');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 3 (دعم المزامنة ومعرفات UUID).');
  }

  if (currentVersion < 4) {
    migrateShiftsTable();
    dbInstance.pragma('user_version = 4');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 4 (ربط الوردية بسجل الحضور).');
  }

  if (currentVersion < 5) {
    migrateKitchenOrdersV5(dbInstance);
    dbInstance.pragma('user_version = 5');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 5 (أوضاع طلبات المطاعم وحالة المطبخ).');
  }

  if (currentVersion < 6) {
    migrateAdvancedCRMTables(dbInstance);
    dbInstance.pragma('user_version = 6');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 6 (وحدات CRM المتقدمة).');
  }

  if (currentVersion < 7) {
    migrateCourtsTables(dbInstance);
    dbInstance.pragma('user_version = 7');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 7 (دليل المحاكم).');
  }

  if (currentVersion < 8) {
    migrateLegalCaseArchiveFinance(dbInstance);
    dbInstance.pragma('user_version = 8');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 8 (أرشيف وماليات القضايا).');
  }

  if (currentVersion < 9) {
    migrateCustomerPowerOfAttorneyTables(dbInstance);
    dbInstance.pragma('user_version = 9');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 9 (توكيلات الموكلين).');
  }

  if (currentVersion < 10) {
    migrateLegalClientInteractions(dbInstance);
    dbInstance.pragma('user_version = 10');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 10 (سجل تواصل قانوني مستقل).');
  }

  if (currentVersion < 11) {
    migrateLegalCaseTasks(dbInstance);
    dbInstance.pragma('user_version = 11');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 11 (مهام ومتابعات القضايا).');
  }
}

function migrateLegalCaseTasks(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS legal_case_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      session_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT NOT NULL,
      reminder_at TEXT,
      assigned_lawyer_id INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
      reminder_sent INTEGER NOT NULL DEFAULT 0 CHECK(reminder_sent IN (0, 1)),
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_case_due
      ON legal_case_tasks(case_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_reminders
      ON legal_case_tasks(status, reminder_sent, reminder_at);
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_assignee
      ON legal_case_tasks(assigned_lawyer_id, status, due_at);
  `);
}

function migrateLegalClientInteractions(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS legal_client_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      created_by INTEGER,
      type TEXT NOT NULL CHECK(type IN ('call', 'message', 'note', 'complaint')),
      subject TEXT NOT NULL,
      details TEXT,
      follow_up_date TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_customer
      ON legal_client_interactions(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_followup
      ON legal_client_interactions(follow_up_date);
  `);
}

function migrateCustomerPowerOfAttorneyTables(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS customer_power_of_attorneys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_customer
      ON customer_power_of_attorneys(customer_id, issued_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_expiry
      ON customer_power_of_attorneys(expires_at);
  `);
}

function migrateCourtsTables(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS courts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      court_type TEXT NOT NULL CHECK(court_type IN (
        'first_instance', 'cassation', 'appeals', 'family',
        'criminal', 'commercial', 'labor', 'administrative'
      )),
      specialization TEXT,
      notes TEXT,
      phone TEXT,
      city TEXT,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courts_name_active
      ON courts(name COLLATE NOCASE) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS idx_courts_type_active ON courts(court_type, is_active);
  `);

  const caseColumns = dbInstance.prepare('PRAGMA table_info(legal_cases)').all();
  if (caseColumns.length && !caseColumns.some((column) => column.name === 'court_id')) {
    dbInstance.exec('ALTER TABLE legal_cases ADD COLUMN court_id TEXT');
  }
}

function migrateLegalCaseArchiveFinance(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS case_document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, version),
      FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_case_document_versions_document
      ON case_document_versions(document_id, version DESC);
  `);

  const hasDocuments = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'case_documents'"
  ).get();
  if (hasDocuments) {
    dbInstance.exec(`
      INSERT OR IGNORE INTO case_document_versions
        (document_id, version, file_path, file_size, uploaded_by, created_at)
      SELECT id, COALESCE(version, 1), file_path, file_size, uploaded_by, created_at
      FROM case_documents
    `);
  }

  const hasCases = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legal_cases'"
  ).get();
  const hasFinancials = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'case_financials'"
  ).get();
  if (hasCases && hasFinancials) {
    const reconcile = dbInstance.transaction(() => {
      dbInstance.exec(`
        INSERT INTO case_financials
          (case_id, type, amount, date, description, paid_by_client)
        SELECT c.id, 'fee_payment',
               c.paid_amount - COALESCE((
                 SELECT SUM(f.amount) FROM case_financials f
                 WHERE f.case_id = c.id AND f.type = 'fee_payment'
               ), 0),
               c.created_at,
               'دفعة أتعاب افتتاحية لمزامنة الرصيد السابق مع سجل الحركات',
               1
        FROM legal_cases c
        WHERE c.paid_amount > COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = c.id AND f.type = 'fee_payment'
        ), 0)
      `);
      dbInstance.exec(`
        UPDATE legal_cases
        SET paid_amount = COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = legal_cases.id AND f.type = 'fee_payment'
        ), 0)
        WHERE paid_amount != COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = legal_cases.id AND f.type = 'fee_payment'
        ), 0)
      `);
    });
    reconcile();
  }
}

module.exports = {
  db,
  configureDatabaseConnection,
  checkpointWalIfNeeded,
  clearExpiredTrialData,
  initDatabase,
  runAllMigrations,
  migrateCloudSyncV3,
  migrateSalesTable,
  migrateUsersTable,
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateSuppliersTable,
  migrateShiftsTable,
  migrateKitchenOrdersV5,
  migrateReturnsTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateAppointmentsTables,
  migrateLegalCaseTasks,
  migrateSubscriptionsTables,
  migrateCommissionsTables,
  migrateCRMTables,
  migrateAdvancedCRMTables,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
  migrateCustomerPowerOfAttorneyTables,
  migrateLegalClientInteractions,
  migrateCashierAuditLogsTable,
  migrateInventoryWarehouses,
  migrateChannelsTables,
  migrateUIConfigTables,
  migrateOnboardingTables,
  migrateGroceryTables,
  migrateCasesTables,
  closeDatabase,
  dbPath
};
