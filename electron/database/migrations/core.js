const { db, SALES_SCHEMA_VERSION } = require('../connection');
const { foreignKeyViolationCounts, assertNoNewForeignKeyViolations } = require('./helpers');

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

  // The rebuild below runs with foreign keys off; compare violations before and
  // after it, inside the transaction, so a rebuild that breaks links rolls back.
  const fkBefore = foreignKeyViolationCounts(db);

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

      assertNoNewForeignKeyViolations(fkBefore, 'sales / sale_items', db);
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

// Revoked JWT ids survive restarts; rows are useless after the token expires.
function migrateRevokedTokens(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      revoked_from INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);
  `);
}

module.exports = {
  migrateSalesTable,
  migrateUsersTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCashierAuditLogsTable,
  migrateRevokedTokens,
};
