const { addColumnIfMissing } = require('./helpers');

// Gym trainers, weekly group classes, class bookings and private-training packages.
// Also: timed freezes and upgrade history on subscriptions, and the gym member profile
// (emergency contact, health notes, trainer). Safe to run on every start: tables and indexes are created only when missing.
function ensureGymTraining(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS gym_trainers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT,
      session_rate REAL NOT NULL DEFAULT 0,
      commission_pct REAL NOT NULL DEFAULT 18,
      group_fee REAL NOT NULL DEFAULT 35,
      rating REAL NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gym_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tone TEXT NOT NULL DEFAULT 'peach',
      trainer_id INTEGER NOT NULL REFERENCES gym_trainers(id),
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 45,
      capacity INTEGER NOT NULL DEFAULT 20,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gym_class_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES gym_classes(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      session_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'waitlist', 'attended')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (class_id, customer_id, session_date)
    );
    CREATE INDEX IF NOT EXISTS idx_gym_class_bookings_date ON gym_class_bookings(session_date, class_id);

    CREATE TABLE IF NOT EXISTS gym_pt_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      trainer_id INTEGER NOT NULL REFERENCES gym_trainers(id),
      sessions_total INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      valid_until TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gym_pt_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL REFERENCES gym_pt_packages(id) ON DELETE CASCADE,
      trainer_id INTEGER NOT NULL REFERENCES gym_trainers(id),
      unit_price REAL NOT NULL,
      session_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gym_pt_sessions_trainer ON gym_pt_sessions(trainer_id, session_date);

    CREATE TABLE IF NOT EXISTS gym_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      code_text TEXT,
      result TEXT NOT NULL CHECK (result IN ('allowed', 'warning', 'denied')),
      reason TEXT NOT NULL,
      subscription_id INTEGER,
      gate TEXT NOT NULL DEFAULT 'بوابة 1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gym_checkins_time ON gym_checkins(created_at);
    CREATE INDEX IF NOT EXISTS idx_gym_checkins_customer ON gym_checkins(customer_id, created_at);

    -- One random secret per member: the QR carries "GM-<id>-<token>", so every card is different and cannot be guessed.
    CREATE TABLE IF NOT EXISTS gym_member_codes (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gym_member_profiles (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
      emergency_name TEXT,
      emergency_phone TEXT,
      health_notes TEXT,
      trainer_id INTEGER REFERENCES gym_trainers(id),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // frozen_until: when a timed freeze ends by itself (NULL = open-ended freeze).
  // upgraded_from_id: the cancelled subscription this one replaced.
  addColumnIfMissing('customer_subscriptions', 'frozen_until', 'DATETIME', dbInstance);
  addColumnIfMissing('customer_subscriptions', 'upgraded_from_id', 'INTEGER', dbInstance);
}

module.exports = { ensureGymTraining };
