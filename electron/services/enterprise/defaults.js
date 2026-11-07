// Built-in modules, business profiles and roles (data only).


// Initial Default Modules Registry Seed
const DEFAULT_MODULES = [
  { key: 'pos', name: 'شاشة الكاشير والمبيعات', description: 'إصدار الفواتير وطباعة الإيصالات والماسح البصري', display_order: 1, is_enabled: 1 },
  { key: 'inventory', name: 'إدارة المنتجات والمخزون', description: 'المنتجات والخصومات والتصنيفات والتكلفة', display_order: 2, is_enabled: 1 },
  { key: 'subscriptions', name: 'الاشتراكات والباقات', description: 'باقات الجلسات، العضويات، الاشتراكات الشهرية والتجميد', display_order: 4, is_enabled: 1 },
  { key: 'commissions', name: 'نظام العمولات والحوافز', description: 'حساب عمولات الموظفين التلقائية ومحرك الأهداف', display_order: 5, is_enabled: 1 },
  { key: 'crm', name: 'إدارة علاقات العملاء', description: 'ملفات العملاء وسجل التعامل والفرص البيعية والمتابعة', display_order: 6, is_enabled: 1 },
  { key: 'purchases', name: 'الموردين والمشتريات', description: 'فواتير الموردين والآجل والديون', display_order: 7, is_enabled: 1 },
  { key: 'reports', name: 'التقارير والأرباح', description: 'تقارير المبيعات، الأرباح، الوردية والتحليلات', display_order: 8, is_enabled: 1 },
  { key: 'settings', name: 'إعدادات النظام والأمان', description: 'النسخ الاحتياطي، الطابعة والمعلومات العامة', display_order: 9, is_enabled: 1 },
  { key: 'enterprise', name: 'إدارة البنية والديناميكية', description: 'الأتمتة، الأنماط، الصفات الديناميكية وسير العمل', display_order: 10, is_enabled: 1 },
  { key: 'customers', name: 'إدارة العملاء', description: 'ملفات العملاء والحسابات والتواصل', display_order: 11, is_enabled: 1 },
  { key: 'returns', name: 'المرتجعات والاستبدال', description: 'إدارة المرتجعات والاستبدالات', display_order: 12, is_enabled: 1 },
  { key: 'shifts', name: 'الورديات', description: 'فتح وإغلاق الورديات وإدارة النقدية', display_order: 13, is_enabled: 1 },
  { key: 'users', name: 'المستخدمون', description: 'إدارة حسابات المستخدمين والأدوار', display_order: 14, is_enabled: 1 },
  { key: 'salon', name: 'الصالونات والحلاقة', description: 'إدارة الكراسي ومحطات العمل، خدمات التصفيف والبقشيش', display_order: 15, is_enabled: 1 },
  { key: 'appointments', name: 'حجوزات المواعيد', description: 'حجز المواعيد والجلسات والتذكير بالواتساب', display_order: 16, is_enabled: 1 },
  { key: 'cases', name: 'القضايا والمحاكم', description: 'إدارة ملفات القضايا والجلسات القضائية وموكلي المحاماة', display_order: 17, is_enabled: 0 }
];

// Initial Business Profiles Presets Seed
const DEFAULT_PROFILES = [
  {
    key: 'retail',
    name: '🛍️ تجزئة وملابس (Retail & Apparel)',
    is_active: 1,
    settings_json: {
      attributes: ['size', 'color', 'brand', 'material'],
      term_order: 'طلب بيع / توصيل',
      term_customer: 'زبون / عميل',
      enabled_modules: ['pos', 'inventory', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'electronics',
    name: '💻 إلكترونيات وتكنولوجيا (Electronics & Tech)',
    is_active: 0,
    settings_json: {
      attributes: ['brand', 'model', 'serial_number', 'warranty_months'],
      term_order: 'طلب توريد / صيانة',
      term_customer: 'عميل شركات / فرد',
      enabled_modules: ['pos', 'inventory', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'maintenance',
    name: '🛠️ ورشة صيانة وخدمات (Maintenance & Repair)',
    is_active: 0,
    settings_json: {
      attributes: ['device_type', 'imei_serial', 'fault_description', 'warranty_status'],
      term_order: 'امر صيانة / تذكرة',
      term_customer: 'صاحب الجهاز',
      enabled_modules: ['crm', 'inventory', 'pos', 'commissions', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'auto_workshop',
    name: '🚘 ورشة إصلاح سيارات (Auto Repair Workshop)',
    is_active: 0,
    settings_json: {
      attributes: ['car_make', 'car_model', 'year', 'vehicle_plate', 'odometer', 'fault_description'],
      term_order: 'أمر إصلاح سيارة',
      term_customer: 'مالك السيارة',
      enabled_modules: ['pos', 'inventory', 'customers', 'commissions', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'subscriptions_gym',
    name: '🏋️ جيم وخدمات اشتراكات (Gym & Subscriptions)',
    is_active: 0,
    settings_json: {
      attributes: ['membership_number', 'access_level', 'personal_trainer'],
      term_order: 'اشتراك / باقة',
      term_customer: 'عضو / مشترك',
      enabled_modules: ['subscriptions', 'pos', 'crm', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'grocery',
    name: '🛒 سوبرماركت وبقالة (Grocery & Supermarket)',
    is_active: 0,
    settings_json: {
      attributes: ['weight_kg', 'expiry_date', 'batch_number'],
      term_order: 'طلب توريد',
      term_customer: 'عميل متجر',
      enabled_modules: ['pos', 'inventory', 'purchases', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'spare_parts',
    name: '🚘 قطع غيار وسيارات (Auto Spare Parts)',
    is_active: 0,
    settings_json: {
      attributes: ['car_make', 'car_model', 'year', 'oem_number'],
      term_order: 'طلب قطع غيار',
      term_customer: 'مركز خدمة / عميل',
      enabled_modules: ['inventory', 'pos', 'purchases', 'reports', 'settings', 'enterprise']
    }
  },
  {
    key: 'law_firm',
    name: '⚖️ مكاتب محاماة واستشارات قانونية (Law Firm)',
    is_active: 0,
    settings_json: {
      attributes: ['case_number', 'court_name', 'circuit_name', 'opponent_name', 'power_of_attorney_num'],
      term_order: 'ملف قضية',
      term_customer: 'موكّل',
      enabled_modules: ['cases', 'appointments', 'crm', 'reports', 'settings', 'enterprise', 'users', 'salaries']
    }
  },
  {
    key: 'cafe_restaurant',
    name: '☕ مطاعم وكافيهات (Cafe & Food)',
    is_active: 0,
    settings_json: {
      // No per-product fields: milk, sugar and extras are per-order choices, not product data.
      attributes: [],
      term_order: 'طلب / أوردر',
      term_customer: 'ضيف / عميل',
      enabled_modules: ['pos', 'inventory', 'reports', 'settings', 'shifts', 'users', 'enterprise']
    }
  },
  {
    key: 'salon_barbershop',
    name: '💈 صالونات وتجميل وحلاقة (Salon & Beauty)',
    is_active: 0,
    settings_json: {
      attributes: ['service_duration', 'stylist_name', 'chair_number'],
      term_order: 'فاتورة خدمة وتصفيف',
      term_customer: 'زبون / عميل',
      enabled_modules: ['salon', 'pos', 'commissions', 'subscriptions', 'inventory', 'crm', 'shifts', 'reports', 'settings', 'users', 'enterprise']
    }
  },
  {
    key: 'crm',
    name: '👥 إدارة علاقات العملاء (CRM)',
    is_active: 0,
    settings_json: {
      attributes: ['lead_source', 'contact_role', 'customer_segment'],
      term_order: 'صفقة / فرصة بيع',
      term_customer: 'عميل / جهة اتصال',
      enabled_modules: ['crm', 'reports', 'settings', 'enterprise', 'users']
    }
  }
];

const ALWAYS_ENABLED_PROFILE_MODULES = ['pos', 'settings', 'enterprise'];

const PROFILE_BASELINE_MODULES = [
  ...ALWAYS_ENABLED_PROFILE_MODULES,
  'returns',
  'shifts',
  'users',
];

const PRESET_ATTRIBUTE_KEYS = new Set([
  'size', 'color', 'brand', 'material', 'model', 'serial_number',
  'warranty_months', 'device_type', 'imei_serial', 'fault_description',
  'warranty_status', 'membership_number', 'access_level', 'personal_trainer',
  'weight_kg', 'expiry_date', 'batch_number', 'car_make', 'car_model',
  'year', 'oem_number', 'milk_type', 'sweetness_level', 'extras',
  'vehicle_plate', 'odometer',
  'case_number', 'court_name', 'circuit_name', 'opponent_name', 'power_of_attorney_num',
]);

// Initial Roles Seed (lists live in shared/ so the roles page can "reset to default").
// Cashier: sells, runs their own shift (shifts.service limits it to their own),
// takes orders and adds customers. No returns, discounts, prices, stock or reports.
// Branch manager: everything a cashier does, plus products (prices, options,
// archive), returns, discounts, the sales log and the team. Stock changes,
// settings and roles stay with the owner.
const {
  cashier: CASHIER_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
} = require('../../../shared/defaultRolePermissions.json');

const DEFAULT_ROLES = [
  {
    role_key: 'admin',
    role_name: 'مدير النظام (Admin)',
    description: 'صلاحيات كاملة وغير محدودة لجميع الأقسام والإعدادات',
    is_system: 1,
    permissions: ['*']
  },
  {
    role_key: 'manager',
    role_name: 'مدير فرع / تشغيل (Manager)',
    description: 'إدارة العمليات، التقارير، الاشتراكات والعملاء مع تقييد الإعدادات الحساسة',
    is_system: 1,
    permissions: MANAGER_PERMISSIONS
  },
  {
    role_key: 'cashier',
    role_name: 'كاشير مبيعات (Cashier)',
    description: 'إصدار الفواتير وتحصيل المبيعات واسترجاع الفواتير المعلقة فقط',
    is_system: 1,
    permissions: CASHIER_PERMISSIONS
  }
];

module.exports = {
  DEFAULT_MODULES,
  DEFAULT_PROFILES,
  ALWAYS_ENABLED_PROFILE_MODULES,
  PROFILE_BASELINE_MODULES,
  PRESET_ATTRIBUTE_KEYS,
  DEFAULT_ROLES,
  CASHIER_PERMISSIONS,
  MANAGER_PERMISSIONS,
};
