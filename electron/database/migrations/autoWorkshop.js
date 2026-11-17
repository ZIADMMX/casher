// ورش السيارات: سجل السيارات، أوامر الشغل (قطع + مصنعية) وتذكيرات الصيانة الدورية.
// آمن للتكرار: كل الجداول والفهارس بتتعمل لو ناقصة بس.
const { addColumnIfMissing } = require('./helpers');

function ensureAutoWorkshop(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      plate TEXT NOT NULL UNIQUE,
      make TEXT,
      model TEXT,
      year INTEGER CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
      vin TEXT,
      color TEXT,
      odometer INTEGER NOT NULL DEFAULT 0 CHECK (odometer >= 0),
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received','diagnosing','awaiting_approval','in_progress','ready','delivered','cancelled')),
      odometer_in INTEGER NOT NULL CHECK (odometer_in >= 0),
      complaint TEXT,
      diagnosis TEXT,
      mechanic TEXT,
      warranty_days INTEGER NOT NULL DEFAULT 0 CHECK (warranty_days >= 0),
      sale_id INTEGER REFERENCES sales(id),
      warranty_until TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_work_orders_vehicle ON work_orders(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
    CREATE INDEX IF NOT EXISTS idx_work_orders_sale ON work_orders(sale_id);

    CREATE TABLE IF NOT EXISTS work_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('part','labor')),
      variant_id INTEGER REFERENCES product_variants(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      -- القطعة لازم تكون صنف من المخزون عشان الخصم؛ المصنعية وصف حر.
      CHECK (kind = 'labor' OR variant_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_work_order_lines_order ON work_order_lines(work_order_id);

    CREATE TABLE IF NOT EXISTS service_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      due_date TEXT,
      due_odometer INTEGER,
      done_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (due_date IS NOT NULL OR due_odometer IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_service_reminders_vehicle ON service_reminders(vehicle_id, done_at);
  `);
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS odometer_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      km INTEGER NOT NULL CHECK (km >= 0),
      read_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','work_order')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_odometer_readings_vehicle ON odometer_readings(vehicle_id, read_at);
  `);
  // Check-in sheet filled at the workshop door: fuel, body damage, what is in the car, signature, photos.
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS work_order_intakes (
      work_order_id INTEGER PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE,
      fuel_level INTEGER NOT NULL CHECK (fuel_level BETWEEN 0 AND 4),
      damages TEXT NOT NULL DEFAULT '[]',
      checklist TEXT NOT NULL DEFAULT '{}',
      photos TEXT NOT NULL DEFAULT '{}',
      signature TEXT NOT NULL,
      received_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Purchase order raised from a work order's missing parts. Receiving it books a normal supplier invoice (stock + debt).
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS parts_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','received','cancelled')),
      expected_date TEXT,
      purchase_id INTEGER REFERENCES purchases(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      received_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_parts_orders_work_order ON parts_orders(work_order_id, status);
    CREATE TABLE IF NOT EXISTS parts_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parts_order_id INTEGER NOT NULL REFERENCES parts_orders(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
    );
  `);
  addColumnIfMissing('work_order_lines', 'parts_order_id', 'INTEGER REFERENCES parts_orders(id)', dbInstance);
  // When the owner was told about a reminder (sent_at), or when it is due to be sent (send_at).
  addColumnIfMissing('service_reminders', 'sent_at', 'TEXT', dbInstance);
  addColumnIfMissing('service_reminders', 'send_at', 'TEXT', dbInstance);
  // When the owner booked the car in after the reminder (YYYY-MM-DD).
  addColumnIfMissing('service_reminders', 'booked_for', 'TEXT', dbInstance);
  // The label printed under the plate (governorate or body) and its colour: private / authority / military.
  addColumnIfMissing('vehicles', 'plate_city', 'TEXT', dbInstance);
  // Customer car tracking: what the customer sees (status history + the technician's updates), before/after photos,
  // the unguessable link token, and the hash of the last snapshot sent so unchanged orders are not re-uploaded.
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS work_order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('status','note')),
      status TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_work_order_events_order ON work_order_events(work_order_id, id);
    CREATE TABLE IF NOT EXISTS work_order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      phase TEXT NOT NULL CHECK (phase IN ('before','after')),
      caption TEXT,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_work_order_photos_order ON work_order_photos(work_order_id, id);
  `);
  addColumnIfMissing('work_orders', 'tracking_token', 'TEXT', dbInstance);
  addColumnIfMissing('work_orders', 'tracking_hash', 'TEXT', dbInstance);
  dbInstance.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_tracking_token ON work_orders(tracking_token) WHERE tracking_token IS NOT NULL');
  addColumnIfMissing('work_order_lines', 'done', 'INTEGER NOT NULL DEFAULT 0', dbInstance);
  addColumnIfMissing('vehicles', 'plate_kind', "TEXT NOT NULL DEFAULT 'private'", dbInstance);
}

module.exports = { ensureAutoWorkshop };
