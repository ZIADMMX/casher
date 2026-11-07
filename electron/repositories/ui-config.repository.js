const { db } = require('../database/db');

/**
 * مستودع إعدادات واجهة المستخدم الديناميكية (Screen Designer)
 * يتيح للمدير تخصيص بطاقات Dashboard، حقول POS، أعمدة المنتجات، أزرار الاختصار، قالب الفاتورة، ونموذج الطلب
 */

// ============================================
// الإعدادات الافتراضية لكل نطاق
// ============================================
const DEFAULT_CONFIGS = {
  dashboard: [
    { id: 'sales_today', label: 'مبيعات اليوم', visible: true, icon: 'sales' },
    { id: 'revenue_today', label: 'إيرادات اليوم', visible: true, icon: 'revenue' },
    { id: 'low_stock_count', label: 'المخزون المنخفض', visible: true, icon: 'stock' },
    { id: 'customers_count', label: 'عدد العملاء', visible: true, icon: 'customers' },
    { id: 'top_products', label: 'أفضل المنتجات', visible: true, icon: 'top' },
    { id: 'recent_sales', label: 'المبيعات الأخيرة', visible: true, icon: 'recent' },
    { id: 'returns_today', label: 'المرتجعات', visible: false, icon: 'returns' },
    { id: 'profit_today', label: 'الأرباح', visible: true, icon: 'profit' },
    { id: 'active_shifts', label: 'الورديات النشطة', visible: false, icon: 'shifts' },
  ],
  pos_fields: [
    { id: 'barcode_search', label: 'البحث بالباركود', visible: true, required: true },
    { id: 'category_filter', label: 'تصفية الفئات', visible: true, required: false },
    { id: 'customer_select', label: 'اختيار العميل', visible: true, required: false },
    { id: 'discount_field', label: 'حقل الخصم', visible: true, required: false },
    { id: 'notes_field', label: 'حقل الملاحظات', visible: true, required: false },
    { id: 'quantity_field', label: 'حقل الكمية', visible: true, required: true },
    { id: 'coupon_field', label: 'حقل الكوبون', visible: false, required: false },
  ],
  product_table: [
    { id: 'name', label: 'الاسم', visible: true },
    { id: 'sku', label: 'رمز SKU', visible: true },
    { id: 'barcode', label: 'الباركود', visible: true },
    { id: 'category', label: 'الفئة', visible: true },
    { id: 'selling_price', label: 'سعر البيع', visible: true },
    { id: 'purchase_price', label: 'سعر الشراء', visible: true },
    { id: 'stock_quantity', label: 'كمية المخزون', visible: true },
    { id: 'image', label: 'الصورة', visible: true },
    { id: 'low_stock_threshold', label: 'حد المخزون المنخفض', visible: false },
    { id: 'created_at', label: 'تاريخ الإضافة', visible: false },
  ],
  shortcuts: [
    { id: 'new_sale', label: 'بيع جديد', visible: true, icon: 'plus', color: '#10b981' },
    { id: 'quick_return', label: 'مرتجع سريع', visible: true, icon: 'return', color: '#ef4444' },
    { id: 'hold_order', label: 'تعليق الطلب', visible: true, icon: 'pause', color: '#f59e0b' },
    { id: 'open_drawer', label: 'فتح الدرج', visible: true, icon: 'unlock', color: '#6366f1' },
    { id: 'print_report', label: 'طباعة تقرير', visible: true, icon: 'print', color: '#8b5cf6' },
    { id: 'add_customer', label: 'إضافة عميل', visible: true, icon: 'user', color: '#3b82f6' },
    { id: 'add_product', label: 'إضافة منتج', visible: false, icon: 'box', color: '#14b8a6' },
    { id: 'backup', label: 'نسخة احتياطية', visible: false, icon: 'save', color: '#64748b' },
  ],
  invoice_template: [
    { id: 'header', label: 'الترويسة (اسم المتجر والشعار)', visible: true, customText: '' },
    { id: 'items_table', label: 'جدول المنتجات', visible: true },
    { id: 'totals', label: 'المجاميع والضرائب', visible: true },
    { id: 'footer', label: 'التذييل (رسالة شكر)', visible: true, customText: 'شكراً لتسوقكم معنا! الاستبدال خلال 14 يوماً بالفاتورة.' },
    { id: 'qr_code', label: 'رمز QR', visible: false },
    { id: 'barcode', label: 'باركود الفاتورة', visible: true },
  ],
  order_fields: [
    { id: 'customer_name', label: 'اسم العميل', visible: true, required: true },
    { id: 'phone', label: 'رقم الهاتف', visible: true, required: true },
    { id: 'email', label: 'البريد الإلكتروني', visible: false, required: false },
    { id: 'address', label: 'العنوان', visible: true, required: false },
    { id: 'delivery_date', label: 'تاريخ التوصيل', visible: true, required: false },
    { id: 'notes', label: 'ملاحظات', visible: true, required: false },
    { id: 'priority', label: 'الأولوية', visible: true, required: false },
    { id: 'payment_method', label: 'طريقة الدفع', visible: true, required: true },
  ],
};

const VALID_SCOPES = Object.keys(DEFAULT_CONFIGS);

// ============================================
// عمليات القراءة والكتابة
// ============================================

function getUIConfig(scope, roleOrUserId = null) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`النطاق "${scope}" غير صالح`);
  }
  const row = roleOrUserId
    ? db.prepare('SELECT config_json FROM ui_configurations WHERE scope = ? AND config_key = ? AND role_or_user = ?').get(scope, '_all', String(roleOrUserId))
    : db.prepare('SELECT config_json FROM ui_configurations WHERE scope = ? AND config_key = ? AND role_or_user IS NULL').get(scope, '_all');

  if (row) {
    try { return JSON.parse(row.config_json); } catch { return DEFAULT_CONFIGS[scope]; }
  }
  return DEFAULT_CONFIGS[scope];
}

function saveUIConfig(scope, configJson, roleOrUserId = null) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`النطاق "${scope}" غير صالح`);
  }
  const json = typeof configJson === 'string' ? configJson : JSON.stringify(configJson);
  const stmt = db.prepare(`
    INSERT INTO ui_configurations (scope, config_key, config_json, role_or_user)
    VALUES (?, '_all', ?, ?)
    ON CONFLICT(scope, config_key, COALESCE(role_or_user, '')) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(scope, json, roleOrUserId || null);
  return getUIConfig(scope, roleOrUserId);
}

function deleteUIConfig(scope, roleOrUserId = null) {
  if (roleOrUserId) {
    db.prepare('DELETE FROM ui_configurations WHERE scope = ? AND role_or_user = ?').run(scope, String(roleOrUserId));
  } else {
    db.prepare('DELETE FROM ui_configurations WHERE scope = ? AND role_or_user IS NULL').run(scope);
  }
}

function getAllScopes() {
  return VALID_SCOPES.map(scope => ({
    key: scope,
    label: {
      dashboard: 'لوحة التحكم',
      pos_fields: 'شاشة البيع',
      product_table: 'جدول المنتجات',
      shortcuts: 'أزرار الاختصار',
      invoice_template: 'قالب الفاتورة',
      order_fields: 'نموذج الطلب',
    }[scope] || scope,
  }));
}

function getDefaultConfig(scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`النطاق "${scope}" غير صالح`);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIGS[scope]));
}

function exportAllConfigs() {
  const rows = db.prepare('SELECT scope, config_key, config_json, role_or_user FROM ui_configurations').all();
  const result = {};
  for (const row of rows) {
    const key = row.role_or_user ? `${row.scope}:${row.role_or_user}` : row.scope;
    try { result[key] = JSON.parse(row.config_json); } catch { result[key] = row.config_json; }
  }
  return result;
}

function importAllConfigs(configData) {
  const runTx = db.transaction(() => {
    for (const [scopeKey, config] of Object.entries(configData)) {
      const parts = scopeKey.split(':');
      const scope = parts[0];
      const roleOrUser = parts[1] || null;
      if (!VALID_SCOPES.includes(scope)) continue;
      saveUIConfig(scope, config, roleOrUser);
    }
  });
  runTx();
}

module.exports = {
  DEFAULT_CONFIGS,
  VALID_SCOPES,
  getUIConfig,
  saveUIConfig,
  deleteUIConfig,
  getAllScopes,
  getDefaultConfig,
  exportAllConfigs,
  importAllConfigs,
};
