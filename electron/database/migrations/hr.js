const { db } = require('../connection');

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

module.exports = {
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateShiftsTable,
  migrateCommissionsTables,
};
