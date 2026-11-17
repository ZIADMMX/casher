// Loyalty points: every change of a customer's balance is one ledger row, so the balance can always be explained and rebuilt.
// customers.loyalty_points (already in the schema) holds the current balance.
const { addColumnIfMissing } = require('./helpers');

function ensureLoyalty(dbInstance) {
  addColumnIfMissing('customers', 'loyalty_points', 'INTEGER DEFAULT 0', dbInstance);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sale_id INTEGER,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('earn', 'redeem', 'return', 'adjust')),
      base_amount REAL,
      balance_after INTEGER NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id, id);
    CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_sale ON loyalty_ledger(sale_id);
  `);
}

module.exports = { ensureLoyalty };
