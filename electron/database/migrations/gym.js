// Gym trainers, weekly group classes, class bookings and private-training packages.
// Safe to run on every start: tables and indexes are created only when missing.
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
  `);
}

module.exports = { ensureGymTraining };
