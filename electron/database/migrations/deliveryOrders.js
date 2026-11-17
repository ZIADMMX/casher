// Orders that arrive from delivery apps (through the Worker inbox) or are typed in by phone, waiting for the restaurant to accept them.
function ensureDeliveryOrders(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS delivery_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      customer_name TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      items_json TEXT NOT NULL,
      app_total REAL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
      reject_reason TEXT,
      sale_id INTEGER,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME,
      UNIQUE (source, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status, id);
  `);
}

module.exports = { ensureDeliveryOrders };
