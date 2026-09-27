const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const userDataDir = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || __dirname, 'kashiear');
if (!fs.existsSync(userDataDir)) {
  try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
}
const dbPath = path.join(userDataDir, 'shop.db');
const DATABASE_SCHEMA_VERSION = 2;

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64 MB cache in memory
db.pragma('temp_store = MEMORY');

function initDatabase() {
  // فحص أولي لضمان وجود أعمدة sales الأساسية في قواعد البيانات القديمة قبل تنفيذ الـ schema
  try {
    const hasSales = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
    if (hasSales) {
      const salesCols = db.prepare("PRAGMA table_info(sales)").all().map((c) => c.name);
      if (!salesCols.includes('shift_id')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN shift_id INTEGER;"); } catch {}
      }
      if (!salesCols.includes('customer_name')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN customer_name TEXT;"); } catch {}
      }
      if (!salesCols.includes('customer_phone')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN customer_phone TEXT;"); } catch {}
      }
      if (!salesCols.includes('due_date')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN due_date DATETIME;"); } catch {}
      }
      if (!salesCols.includes('order_id')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN order_id INTEGER;"); } catch {}
      }
      if (!salesCols.includes('subscription_id')) {
        try { db.exec("ALTER TABLE sales ADD COLUMN subscription_id INTEGER;"); } catch {}
      }
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
  } catch (e) {
    console.warn('تنبيه فحص جدول sales:', e.message);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Performance Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  console.log('Database initialized at:', dbPath);
}

function migrateSalesTable() {
  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion >= DATABASE_SCHEMA_VERSION) return;

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

        db.exec(`
          CREATE TABLE sales_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              shift_id INTEGER,
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
              FOREIGN KEY (customer_id) REFERENCES customers(id),
              FOREIGN KEY (user_id) REFERENCES users(id)
          );

          INSERT INTO sales_new
            (id, shift_id, customer_id, customer_name, customer_phone, user_id, total_amount, discount, payment_method, due_date, created_at)
          SELECT id, ${shiftIdCol}, customer_id, ${customerName}, ${customerPhone}, user_id, total_amount, discount, payment_method, ${dueDate}, created_at
          FROM sales;

          DROP TABLE sales;
          ALTER TABLE sales_new RENAME TO sales;
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
          db.exec(`
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
          `);
        }
      }

      db.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
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
  if (db.open) db.close();
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
  if (statements.length > 0) {
    db.exec(statements.join(';'));
    console.log('تم تحديث جدول users لدعم حالة الحساب ومفتاح الاسترداد');
  }
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
  if (alreadyMigrated) return;

  db.exec(`
    ALTER TABLE returns ADD COLUMN refund_amount REAL DEFAULT 0;
    ALTER TABLE returns ADD COLUMN exchange_variant_id INTEGER;
    ALTER TABLE returns ADD COLUMN user_id INTEGER;
  `);
  console.log('تم تحديث جدول returns لدعم المرتجعات والاستبدال');
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
    app_branding_mode: 'onyx_with_store',
    primary_color: '#2E5BFF',
    secondary_color: '#1D4ED8',
    theme_preset: 'onyx_blue'
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
  console.log('تم التحقق من جداول مركز الطلبات والعمليات (orders)');
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS commission_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total_amount REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'cash',
        notes TEXT,
        paid_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_commission_rules_type ON commission_rules(target_type);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_user ON commission_earnings(user_id);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_status ON commission_earnings(status);
    CREATE INDEX IF NOT EXISTS idx_commission_earnings_sale ON commission_earnings(sale_id);
  `);
  console.log('تم التحقق من جداول العمولات والحوافز (commissions)');
}

function migrateCRMTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        user_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('call', 'note', 'message', 'complaint', 'offer')),
        subject TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'pending')),
        follow_up_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
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
  console.log('تم التحقق من جداول مركز اتصالات العملاء والـ CRM (crm)');
}

module.exports = {
  db,
  initDatabase,
  migrateSalesTable,
  migrateUsersTable,
  migrateSuppliersTable,
  migrateShiftsTable,
  migrateReturnsTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateSubscriptionsTables,
  migrateCommissionsTables,
  migrateCRMTables,
  closeDatabase,
  dbPath
};
