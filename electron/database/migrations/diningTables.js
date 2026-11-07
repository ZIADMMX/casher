// Restaurant tables with an open check per table. A check collects items over
// several kitchen rounds and turns into one normal sale when it is paid, so
// nothing here touches the append-only sales ledger until payment.
const GUARD = '(SELECT foreign_keys FROM pragma_foreign_keys) = 1';

const SQL = `
CREATE TABLE IF NOT EXISTS dining_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dining_tables_active_name
    ON dining_tables(name) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS table_tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'paid', 'cancelled')),
    sale_id INTEGER,
    opened_by INTEGER,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (table_id) REFERENCES dining_tables(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE SET NULL
);
-- One open check per table at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_tabs_one_open
    ON table_tabs(table_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS table_tab_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tab_id INTEGER NOT NULL,
    kitchen_status TEXT NOT NULL DEFAULT 'new' CHECK(kitchen_status IN ('new', 'preparing', 'ready', 'served')),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tab_id) REFERENCES table_tabs(id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_table_tab_rounds_tab ON table_tab_rounds(tab_id);

CREATE TABLE IF NOT EXISTS table_tab_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tab_id INTEGER NOT NULL,
    round_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    modifiers TEXT,
    FOREIGN KEY (tab_id) REFERENCES table_tabs(id),
    FOREIGN KEY (round_id) REFERENCES table_tab_rounds(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);
CREATE INDEX IF NOT EXISTS idx_table_tab_items_tab ON table_tab_items(tab_id);

-- Same rules as kitchen_status_events: who moved a round, from where to where.
CREATE TABLE IF NOT EXISTS table_round_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    from_status TEXT NOT NULL CHECK(from_status IN ('new', 'preparing', 'ready', 'served')),
    to_status TEXT NOT NULL CHECK(to_status IN ('new', 'preparing', 'ready', 'served')),
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id) REFERENCES table_tab_rounds(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_table_round_events_round ON table_round_events(round_id, id);

CREATE TRIGGER IF NOT EXISTS trg_table_round_events_no_delete
BEFORE DELETE ON table_round_events
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Kitchen history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_table_round_events_no_update
BEFORE UPDATE ON table_round_events
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Kitchen history is append-only');
END;

-- Sent items are what the kitchen cooked; they can't be edited or removed.
CREATE TRIGGER IF NOT EXISTS trg_table_tab_items_no_change
BEFORE UPDATE ON table_tab_items
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Sent table items cannot be changed');
END;

CREATE TRIGGER IF NOT EXISTS trg_table_tab_items_no_delete
BEFORE DELETE ON table_tab_items
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Sent table items cannot be changed');
END;
`;

function ensureDiningTables(database) {
  database.exec(SQL);
}

// v24: a check can be paid in parts, so a sent line may be marked paid once.
// Everything else about it stays fixed.
const TAB_ITEMS_GUARD_SQL = `CREATE TRIGGER IF NOT EXISTS trg_table_tab_items_no_change
BEFORE UPDATE ON table_tab_items
WHEN ${GUARD}
  AND (OLD.paid_sale_id IS NOT NULL
    OR NEW.tab_id IS NOT OLD.tab_id OR NEW.round_id IS NOT OLD.round_id
    OR NEW.variant_id IS NOT OLD.variant_id OR NEW.quantity IS NOT OLD.quantity
    OR NEW.unit_price IS NOT OLD.unit_price OR NEW.modifiers IS NOT OLD.modifiers
    OR NEW.note IS NOT OLD.note)
BEGIN
    SELECT RAISE(ABORT, 'Sent table items cannot be changed');
END;`;

function allowSplitPayments(database) {
  require('./helpers').addColumnIfMissing('table_tab_items', 'paid_sale_id', 'INTEGER REFERENCES sales(id)', database);
  database.exec('DROP TRIGGER IF EXISTS trg_table_tab_items_no_change');
  database.exec(TAB_ITEMS_GUARD_SQL);
}

module.exports = { ensureDiningTables, allowSplitPayments, DINING_TABLES_SQL: SQL };
