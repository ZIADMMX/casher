// Every kitchen status change is recorded (who, from, to, when) and the record
// can't be edited or deleted. The database also refuses status jumps that skip
// a step, so nothing outside the kitchen service can rewrite an order's progress.
const GUARD = '(SELECT foreign_keys FROM pragma_foreign_keys) = 1';

const SQL = `
CREATE TABLE IF NOT EXISTS kitchen_status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    from_status TEXT NOT NULL CHECK(from_status IN ('new', 'preparing', 'ready', 'served')),
    to_status TEXT NOT NULL CHECK(to_status IN ('new', 'preparing', 'ready', 'served')),
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kitchen_events_sale ON kitchen_status_events(sale_id, id);

CREATE TRIGGER IF NOT EXISTS trg_kitchen_events_no_delete
BEFORE DELETE ON kitchen_status_events
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Kitchen history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_kitchen_events_no_update
BEFORE UPDATE OF sale_id, from_status, to_status, created_at ON kitchen_status_events
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Kitchen history is append-only');
END;
`;

// Created only once sales.kitchen_status exists (older databases add it later).
const SALES_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS trg_sales_kitchen_one_step
BEFORE UPDATE OF kitchen_status ON sales
WHEN ${GUARD}
  AND NEW.kitchen_status IS NOT OLD.kitchen_status
  AND NOT (
    (COALESCE(OLD.kitchen_status, 'new') = 'new' AND NEW.kitchen_status = 'preparing')
    OR (OLD.kitchen_status = 'preparing' AND NEW.kitchen_status IN ('ready', 'new'))
    OR (OLD.kitchen_status = 'ready' AND NEW.kitchen_status IN ('served', 'preparing'))
    OR (OLD.kitchen_status = 'served' AND NEW.kitchen_status = 'ready')
  )
BEGIN
    SELECT RAISE(ABORT, 'Kitchen status can only move one step');
END;
`;

function ensureKitchenLedger(database) {
  const hasSales = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sales'"
  ).get();
  if (!hasSales) return;
  database.exec(SQL);
  const salesColumns = database.prepare('PRAGMA table_info(sales)').all().map((c) => c.name);
  if (salesColumns.includes('kitchen_status')) database.exec(SALES_TRIGGER);
}

module.exports = { ensureKitchenLedger };
