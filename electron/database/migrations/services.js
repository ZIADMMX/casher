const { db } = require('../connection');

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
    err.message = `فشل ترقية أعمدة جدول الباقات (packages): ${err.message}`;
    throw err;
  }

  console.log('تم التحقق من جداول الاشتراكات والباقات (subscriptions)');
}

module.exports = {
  migrateAppointmentsTables,
  migrateSubscriptionsTables,
};
