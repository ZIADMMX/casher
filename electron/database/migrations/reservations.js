// Restaurant table reservations: who, how many, when, and (optionally) which table.
// reserved_at is local wall-clock time as 'YYYY-MM-DD HH:MM' (the restaurant's own clock), not UTC.
const { addColumnIfMissing } = require('./helpers');

function ensureReservations(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS table_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER REFERENCES dining_tables(id),
      guest_name TEXT NOT NULL,
      phone TEXT,
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 100),
      reserved_at TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 90 CHECK (duration_min BETWEEN 15 AND 480),
      status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'seated', 'completed', 'cancelled', 'no_show')),
      notes TEXT,
      tab_id INTEGER REFERENCES table_tabs(id),
      reminded_at TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_table_reservations_when ON table_reservations(reserved_at);
    CREATE INDEX IF NOT EXISTS idx_table_reservations_table ON table_reservations(table_id, reserved_at);
  `);
  addColumnIfMissing('table_reservations', 'reminded_at', 'TEXT', dbInstance);
}

module.exports = { ensureReservations };
