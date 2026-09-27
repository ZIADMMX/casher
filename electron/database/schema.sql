-- ==========================================
-- جدول الفئات (تصنيف المنتجات)
-- ==========================================
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    purchase_price REAL NOT NULL,       -- سعر الشراء (للتكلفة والأرباح)
    selling_price REAL NOT NULL,        -- سعر البيع
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,  -- تنبيه لما الكمية توصل للرقم ده
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ==========================================
-- جدول العملاء
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    loyalty_points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

-- ==========================================
-- جدول المستخدمين (مدير/كاشير)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'cashier')),
    force_password_change INTEGER NOT NULL DEFAULT 0,
    recovery_key_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول الفواتير (عملية بيع كاملة)
-- ==========================================
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER,                    -- الوردية التابع لها هذا البيع
    customer_id INTEGER,                 -- ممكن يكون NULL (عميل عابر)
    customer_name TEXT,                  -- اسم العميل (للبيع الآجل)
    customer_phone TEXT,                 -- رقم هاتف العميل
    user_id INTEGER,                     -- مين الكاشير اللي عمل العملية
    total_amount REAL NOT NULL,
    discount REAL DEFAULT 0,
    payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'credit')),
    due_date DATETIME,                   -- تاريخ الاستحقاق (للبيع الآجل)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- جدول تفاصيل كل فاتورة (المنتجات اللي اتباعت)
-- ==========================================
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    variant_id INTEGER,                  -- أي variant بالظبط اتباع (NULL لو الصنف اتحذف)
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,            -- السعر وقت البيع (يتسجل هنا عشان لو السعر اتغير بعدين)
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
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (exchange_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- جدول فواتير الشراء والتوريد
-- ==========================================
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
    quantity INTEGER NOT NULL,
    purchase_price REAL NOT NULL,
    selling_price REAL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- ==========================================
-- جدول دفعات سداد الموردين
-- ==========================================
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

-- ==========================================
-- جدول الورديات (إدارة الشيفتات و Z-Report)
-- ==========================================
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    opened_by_name TEXT,
    shift_type TEXT CHECK(shift_type IN ('morning', 'evening')) DEFAULT 'morning',
    pos_station TEXT DEFAULT 'الدرج الرئيسي - POS 1',
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    opening_cash REAL NOT NULL DEFAULT 0,
    opening_notes TEXT,
    opening_cash_breakdown TEXT,
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
    FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
);

-- ==========================================
-- جدول مصروفات وسحوبات الوردية من الدرج
-- ==========================================
CREATE TABLE IF NOT EXISTS shift_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- Indexes لتحسين الأداء (مهم لما البيانات تكبر)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_due_date ON sales(due_date);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_due_date ON purchases(due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
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
    notes TEXT,
    created_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE SET NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES customer_payments(id) ON DELETE SET NULL
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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_commission_rules_type ON commission_rules(target_type);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_user ON commission_earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_status ON commission_earnings(status);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_sale ON commission_earnings(sale_id);

-- ==========================================
-- جدول تفاعلات واتصالات العملاء (CRM Interactions)
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('call', 'note', 'message', 'complaint', 'offer')),
    subject TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'pending')),
    follow_up_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
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
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

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
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY (attribute_id) REFERENCES product_attribute_definitions(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. محرك حالات ومراحل سير العمل الديناميكي (Dynamic Workflows & Statuses)
-- ==========================================
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
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
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
);

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
    UNIQUE(role_key, permission_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_variant ON product_attribute_values(variant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_statuses_workflow ON workflow_statuses(workflow_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_event ON automation_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_key);





