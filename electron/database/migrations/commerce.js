const { db } = require('../connection');
const { addColumnIfMissing } = require('./helpers');

function migrateSuppliersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        address TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        invoice_number TEXT,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        remaining_amount REAL NOT NULL DEFAULT 0,
        payment_status TEXT CHECK(payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
        due_date DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        variant_id INTEGER,
        product_name TEXT NOT NULL,
        size TEXT,
        color TEXT,
        quantity INTEGER NOT NULL,
        purchase_price REAL NOT NULL,
        selling_price REAL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        purchase_id INTEGER,
        amount REAL NOT NULL,
        payment_method TEXT CHECK(payment_method IN ('cash', 'bank_transfer', 'cheque')) DEFAULT 'cash',
        notes TEXT,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
    CREATE INDEX IF NOT EXISTS idx_purchases_due_date ON purchases(due_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
  `);
  console.log('تم التحقق من جداول الموردين وفواتير الشراء والمدفوعات');
}

function migrateReturnsTable() {
  const columns = db.prepare("PRAGMA table_info(returns)").all();
  const alreadyMigrated = columns.some((c) => c.name === 'refund_amount');
  if (!alreadyMigrated) {
    db.exec(`
      ALTER TABLE returns ADD COLUMN refund_amount REAL DEFAULT 0;
      ALTER TABLE returns ADD COLUMN exchange_variant_id INTEGER;
      ALTER TABLE returns ADD COLUMN user_id INTEGER;
    `);
    console.log('تم تحديث جدول returns لدعم المرتجعات والاستبدال');
  }

  if (!columns.some((c) => c.name === 'shift_id')) {
    try {
      db.exec(`
        ALTER TABLE returns ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
        CREATE INDEX IF NOT EXISTS idx_returns_shift ON returns(shift_id);
      `);
      console.log('تم إضافة عمود shift_id لجدول returns');
    } catch (e) {
      console.warn('تنبيه أثناء إضافة shift_id لجدول returns:', e.message);
    }
  }

  if (!columns.some((c) => c.name === 'exchange_price_difference')) {
    db.exec('ALTER TABLE returns ADD COLUMN exchange_price_difference REAL NOT NULL DEFAULT 0');
  }
  if (!columns.some((c) => c.name === 'exchange_payment_method')) {
    db.exec('ALTER TABLE returns ADD COLUMN exchange_payment_method TEXT');
  }
}

function migrateCustomersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'bank_transfer')),
      notes TEXT,
      user_id INTEGER,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
  `);

  const custPayCols = db.prepare("PRAGMA table_info(customer_payments)").all();
  if (!custPayCols.some((c) => c.name === 'shift_id')) {
    try {
      db.exec(`
        ALTER TABLE customer_payments ADD COLUMN shift_id INTEGER REFERENCES shifts(id);
        CREATE INDEX IF NOT EXISTS idx_customer_payments_shift ON customer_payments(shift_id);
      `);
      console.log('تم إضافة عمود shift_id لجدول customer_payments');
    } catch (e) {
      console.warn('تنبيه أثناء إضافة shift_id لجدول customer_payments:', e.message);
    }
  }
}

function migrateOrdersTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        order_type TEXT NOT NULL CHECK(order_type IN ('pos_sale', 'online', 'delivery', 'reservation', 'maintenance', 'tailoring', 'manufacturing', 'service')),
        customer_id INTEGER,
        customer_name TEXT,
        customer_phone TEXT,
        assigned_user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'ready', 'delivered', 'cancelled', 'on_hold')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        due_date DATETIME,
        estimated_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        vehicle_plate TEXT,
        vehicle_make TEXT,
        vehicle_model TEXT,
        vehicle_year INTEGER,
        odometer INTEGER,
        fault_description TEXT,
        requested_part TEXT,
        part_number TEXT,
        requested_quantity INTEGER NOT NULL DEFAULT 1,
        sale_id INTEGER UNIQUE REFERENCES sales(id) ON DELETE SET NULL,
        notes TEXT,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        variant_id INTEGER,
        title TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        user_id INTEGER,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        uploaded_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_assigned ON orders(assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_due_date ON orders(due_date);
    CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_history(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_comments_order ON order_comments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON order_attachments(order_id);
  `);
  const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name));
  const orderColumnMigrations = [
    ['vehicle_plate', 'TEXT'],
    ['vehicle_make', 'TEXT'],
    ['vehicle_model', 'TEXT'],
    ['vehicle_year', 'INTEGER'],
    ['odometer', 'INTEGER'],
    ['fault_description', 'TEXT'],
    ['requested_part', 'TEXT'],
    ['part_number', 'TEXT'],
    ['requested_quantity', 'INTEGER NOT NULL DEFAULT 1'],
    ['sale_id', 'INTEGER REFERENCES sales(id) ON DELETE SET NULL'],
  ];
  for (const [column, definition] of orderColumnMigrations) {
    if (!orderColumns.has(column)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
    }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_sale ON orders(sale_id) WHERE sale_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_vehicle_plate ON orders(vehicle_plate)');
  console.log('تم التحقق من جداول مركز الطلبات والعمليات (orders)');
}

function migrateInventoryWarehouses() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id, name),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      warehouse_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (warehouse_id, variant_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_warehouse_id INTEGER NOT NULL,
      destination_warehouse_id INTEGER NOT NULL,
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      count_type TEXT NOT NULL CHECK(count_type IN ('full', 'partial')),
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      expected_quantity INTEGER NOT NULL,
      counted_quantity INTEGER NOT NULL CHECK(counted_quantity >= 0),
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('opening', 'sale', 'purchase', 'return', 'transfer_in', 'transfer_out', 'adjustment', 'count')),
      quantity_change INTEGER NOT NULL,
      quantity_after INTEGER NOT NULL CHECK(quantity_after >= 0),
      reference_type TEXT,
      reference_id INTEGER,
      user_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_variant ON warehouse_stock(variant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_history ON inventory_movements(warehouse_id, variant_id, created_at DESC);
  `);

  addColumnIfMissing('sales', 'branch_id', 'INTEGER REFERENCES branches(id)');
  addColumnIfMissing('sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');

  const migrate = db.transaction(() => {
    let branch = db.prepare('SELECT id FROM branches ORDER BY id LIMIT 1').get();
    if (!branch) {
      const result = db.prepare('INSERT INTO branches (name) VALUES (?)').run('الفرع الرئيسي');
      branch = { id: result.lastInsertRowid };
    }

    let warehouse = db.prepare(
      'SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 ORDER BY id LIMIT 1'
    ).get(branch.id);
    if (!warehouse) {
      const existing = db.prepare(
        'SELECT id FROM warehouses WHERE branch_id = ? ORDER BY id LIMIT 1'
      ).get(branch.id);
      if (existing) {
        db.prepare('UPDATE warehouses SET is_default = 1 WHERE id = ?').run(existing.id);
        warehouse = existing;
      } else {
        const result = db.prepare(
          'INSERT INTO warehouses (branch_id, name, is_default) VALUES (?, ?, 1)'
        ).run(branch.id, 'المخزن الرئيسي');
        warehouse = { id: result.lastInsertRowid };
      }
    }

    const variants = db.prepare(`
      SELECT pv.id, pv.stock_quantity, pv.low_stock_threshold
      FROM product_variants pv
      LEFT JOIN warehouse_stock ws ON ws.variant_id = pv.id
      WHERE ws.variant_id IS NULL
    `).all();
    const insertStock = db.prepare(`
      INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
      VALUES (?, ?, ?, ?)
    `);
    const insertOpening = db.prepare(`
      INSERT INTO inventory_movements
        (warehouse_id, variant_id, movement_type, quantity_change, quantity_after, notes)
      VALUES (?, ?, 'opening', ?, ?, ?)
    `);
    for (const variant of variants) {
      const quantity = Math.max(0, Number(variant.stock_quantity) || 0);
      insertStock.run(warehouse.id, variant.id, quantity, Math.max(0, Number(variant.low_stock_threshold) || 0));
      if (quantity > 0) {
        insertOpening.run(warehouse.id, variant.id, quantity, quantity, 'ترحيل الرصيد الحالي إلى المخزن الرئيسي');
      }
    }
  });
  migrate();
}

function migrateChannelsTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        channel_type TEXT NOT NULL CHECK(channel_type IN ('pos', 'online_store', 'salla', 'zid', 'woocommerce', 'shopify', 'branch_outlet', 'wholesale', 'other')),
        warehouse_id INTEGER,
        sync_mode TEXT DEFAULT 'auto' CHECK(sync_mode IN ('auto', 'manual', 'periodic')),
        auto_deduct_stock INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        api_key TEXT,
        api_secret TEXT,
        webhook_url TEXT,
        stock_buffer_percentage REAL DEFAULT 0,
        last_sync_at DATETIME,
        settings_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS channel_stock_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        variant_id INTEGER NOT NULL,
        allocated_quantity INTEGER NOT NULL DEFAULT 0,
        reserved_quantity INTEGER NOT NULL DEFAULT 0,
        channel_price REAL,
        is_synced INTEGER NOT NULL DEFAULT 1,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, variant_id),
        FOREIGN KEY (channel_id) REFERENCES sales_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        sync_action TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'warning')),
        items_count INTEGER DEFAULT 0,
        details_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES sales_channels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_channel_stock_channel ON channel_stock_allocations(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_stock_variant ON channel_stock_allocations(variant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_logs_channel ON channel_sync_logs(channel_id, created_at DESC);
  `);

  // تهيئة قنوات افتراضية إن لم تكن موجودة
  const count = db.prepare('SELECT COUNT(*) as count FROM sales_channels').get();
  if (count.count === 0) {
    const defaultWh = db.prepare('SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1').get() ||
                      db.prepare('SELECT id FROM warehouses LIMIT 1').get();
    const whId = defaultWh ? defaultWh.id : null;
    const insertChannel = db.prepare(`
      INSERT INTO sales_channels (name, channel_type, warehouse_id, sync_mode, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    try {
      insertChannel.run('نقطة البيع الكاشير (POS)', 'pos', whId, 'auto');
      insertChannel.run('المتجر الإلكتروني (Online Store)', 'online_store', whId, 'auto');
      insertChannel.run('متجر سلة (Salla)', 'salla', whId, 'auto');
    } catch {}
  }
}

function migrateGroceryTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        unit_name TEXT NOT NULL,
        conversion_factor REAL NOT NULL DEFAULT 1 CHECK(conversion_factor > 0),
        barcode TEXT UNIQUE,
        selling_price REAL NOT NULL CHECK(selling_price >= 0),
        purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
        is_base_unit INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id, unit_name),
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        warehouse_id INTEGER,
        batch_number TEXT,
        expiry_date DATE NOT NULL,
        production_date DATE,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
        supplier_id INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scale_barcode_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'ميزان الأجبان واللحوم',
        prefix TEXT NOT NULL DEFAULT '20',
        plu_length INTEGER NOT NULL DEFAULT 5,
        encoding_type TEXT NOT NULL DEFAULT 'weight_grams' CHECK(encoding_type IN ('weight_grams', 'total_price')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grocery_speed_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        shortcut_code TEXT,
        color TEXT DEFAULT '#10B981',
        icon TEXT DEFAULT '🛒',
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_units_variant ON product_units(variant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_units_variant_name ON product_units(variant_id, unit_name);
    CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date, quantity);
    CREATE INDEX IF NOT EXISTS idx_product_batches_variant ON product_batches(variant_id);
    CREATE INDEX IF NOT EXISTS idx_grocery_speed_keys_order ON grocery_speed_keys(display_order);
  `);

  try {
    const batchCols = db.prepare("PRAGMA table_info(product_batches)").all().map((c) => c.name);
    if (!batchCols.includes('warehouse_id')) {
      db.exec("ALTER TABLE product_batches ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON product_batches(warehouse_id);");
  } catch {}
}

function migrateKitchenOrdersV5(database = db) {
  const salesTable = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sales'"
  ).get();
  if (!salesTable) return;

  const columns = new Set(database.prepare('PRAGMA table_info(sales)').all().map((column) => column.name));
  if (!columns.has('order_mode')) {
    database.exec("ALTER TABLE sales ADD COLUMN order_mode TEXT CHECK(order_mode IS NULL OR order_mode IN ('dine_in', 'takeaway', 'delivery'))");
  }
  if (!columns.has('kitchen_status')) {
    database.exec("ALTER TABLE sales ADD COLUMN kitchen_status TEXT CHECK(kitchen_status IS NULL OR kitchen_status IN ('new', 'preparing', 'ready', 'served'))");
  }
}

module.exports = {
  migrateSuppliersTable,
  migrateReturnsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateInventoryWarehouses,
  migrateChannelsTables,
  migrateGroceryTables,
  migrateKitchenOrdersV5,
};
