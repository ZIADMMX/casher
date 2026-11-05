-- ==========================================
-- جدول الفئات (تصنيف المنتجات)
-- ==========================================
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول المستخدمين (مدير/كاشير)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'cashier')),
    system_role_key TEXT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    email TEXT,
    gender TEXT CHECK(gender IS NULL OR gender IN ('male', 'female', 'prefer_not_to_say')),
    date_of_birth TEXT,
    country TEXT,
    city TEXT,
    address TEXT,
    job_title TEXT,
    specialty TEXT,
    working_hours TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    profile_image TEXT,
    pay_type TEXT,
    pay_amount REAL,
    commission_rate REAL,
    notes TEXT,
    force_password_change INTEGER NOT NULL DEFAULT 0,
    recovery_key_hash TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول الورديات (إدارة الشيفتات و Z-Report)
-- ==========================================
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    branch_id INTEGER,
    warehouse_id INTEGER,
    opened_by_name TEXT,
    shift_type TEXT CHECK(shift_type IN ('morning', 'evening')) DEFAULT 'morning',
    pos_station TEXT DEFAULT 'الدرج الرئيسي - POS 1',
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    opening_cash REAL NOT NULL DEFAULT 0,
    opening_notes TEXT,
    opening_cash_breakdown TEXT,
    attendance_record_id INTEGER REFERENCES attendance_records(id),
    status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
    total_cash_sales REAL DEFAULT 0,
    total_card_sales REAL DEFAULT 0,
    total_credit_sales REAL DEFAULT 0,
    total_refunds REAL DEFAULT 0,
    total_expenses REAL DEFAULT 0,
    expected_cash REAL DEFAULT 0,
    actual_cash REAL,
    cash_difference REAL,
    cash_breakdown TEXT,
    closing_notes TEXT,
    closed_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
);

-- ==========================================
-- جدول المنتجات (المنتج الأساسي/الأب)
-- ==========================================
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER,
    image_path TEXT,
    is_service INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ==========================================
-- جدول المتغيرات (المقاس/اللون/الكمية الفعلية)
-- ==========================================
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    size TEXT,                          -- مثال: "M", "L", "XL"
    color TEXT,                         -- مثال: "أحمر", "أزرق"
    sku TEXT UNIQUE,                    -- كود فريد لكل variant
    barcode TEXT UNIQUE,                -- لو هتستخدم قارئ باركود
    purchase_price REAL NOT NULL CHECK(purchase_price >= 0),       -- سعر الشراء (للتكلفة والأرباح)
    selling_price REAL NOT NULL CHECK(selling_price >= 0),        -- سعر البيع
    stock_quantity REAL NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
    low_stock_threshold REAL DEFAULT 5 CHECK(low_stock_threshold >= 0),  -- تنبيه لما الكمية توصل للرقم ده
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

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

-- ==========================================
-- جدول العملاء
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    loyalty_points INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_power_of_attorneys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    number TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    scope TEXT NOT NULL,
    expires_at TEXT,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_customer
    ON customer_power_of_attorneys(customer_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_expiry
    ON customer_power_of_attorneys(expires_at);

CREATE TABLE IF NOT EXISTS legal_client_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    created_by INTEGER,
    type TEXT NOT NULL CHECK(type IN ('call', 'message', 'note', 'complaint')),
    subject TEXT NOT NULL,
    details TEXT,
    follow_up_date TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_customer
    ON legal_client_interactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_followup
    ON legal_client_interactions(follow_up_date);

CREATE TABLE IF NOT EXISTS customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'bank_transfer')),
    notes TEXT,
    user_id INTEGER,
    shift_id INTEGER,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL DEFAULT 'local',
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    tags TEXT NOT NULL DEFAULT '[]',
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'hidden')),
    sector TEXT,
    app_version TEXT,
    consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS review_prompt_state (
    tenant_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_prompted_at DATETIME,
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL CHECK(activity_type IN ('sale', 'appointment')),
    activity_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id, activity_type, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_review_activity_user
    ON review_activity(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_status_updated
    ON reviews(status, updated_at);

CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, attendance_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    requested_by_user_id INTEGER,
    reviewed_by_user_id INTEGER,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول الفواتير (عملية بيع كاملة)
-- ==========================================
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER,                    -- الوردية التابع لها هذا البيع
    branch_id INTEGER,
    warehouse_id INTEGER,
    customer_id INTEGER,                 -- ممكن يكون NULL (عميل عابر)
    customer_name TEXT,                  -- اسم العميل (للبيع الآجل)
    customer_phone TEXT,                 -- رقم هاتف العميل
    user_id INTEGER,                     -- مين الكاشير اللي عمل العملية
    total_amount REAL NOT NULL CHECK(total_amount >= 0),
    discount REAL DEFAULT 0 CHECK(discount >= 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'credit')),
    due_date DATETIME,                   -- تاريخ الاستحقاق (للبيع الآجل)
    order_mode TEXT CHECK(order_mode IS NULL OR order_mode IN ('dine_in', 'takeaway', 'delivery')),
    kitchen_status TEXT CHECK(kitchen_status IS NULL OR kitchen_status IN ('new', 'preparing', 'ready', 'served')),
    invoice_number TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- جدول تفاصيل كل فاتورة (المنتجات اللي اتباعت)
-- ==========================================
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    variant_id INTEGER,                  -- أي variant بالظبط اتباع
    quantity REAL NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),            -- السعر وقت البيع (يتسجل هنا عشان لو السعر اتغير بعدين)
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول الإرجاع (اختياري بس مفيد)
-- ==========================================
CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    refund_amount REAL DEFAULT 0,
    exchange_variant_id INTEGER,
    exchange_price_difference REAL NOT NULL DEFAULT 0,
    exchange_payment_method TEXT,
    user_id INTEGER,
    shift_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (exchange_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

-- ==========================================
-- جدول الموردين والمصانع
-- ==========================================
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول فواتير الشراء والتوريد
-- ==========================================
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    invoice_number TEXT,
    total_amount REAL NOT NULL CHECK(total_amount >= 0),
    paid_amount REAL NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    remaining_amount REAL NOT NULL DEFAULT 0 CHECK(remaining_amount >= 0),
    payment_status TEXT CHECK(payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    due_date DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

-- ==========================================
-- جدول تفاصيل أصناف فاتورة الشراء
-- ==========================================
CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    variant_id INTEGER,
    product_name TEXT NOT NULL,
    size TEXT,
    color TEXT,
    quantity REAL NOT NULL CHECK(quantity > 0),
    purchase_price REAL NOT NULL CHECK(purchase_price >= 0),
    selling_price REAL CHECK(selling_price IS NULL OR selling_price >= 0),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);

-- ==========================================
-- جدول دفعات سداد الموردين
-- ==========================================
CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    purchase_id INTEGER,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT CHECK(payment_method IN ('cash', 'bank_transfer', 'cheque')) DEFAULT 'cash',
    notes TEXT,
    user_id INTEGER,
    shift_id INTEGER,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

-- ==========================================
-- جدول مصروفات وسحوبات الوردية من الدرج
-- ==========================================
CREATE TABLE IF NOT EXISTS shift_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    category TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- Indexes لتحسين الأداء (مهم لما البيانات تكبر)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_warehouse ON sales(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_due_date ON sales(due_date);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_variant ON returns(variant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_due_date ON purchases(due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_variant ON purchase_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_warehouse ON shifts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_shift_expenses_shift ON shift_expenses(shift_id);

-- ==========================================
-- جدول الإعدادات العامة
-- ==========================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ==========================================
-- جدول الإشعارات والتنبيهات
-- ==========================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_page TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ==========================================
-- جدول مركز العمليات والطلبات (Orders)
-- ==========================================
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

-- ==========================================
-- جدول مركز العمليات والطلبات (Orders)
-- ==========================================
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
    sale_id INTEGER UNIQUE,
    notes TEXT,
    created_by_user_id INTEGER,
    appointment_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول بنود الطلب (Order Items)
-- ==========================================
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

-- ==========================================
-- جدول سجل حركات الطلب (Order History Audit Log)
-- ==========================================
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

-- ==========================================
-- جدول تعليقات وملاحظات الطلب (Order Comments)
-- ==========================================
CREATE TABLE IF NOT EXISTS order_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول مرفقات الطلب (Order Attachments)
-- ==========================================
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

-- Indexes for performance
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_appointment ON orders(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(resource_id, start_at, end_at, status);
CREATE INDEX IF NOT EXISTS idx_appointments_reminders ON appointments(status, reminder_sent, start_at);
CREATE INDEX IF NOT EXISTS idx_appointment_holidays_dates ON appointment_holidays(start_date, end_date);

-- ==========================================
-- جدول الباقات والأنواع (Packages)
-- ==========================================
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

-- ==========================================
-- جدول اشتراكات العملاء (Customer Subscriptions)
-- ==========================================
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT
);

-- ==========================================
-- جدول سجل استخدام واستهلاك الباقة (Usage Logs)
-- ==========================================
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول سجل تجميد الاشتراكات (Freeze Logs)
-- ==========================================
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer ON customer_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_status ON customer_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_end_date ON customer_subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_sub ON subscription_usage_logs(subscription_id);

-- ==========================================
-- جدول قواعد شروط ونسب العمولات (Commission Rules)
-- ==========================================
CREATE TABLE IF NOT EXISTS commission_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('all_sales', 'product', 'category', 'employee', 'debt_collection', 'net_profit', 'sales_target')),
    target_id INTEGER,
    calculation_type TEXT NOT NULL CHECK(calculation_type IN ('percentage', 'fixed_amount', 'lump_sum_bonus')),
    rate_value REAL NOT NULL DEFAULT 0,
    min_sales_threshold REAL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول مستحقات العمولات لكل موظف (Commission Earnings)
-- ==========================================
CREATE TABLE IF NOT EXISTS commission_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rule_id INTEGER,
    sale_id INTEGER,
    payment_id INTEGER,
    base_amount REAL NOT NULL DEFAULT 0,
    commission_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
    payout_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE SET NULL,
    FOREIGN KEY (payout_id) REFERENCES commission_payouts(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول تسوية وصرف العمولات (Commission Payouts)
-- ==========================================
CREATE TABLE IF NOT EXISTS commission_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    paid_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_rules_type ON commission_rules(target_type);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_user ON commission_earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_status ON commission_earnings(status);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_sale ON commission_earnings(sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_payout ON commission_earnings(payout_id);

-- ==========================================
-- جدول الحملات والعروض السلوكية (CRM Campaigns)
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_criteria TEXT,
    discount_percentage REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول تفاعلات واتصالات العملاء (CRM Interactions)
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    campaign_id INTEGER,
    user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('call', 'note', 'message', 'complaint', 'offer')),
    subject TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'pending')),
    follow_up_date DATETIME,
    reminder_sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (campaign_id) REFERENCES crm_campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول فرص البيع والصفقات (CRM Opportunities)
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    user_id INTEGER,
    title TEXT NOT NULL,
    expected_value REAL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead', 'qualified', 'proposal', 'won', 'lost')),
    expected_close_date DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON crm_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_type ON crm_interactions(type);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_followup ON crm_interactions(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_customer ON crm_opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);

-- ==========================================
-- 1. جدول وحدات النظام القابلة للتفعيل (System Modules Registry)
-- ==========================================
CREATE TABLE IF NOT EXISTS system_modules (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_enabled INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. جدول أنماط الأنشطة التجارية (Business Profiles & Presets)
-- ==========================================
CREATE TABLE IF NOT EXISTS business_profiles (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    settings_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. جدول الخصائص والصفات الديناميكية للمنتجات (Dynamic Product Attributes)
-- ==========================================
CREATE TABLE IF NOT EXISTS product_attribute_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attribute_name TEXT NOT NULL,
    attribute_key TEXT NOT NULL UNIQUE,
    data_type TEXT DEFAULT 'text',
    options_json TEXT,
    is_required INTEGER DEFAULT 0,
    business_profile_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    attribute_id INTEGER NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(variant_id, attribute_id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (attribute_id) REFERENCES product_attribute_definitions(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. محرك حالات ومراحل سير العمل الديناميكي (Dynamic Workflows & Statuses)
-- ==========================================
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_key TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'general',
    name TEXT NOT NULL,
    description TEXT,
    business_profile_key TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    status_key TEXT NOT NULL,
    status_label TEXT NOT NULL,
    badge_color TEXT DEFAULT '#3b82f6',
    step_order INTEGER DEFAULT 0,
    is_initial INTEGER DEFAULT 0,
    is_final INTEGER DEFAULT 0,
    allowed_next_statuses_json TEXT DEFAULT '[]',
    sla_hours INTEGER DEFAULT 0,
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_statuses_unique_workflow_key
    ON workflow_statuses(workflow_id, status_key);

-- ==========================================
-- 5. محرك الأتمتة والقواعد بدون كود (No-Code Automation Rules)
-- ==========================================
CREATE TABLE IF NOT EXISTS automation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL,
    trigger_event TEXT NOT NULL,
    condition_json TEXT DEFAULT '{}',
    action_type TEXT NOT NULL,
    action_payload_json TEXT DEFAULT '{}',
    is_enabled INTEGER DEFAULT 1,
    last_triggered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 6. نظام الأدوار والصلاحيات الديناميكية (Dynamic RBAC & Roles)
-- ==========================================
CREATE TABLE IF NOT EXISTS system_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key TEXT UNIQUE NOT NULL,
    role_name TEXT NOT NULL,
    description TEXT,
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key TEXT NOT NULL,
    permission_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_key, permission_key),
    FOREIGN KEY (role_key) REFERENCES system_roles(role_key) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_variant ON product_attribute_values(variant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_statuses_workflow ON workflow_statuses(workflow_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_event ON automation_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_key);

-- ==========================================
-- 7. جدول سجل تدقيق وحركات الكاشير والمستخدمين (Cashier & User Audit Trail)
-- ==========================================
CREATE TABLE IF NOT EXISTS cashier_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    shift_id INTEGER,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    amount REAL DEFAULT 0,
    severity TEXT DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'danger', 'success')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_user ON cashier_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_shift ON cashier_audit_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON cashier_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON cashier_audit_logs(created_at);

-- ==========================================
-- 8. جدول قنوات المبيعات وتحديث المخزون المتعدد (Sales Channels & Multi-Channel Inventory)
-- ==========================================
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

-- ==========================================
-- إعدادات الشاشة والتخصيص
-- ==========================================
CREATE TABLE IF NOT EXISTS ui_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    config_key TEXT NOT NULL DEFAULT '_all',
    config_json TEXT NOT NULL DEFAULT '{}',
    role_or_user TEXT DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, config_key, role_or_user)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_configurations_unique_scope_key_role
    ON ui_configurations(scope, config_key, COALESCE(role_or_user, ''));

CREATE INDEX IF NOT EXISTS idx_ui_configurations_scope ON ui_configurations(scope);
CREATE INDEX IF NOT EXISTS idx_ui_configurations_role ON ui_configurations(role_or_user);

-- ==========================================
-- جداول معالج التهيئة الأولى (Onboarding Wizard)
-- ==========================================
CREATE TABLE IF NOT EXISTS onboarding_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector_key TEXT UNIQUE NOT NULL,
    sector_name TEXT NOT NULL,
    sector_tagline TEXT,
    icon TEXT,
    primary_action_title TEXT NOT NULL,
    primary_action_route TEXT NOT NULL,
    terminology_json TEXT NOT NULL DEFAULT '{}',
    enabled_modules_json TEXT NOT NULL DEFAULT '[]',
    default_units_json TEXT NOT NULL DEFAULT '[]',
    starter_categories_json TEXT NOT NULL DEFAULT '[]',
    starter_products_json TEXT NOT NULL DEFAULT '[]',
    starter_stations_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_completed INTEGER NOT NULL DEFAULT 0,
    current_step INTEGER NOT NULL DEFAULT 1,
    selected_sector TEXT,
    custom_sector_name TEXT,
    setup_summary_json TEXT DEFAULT '{}',
    completed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جداول مسيرات الرواتب والسلف (Payroll & Salaries)
-- ==========================================
CREATE TABLE IF NOT EXISTS payroll_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_name TEXT NOT NULL,           -- مثال: "مسير رواتب أكتوبر 2026"
    month INTEGER NOT NULL,              -- 1-12
    year INTEGER NOT NULL,               -- 2026
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'paid')),
    total_basic REAL DEFAULT 0,
    total_allowances REAL DEFAULT 0,
    total_commissions REAL DEFAULT 0,
    total_deductions REAL DEFAULT 0,
    total_net REAL DEFAULT 0,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_period_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    basic_salary REAL NOT NULL DEFAULT 0,
    housing_allowance REAL DEFAULT 0,
    transport_allowance REAL DEFAULT 0,
    other_allowances REAL DEFAULT 0,
    commissions_amount REAL DEFAULT 0,
    overtime_amount REAL DEFAULT 0,
    bonus_amount REAL DEFAULT 0,
    deductions_amount REAL DEFAULT 0,
    absent_days INTEGER DEFAULT 0,
    absent_deduction REAL DEFAULT 0,
    advances_deducted REAL DEFAULT 0,
    net_salary REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid', 'partially_paid')),
    payment_method TEXT CHECK(payment_method IN ('cash', 'bank_transfer', 'cheque', 'wallet')),
    paid_amount REAL DEFAULT 0,
    paid_at DATETIME,
    payment_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE(payroll_period_id, user_id)
);

CREATE TABLE IF NOT EXISTS salary_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    request_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected', 'recovered')),
    repaid_amount REAL DEFAULT 0,
    deducted_in_payroll_id INTEGER,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (deducted_in_payroll_id) REFERENCES payroll_periods(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_user ON payroll_items(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_period ON payroll_items(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_user ON salary_advances(user_id, status);

-- ==========================================
-- جداول صالونات الحلاقة والتجميل (Salon & Beauty Center)
-- ==========================================

-- 1. جدول الكراسي ومحطات العمل
CREATE TABLE IF NOT EXISTS salon_chairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          -- مثال: "كرسي 1 - حلاقة رجالي", "محطة بروتين 2", "غرفة عناية بالبشرة"
    station_type TEXT DEFAULT 'barber_chair' CHECK(station_type IN ('barber_chair', 'hair_styling', 'skincare', 'spa', 'pedicure', 'vip_room')),
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'cleaning', 'maintenance')),
    default_stylist_id INTEGER,         -- المصفف الأساسي المعين للكرسي
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    current_customer_name TEXT,
    current_customer_phone TEXT,
    current_stylist_id INTEGER,
    current_stylist_name TEXT,
    current_service_id INTEGER,
    current_service_name TEXT,
    current_service_price REAL DEFAULT 0,
    service_started_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_stylist_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. جدول الخدمات والمدد والأسعار والعمولات
CREATE TABLE IF NOT EXISTS salon_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                 -- مثال: "قص شعر استشوار", "حلاقة ذقن ومساج", "جلسة تنظيف بشرة هيدرافاشيل"
    category TEXT DEFAULT 'general',    -- مثال: "شعر", "ذقن", "عناية وبشرة", "باكجات عرسان"
    duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK(duration_minutes > 0),
    price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
    cost_price REAL DEFAULT 0,          -- تكلفة المواد المستهلكة (كريمات/شمع)
    commission_type TEXT NOT NULL DEFAULT 'percentage' CHECK(commission_type IN ('percentage', 'fixed')),
    commission_value REAL NOT NULL DEFAULT 0 CHECK(commission_value >= 0), -- مثال: 20 (%) أو 50 (ج.م ثابت)
    required_station_type TEXT,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. جدول باقات وكروت الزيارات (Salon Packages)
CREATE TABLE IF NOT EXISTS salon_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                 -- مثال: "باقة 5 قصات شعر + 2 ذقن", "كارت تجهيز عريس VIP"
    price REAL NOT NULL CHECK(price > 0),
    total_visits INTEGER NOT NULL DEFAULT 1 CHECK(total_visits > 0),
    validity_days INTEGER DEFAULT 90,   -- مدة الصلاحية بالأيام
    included_services_json TEXT NOT NULL DEFAULT '[]', -- قائمة الخدمات المشمولة بالباقة
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. اشتراكات العملاء في كروت الزيارات (Customer Package Subscriptions)
CREATE TABLE IF NOT EXISTS salon_package_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    total_visits INTEGER NOT NULL,
    remaining_visits INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'completed', 'frozen')),
    sale_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES salon_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
);

-- 5. جدول حجوزات المواعيد والكراسي (Salon Appointments)
CREATE TABLE IF NOT EXISTS salon_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    chair_id INTEGER,
    stylist_id INTEGER,                 -- المصفف الذي سيؤدي الخدمة
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    appointment_date TEXT NOT NULL,     -- YYYY-MM-DD
    start_time TEXT NOT NULL,           -- HH:MM (مثال: 14:30)
    end_time TEXT NOT NULL,             -- HH:MM
    status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show')),
    deposit_amount REAL DEFAULT 0,
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    whatsapp_message TEXT,
    notes TEXT,
    sale_id INTEGER,
    created_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES salon_services(id),
    FOREIGN KEY (chair_id) REFERENCES salon_chairs(id) ON DELETE SET NULL,
    FOREIGN KEY (stylist_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. جدول تنفيذ الخدمات ومبيعات المنتجات المرتبطة (Salon Service Logs / Items)
CREATE TABLE IF NOT EXISTS salon_service_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    appointment_id INTEGER,
    service_id INTEGER NOT NULL,
    stylist_id INTEGER NOT NULL,
    chair_id INTEGER,
    service_price REAL NOT NULL,
    commission_type TEXT NOT NULL,
    commission_value REAL NOT NULL,
    earned_commission REAL NOT NULL,    -- المبلغ الفعلي المحسوب للمصفف
    tip_amount REAL DEFAULT 0,
    tip_recipient TEXT DEFAULT 'stylist',
    discount_amount REAL DEFAULT 0,
    customer_name TEXT,
    package_subscription_id INTEGER,    -- لو تم استهلاك زيارة من كارت
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES salon_appointments(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES salon_services(id),
    FOREIGN KEY (stylist_id) REFERENCES users(id),
    FOREIGN KEY (chair_id) REFERENCES salon_chairs(id) ON DELETE SET NULL,
    FOREIGN KEY (package_subscription_id) REFERENCES salon_package_subscriptions(id) ON DELETE SET NULL
);

-- 7. جدول الكوبونات والخصومات والعروض الترويجية
CREATE TABLE IF NOT EXISTS salon_coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK(discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL DEFAULT 0,
    min_spend REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- الفهارس للأداء العالي وسرعة الاستعلام
CREATE INDEX IF NOT EXISTS idx_salon_chairs_status ON salon_chairs(status);
CREATE INDEX IF NOT EXISTS idx_salon_services_cat ON salon_services(category);
CREATE INDEX IF NOT EXISTS idx_salon_appointments_date ON salon_appointments(appointment_date, start_time);
CREATE INDEX IF NOT EXISTS idx_salon_appointments_stylist ON salon_appointments(stylist_id);
CREATE INDEX IF NOT EXISTS idx_salon_appointments_chair ON salon_appointments(chair_id);
CREATE INDEX IF NOT EXISTS idx_salon_package_subs_cust ON salon_package_subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_salon_service_sales_stylist ON salon_service_sales(stylist_id, created_at);

-- ==========================================
-- جداول قطاع مكاتب المحاماة والاستشارات القانونية (Law Firm Module)
-- ==========================================

-- دليل المحاكم المرتبط بملفات القضايا
CREATE TABLE IF NOT EXISTS courts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    court_type TEXT NOT NULL CHECK(court_type IN (
        'first_instance', 'cassation', 'appeals', 'family',
        'criminal', 'commercial', 'labor', 'administrative'
    )),
    specialization TEXT,
    notes TEXT,
    phone TEXT,
    city TEXT,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_courts_name_active
    ON courts(name COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_courts_type_active ON courts(court_type, is_active);

-- 1. جدول ملفات القضايا (Legal Cases)
CREATE TABLE IF NOT EXISTS legal_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL,                -- رقم القضية بالمحكمة (مثال: 1245 لسنة 2026 مدني)
    court_name TEXT NOT NULL,                 -- اسم المحكمة (مثال: محكمة شمال القاهرة الابتدائية)
    court_id TEXT,                            -- معرّف المحكمة في دليل المحاكم المحلي أو المركزي
    circuit_name TEXT,                        -- الدائرة (مثال: دائرة 4 تعويضات)
    client_id INTEGER NOT NULL,               -- الموكّل (مرتبط بالعملاء)
    client_role TEXT NOT NULL DEFAULT 'plaintiff' CHECK(client_role IN ('plaintiff', 'defendant', 'appellant', 'appellee')), -- صفة الموكل (مدعي / مدعى عليه / مستأنف / مستأنف ضده)
    opponent_name TEXT NOT NULL,              -- اسم الخصم
    opponent_lawyer TEXT,                     -- محامي الخصم
    subject TEXT NOT NULL,                    -- موضوع الدعوى والطلبات
    case_type TEXT DEFAULT 'civil',           -- مدني، تجاري، جنائي، عمالي، أسرة، إداري
    assigned_lawyer_id INTEGER,               -- المحامي المسؤول بالمكتب
    billing_type TEXT NOT NULL DEFAULT 'fixed' CHECK(billing_type IN ('fixed', 'hourly', 'contingency')), -- نوع الأتعاب
    contract_amount REAL DEFAULT 0,           -- قيمة العقد / الأتعاب المتفق عليها
    paid_amount REAL DEFAULT 0,               -- المسدد من الأتعاب
    hourly_rate REAL DEFAULT 0,               -- سعر الساعة إذا كانت الفوترة بالساعة
    power_of_attorney_num TEXT,               -- رقم التوكيل ومكتب التوثيق
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'adjourned', 'judged', 'appealed', 'closed')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. جدول جلسات المحاكم (Court Sessions / Hearings)
CREATE TABLE IF NOT EXISTS court_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    session_date DATETIME NOT NULL,           -- تاريخ ووقت انعقاد الجلسة
    court_room TEXT,                          -- القاعة / رقم الرول
    assigned_lawyer_id INTEGER,               -- المحامي المكلف بالحضور
    session_reason TEXT,                      -- سبب التأجيل / المطلوب بالجلسة (سماع شهود، مذكرات دفاع، تقرير خبير)
    decision TEXT,                            -- قرار المحكمة وما تم بالجلسة
    next_session_date DATETIME,               -- تاريخ الجلسة القادمة
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'attended', 'postponed', 'judged')),
    reminder_sent INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. جدول مستندات وأرشيف القضية (Case Documents)
CREATE TABLE IF NOT EXISTS case_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    title TEXT NOT NULL,                      -- اسم المستند (عريضة، مذكرة، حكم، محضر، توكيل)
    doc_type TEXT DEFAULT 'pleading' CHECK(doc_type IN ('power_of_attorney', 'pleading', 'judgment', 'evidence', 'contract', 'other')),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    version INTEGER DEFAULT 1,
    uploaded_by INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. جدول أمانات الموكلين ومصاريف الدعاوى (Case Financials & Retainers)
CREATE TABLE IF NOT EXISTS case_financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('retainer_deposit', 'court_fee', 'expert_fee', 'announcement_fee', 'fee_payment', 'other_expense')),
    amount REAL NOT NULL CHECK(amount > 0),
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    paid_by_client INTEGER DEFAULT 1,         -- هل تم خصمها من أمانة الموكل؟
    receipt_number TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 5. جدول سجل الساعات للفوترة بالساعة (Lawyer Billable Time Logs)
CREATE TABLE IF NOT EXISTS lawyer_time_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    lawyer_id INTEGER NOT NULL,
    hours REAL NOT NULL CHECK(hours > 0),
    hourly_rate REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    activity_description TEXT NOT NULL,       -- صياغة مذكرة، حضور تحقيق، دراسة ملف
    date DATE NOT NULL,
    is_billed INTEGER DEFAULT 0,              -- تم إصدار فاتورة بها للموكل
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- فهارس قطاع المحاماة
CREATE INDEX IF NOT EXISTS idx_legal_cases_number ON legal_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_legal_cases_client ON legal_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_lawyer ON legal_cases(assigned_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status);
CREATE INDEX IF NOT EXISTS idx_court_sessions_case ON court_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_court_sessions_date ON court_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_court_sessions_lawyer ON court_sessions(assigned_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_case ON case_documents(case_id);
CREATE TABLE IF NOT EXISTS legal_case_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    session_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    due_at TEXT NOT NULL,
    reminder_at TEXT,
    assigned_lawyer_id INTEGER,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    reminder_sent INTEGER NOT NULL DEFAULT 0 CHECK(reminder_sent IN (0, 1)),
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_case_due
    ON legal_case_tasks(case_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_reminders
    ON legal_case_tasks(status, reminder_sent, reminder_at);
CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_assignee
    ON legal_case_tasks(assigned_lawyer_id, status, due_at);
CREATE TABLE IF NOT EXISTS case_document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, version),
    FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_case_document_versions_document
    ON case_document_versions(document_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_case_financials_case ON case_financials(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_time_logs_case ON lawyer_time_logs(case_id);

-- ==========================================
-- جداول قطاع السوبر ماركت المتقدم (Advanced Grocery & Supermarket Module)
-- ==========================================

-- 1. جدول تعدد وحدات القياس (Multi-UOM: علبة / كرتونة / باكت / كيلو / حبة)
CREATE TABLE IF NOT EXISTS product_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    unit_name TEXT NOT NULL,                  -- مثال: 'كرتونة 24 علبة', 'باكت 6', 'كيلو', 'قطعة'
    conversion_factor REAL NOT NULL DEFAULT 1 CHECK(conversion_factor > 0), -- معامل التحويل للوحدة الأساسية (مثلاً الكرتونة = 24)
    barcode TEXT UNIQUE,                      -- باركود مخصص لهذه الوحدة (مثل باركود الكرتونة)
    selling_price REAL NOT NULL CHECK(selling_price >= 0),              -- سعر بيع هذه الوحدة
    purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),            -- سعر شراء هذه الوحدة
    is_base_unit INTEGER DEFAULT 0,           -- هل هي الوحدة الصغرى الأساسية؟
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variant_id, unit_name),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

-- 2. جدول تشغيلات وتواريخ انتهاء الصلاحية (Batches & Expiry Dates)
CREATE TABLE IF NOT EXISTS product_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    warehouse_id INTEGER,
    batch_number TEXT,                        -- رقم التشغيلة / اللوت
    expiry_date DATE NOT NULL,                -- تاريخ انتهاء الصلاحية
    production_date DATE,                     -- تاريخ الإنتاج
    quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),         -- الكمية المتبقية من هذه التشغيلة
    purchase_price REAL DEFAULT 0 CHECK(purchase_price >= 0),
    supplier_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- 3. جدول إعدادات موازين الباركود الإلكترونية (Scale Barcode Configurations)
CREATE TABLE IF NOT EXISTS scale_barcode_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'ميزان الأجبان واللحوم',
    prefix TEXT NOT NULL DEFAULT '20',        -- البادئة الشائعة (مثال: '20' أو '21' أو '99')
    plu_length INTEGER NOT NULL DEFAULT 5,    -- طول كود الصنف (عادة 4 أو 5 أرقام)
    encoding_type TEXT NOT NULL DEFAULT 'weight_grams' CHECK(encoding_type IN ('weight_grams', 'total_price')), -- مشفر بالوزن أو السعر الإجمالي
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. جدول أزرار السلع السريعة بدون باركود لكاشير السوبر ماركت (Speed PLU Keys)
CREATE TABLE IF NOT EXISTS grocery_speed_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    label TEXT NOT NULL,                      -- اسم يظهر على الزر: 'عيش بلدي', 'فينو', 'بيض', 'ليمون'
    shortcut_code TEXT,                       -- اختصار سريع (1, 2, B1...)
    color TEXT DEFAULT '#10B981',             -- لون الزر
    icon TEXT DEFAULT '🛒',                   -- أيقونة الزر
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

-- فهارس تحسين سرعة استعلام السوبر ماركت
CREATE INDEX IF NOT EXISTS idx_product_units_variant ON product_units(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date, quantity);
CREATE INDEX IF NOT EXISTS idx_product_batches_variant ON product_batches(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON product_batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_grocery_speed_keys_order ON grocery_speed_keys(display_order);

CREATE TRIGGER IF NOT EXISTS trg_restrict_supplier_delete_with_history
BEFORE DELETE ON suppliers
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND (EXISTS (SELECT 1 FROM purchases WHERE supplier_id = OLD.id)
  OR EXISTS (SELECT 1 FROM supplier_payments WHERE supplier_id = OLD.id))
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete a supplier with purchase or payment history');
END;

CREATE TRIGGER IF NOT EXISTS trg_restrict_customer_delete_with_history
BEFORE DELETE ON customers
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND (EXISTS (SELECT 1 FROM customer_payments WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM sales WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM legal_cases WHERE client_id = OLD.id)
  OR EXISTS (SELECT 1 FROM customer_subscriptions WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM subscription_usage_logs WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM crm_interactions WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM crm_opportunities WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM salon_package_subscriptions WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM salon_appointments WHERE customer_id = OLD.id)
  OR EXISTS (SELECT 1 FROM appointments WHERE customer_id = OLD.id))
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete a customer with financial or business history');
END;

CREATE TRIGGER IF NOT EXISTS trg_restrict_product_delete_with_variants
BEFORE DELETE ON products
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = OLD.id)
BEGIN
    SELECT RAISE(ABORT, 'Archive products instead of deleting their variants');
END;

CREATE TRIGGER IF NOT EXISTS trg_restrict_variant_delete_with_history
BEFORE DELETE ON product_variants
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND (EXISTS (SELECT 1 FROM sale_items WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM purchase_items WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM returns WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM inventory_movements WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM inventory_transfer_items WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM inventory_count_items WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM warehouse_stock WHERE variant_id = OLD.id)
  OR EXISTS (SELECT 1 FROM product_batches WHERE variant_id = OLD.id))
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete a product variant with transaction or inventory history');
END;

CREATE TRIGGER IF NOT EXISTS trg_restrict_user_delete_with_payroll_history
BEFORE DELETE ON users
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND (EXISTS (SELECT 1 FROM attendance_records WHERE user_id = OLD.id)
  OR EXISTS (SELECT 1 FROM leave_requests WHERE user_id = OLD.id)
  OR EXISTS (SELECT 1 FROM payroll_items WHERE user_id = OLD.id)
  OR EXISTS (SELECT 1 FROM salary_advances WHERE user_id = OLD.id)
  OR EXISTS (SELECT 1 FROM commission_earnings WHERE user_id = OLD.id)
  OR EXISTS (SELECT 1 FROM commission_payouts WHERE user_id = OLD.id))
BEGIN
    SELECT RAISE(ABORT, 'Deactivate users instead of deleting payroll or attendance history');
END;

CREATE TRIGGER IF NOT EXISTS trg_restrict_case_delete_with_history
BEFORE DELETE ON legal_cases
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND (EXISTS (SELECT 1 FROM case_financials WHERE case_id = OLD.id)
  OR EXISTS (SELECT 1 FROM court_sessions WHERE case_id = OLD.id)
  OR EXISTS (SELECT 1 FROM case_documents WHERE case_id = OLD.id)
  OR EXISTS (SELECT 1 FROM lawyer_time_logs WHERE case_id = OLD.id))
BEGIN
    SELECT RAISE(ABORT, 'Close cases instead of deleting case and financial history');
END;

-- مزامنة رصيد الصنف تلقائياً من أرصدة المخازن (Single Source of Truth)
CREATE TRIGGER IF NOT EXISTS trg_sync_variant_stock_on_insert
AFTER INSERT ON warehouse_stock
BEGIN
    UPDATE product_variants
    SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM warehouse_stock
        WHERE variant_id = NEW.variant_id
    )
    WHERE id = NEW.variant_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_variant_stock_on_update
AFTER UPDATE OF quantity, variant_id ON warehouse_stock
BEGIN
    UPDATE product_variants
    SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM warehouse_stock
        WHERE variant_id = NEW.variant_id
    )
    WHERE id = NEW.variant_id;

    UPDATE product_variants
    SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM warehouse_stock
        WHERE variant_id = OLD.variant_id
    )
    WHERE id = OLD.variant_id AND OLD.variant_id != NEW.variant_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_variant_stock_on_delete
AFTER DELETE ON warehouse_stock
BEGIN
    UPDATE product_variants
    SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM warehouse_stock
        WHERE variant_id = OLD.variant_id
    )
    WHERE id = OLD.variant_id;
END;

-- منع تكرار الباركود بين المتغيرات الأساسية وجدول وحدات القياس المتعددة
CREATE TRIGGER IF NOT EXISTS trg_check_variant_barcode_units_insert
BEFORE INSERT ON product_variants
WHEN NEW.barcode IS NOT NULL AND NEW.barcode != ''
 AND EXISTS (SELECT 1 FROM product_units WHERE barcode = NEW.barcode)
BEGIN
    SELECT RAISE(ABORT, 'الباركود مسجل مسبقاً في جدول وحدات القياس (product_units)');
END;

CREATE TRIGGER IF NOT EXISTS trg_check_variant_barcode_units_update
BEFORE UPDATE OF barcode ON product_variants
WHEN NEW.barcode IS NOT NULL AND NEW.barcode != ''
 AND EXISTS (SELECT 1 FROM product_units WHERE barcode = NEW.barcode)
BEGIN
    SELECT RAISE(ABORT, 'الباركود مسجل مسبقاً في جدول وحدات القياس (product_units)');
END;

CREATE TRIGGER IF NOT EXISTS trg_check_unit_barcode_variants_insert
BEFORE INSERT ON product_units
WHEN NEW.barcode IS NOT NULL AND NEW.barcode != ''
 AND EXISTS (SELECT 1 FROM product_variants WHERE barcode = NEW.barcode)
BEGIN
    SELECT RAISE(ABORT, 'الباركود مسجل مسبقاً في جدول أصناف المنتجات (product_variants)');
END;

CREATE TRIGGER IF NOT EXISTS trg_check_unit_barcode_variants_update
BEFORE UPDATE OF barcode ON product_units
WHEN NEW.barcode IS NOT NULL AND NEW.barcode != ''
 AND EXISTS (SELECT 1 FROM product_variants WHERE barcode = NEW.barcode)
BEGIN
    SELECT RAISE(ABORT, 'الباركود مسجل مسبقاً في جدول أصناف المنتجات (product_variants)');
END;

-- حماية السجلات المالية للورديات من الحذف في حال وجود مصروفات مسجلة
CREATE TRIGGER IF NOT EXISTS trg_restrict_shift_delete_with_expenses
BEFORE DELETE ON shifts
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
 AND EXISTS (SELECT 1 FROM shift_expenses WHERE shift_id = OLD.id)
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete a shift with expense history');
END;

-- سجل المخزون للإضافة فقط: لا يمكن تعديل أو حذف حركة أو تحويل أو جرد بعد تسجيله.
-- التصحيح يتم دائماً بحركة تسوية جديدة يظهر فيها المستخدم والسبب.
-- (user_id مستثنى من منع التعديل لأن حذف المستخدم يضبطه على NULL تلقائياً)
CREATE TRIGGER IF NOT EXISTS trg_inventory_movements_no_delete
BEFORE DELETE ON inventory_movements
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory movements are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movements_no_update
BEFORE UPDATE OF warehouse_id, variant_id, movement_type, quantity_change, quantity_after,
  reference_type, reference_id, notes, created_at ON inventory_movements
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory movements are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_transfers_no_delete
BEFORE DELETE ON inventory_transfers
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory transfers are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_transfers_no_update
BEFORE UPDATE OF source_warehouse_id, destination_warehouse_id, notes, created_at ON inventory_transfers
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory transfers are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_transfer_items_no_change
BEFORE UPDATE ON inventory_transfer_items
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory transfers are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_transfer_items_no_delete
BEFORE DELETE ON inventory_transfer_items
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory transfers are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_counts_no_delete
BEFORE DELETE ON inventory_counts
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory counts are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_counts_no_update
BEFORE UPDATE OF warehouse_id, count_type, notes, created_at ON inventory_counts
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory counts are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_count_items_no_change
BEFORE UPDATE ON inventory_count_items
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory counts are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_count_items_no_delete
BEFORE DELETE ON inventory_count_items
WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
BEGIN
    SELECT RAISE(ABORT, 'Inventory counts are append-only');
END;
