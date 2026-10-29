const enterpriseRepo = require('../repositories/enterprise.repository');
const NotificationsService = require('./notifications.service');
const { VALID_PERMISSIONS } = require('../security/permissions');

/**
 * Enterprise Framework Service
 * Business Logic, Presets, Automatic Seeding, Rules Evaluator Engine, Dynamic Workflows & Dynamic RBAC
 */

// Initial Default Modules Registry Seed
const DEFAULT_MODULES = [
  { key: 'pos', name: 'شاشة الكاشير والمبيعات', description: 'إصدار الفواتير وطباعة الإيصالات والماسح البصري', display_order: 1, is_enabled: 1 },
  { key: 'inventory', name: 'إدارة المنتجات والمخزون', description: 'المنتجات والخصومات والتصنيفات والتكلفة', display_order: 2, is_enabled: 1 },
  { key: 'orders', name: 'مركز الطلبات والعمليات', description: 'طلبات التوصيل، الحجوزات، التفصيل، الصيانة والخدمات', display_order: 3, is_enabled: 1 },
  { key: 'subscriptions', name: 'الاشتراكات والباقات', description: 'باقات الجلسات، العضويات، الاشتراكات الشهرية والتجميد', display_order: 4, is_enabled: 1 },
  { key: 'commissions', name: 'نظام العمولات والحوافز', description: 'حساب عمولات الموظفين التلقائية ومحرك الأهداف', display_order: 5, is_enabled: 1 },
  { key: 'crm', name: 'مركز اتصالات العملاء', description: 'السجل الزمني الموحد، صفقات المبيعات Kanban وتقييم العملاء', display_order: 6, is_enabled: 1 },
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
      enabled_modules: ['pos', 'inventory', 'orders', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'enterprise']
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
      enabled_modules: ['pos', 'inventory', 'orders', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'enterprise']
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
      enabled_modules: ['orders', 'crm', 'inventory', 'pos', 'commissions', 'reports', 'settings', 'enterprise']
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
      enabled_modules: ['pos', 'orders', 'inventory', 'customers', 'commissions', 'reports', 'settings', 'enterprise']
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
      enabled_modules: ['inventory', 'pos', 'purchases', 'orders', 'reports', 'settings', 'enterprise']
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
      enabled_modules: ['cases', 'appointments', 'crm', 'orders', 'reports', 'settings', 'enterprise', 'users', 'salaries']
    }
  },
  {
    key: 'cafe_restaurant',
    name: '☕ مطاعم وكافيهات (Cafe & Food)',
    is_active: 0,
    settings_json: {
      attributes: ['milk_type', 'sweetness_level', 'extras'],
      term_order: 'طلب / أوردر',
      term_customer: 'ضيف / عميل',
      enabled_modules: ['pos', 'inventory', 'orders', 'reports', 'settings', 'shifts', 'users', 'enterprise']
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

// Initial Roles Seed
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
    permissions: [
      'pos.view', 'pos.sell', 'orders.manage', 'subscriptions.manage',
      'customers.view', 'customers.create', 'customers.edit',
      'products.view', 'reports.view', 'team.view', 'team.manage',
      'attendance.view', 'attendance.manage', 'leaves.view', 'leaves.manage',
    ]
  },
  {
    role_key: 'cashier',
    role_name: 'كاشير مبيعات (Cashier)',
    description: 'إصدار الفواتير وتحصيل المبيعات واسترجاع الفواتير المعلقة فقط',
    is_system: 1,
    permissions: ['pos.view', 'pos.sell', 'orders.view']
  }
];

function seedEnterpriseDefaults() {
  const { db } = require('../database/db');
  const systemModulesTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'system_modules'"
  ).get();
  if (!systemModulesTable) return false;

  try {
    // تنظيف أي صفات أو أدوار اختبارية مترسبة من بيئة الفحص
    try {
      db.prepare("DELETE FROM product_attribute_definitions WHERE attribute_key LIKE 'test_%' OR attribute_name LIKE '%الاختبارية%'").run();
      db.prepare("DELETE FROM system_roles WHERE role_key LIKE 'supervisor_test_%'").run();
      db.prepare("DELETE FROM role_permissions WHERE role_key LIKE 'supervisor_test_%'").run();
    } catch {}

    const existingModules = enterpriseRepo.getModules();
    const moduleKeys = new Set(existingModules.map((module) => module.key));
    for (const m of DEFAULT_MODULES) {
      if (!moduleKeys.has(m.key)) {
        enterpriseRepo.upsertModule(m);
      }
    }

    // Seed Business Profiles
    const existingProfiles = enterpriseRepo.getBusinessProfiles();
    const profileKeys = new Set(existingProfiles.map((profile) => profile.key));
    for (const p of DEFAULT_PROFILES) {
      if (!profileKeys.has(p.key)) {
        enterpriseRepo.upsertBusinessProfile(p);
      }
    }
    const previousRetailModules = [
      'pos', 'inventory', 'orders', 'subscriptions', 'commissions',
      'crm', 'purchases', 'reports', 'settings', 'enterprise',
    ];
    const savedRetailProfile = existingProfiles.find((profile) => profile.key === 'retail');
    if (savedRetailProfile) {
      const savedSettings = typeof savedRetailProfile.settings_json === 'string'
        ? JSON.parse(savedRetailProfile.settings_json)
        : savedRetailProfile.settings_json;
      const savedModules = savedSettings?.enabled_modules || [];
      const isPreviousDefault = savedModules.length === previousRetailModules.length
        && previousRetailModules.every((module) => savedModules.includes(module));
      if (isPreviousDefault) {
        enterpriseRepo.upsertBusinessProfile(DEFAULT_PROFILES[0]);
        if (savedRetailProfile.is_active) {
          enterpriseRepo.setActiveBusinessProfile('retail', [
            ...new Set([...PROFILE_BASELINE_MODULES, ...DEFAULT_PROFILES[0].settings_json.enabled_modules]),
          ]);
        }
      }
    }
    if (!existingProfiles.some((profile) => profile.is_active)) {
      enterpriseRepo.setActiveBusinessProfile('retail', DEFAULT_PROFILES[0].settings_json.enabled_modules);
    }

    // Seed Roles
    const existingRoles = enterpriseRepo.getRoles();
    if (!existingRoles || existingRoles.length === 0) {
      for (const r of DEFAULT_ROLES) {
        enterpriseRepo.createRole(r.role_key, r.role_name, r.description, r.is_system);
        enterpriseRepo.setRolePermissions(r.role_key, r.permissions);
      }
    }
    const defaultManager = DEFAULT_ROLES.find((role) => role.role_key === 'manager');
    const storedManager = enterpriseRepo.getRoles().find((role) => role.role_key === 'manager');
    const previousManagerPermissions = [
      'pos.view', 'pos.sell', 'orders.manage', 'subscriptions.manage',
      'crm.manage', 'inventory.view', 'reports.view',
    ];
    if (storedManager
      && previousManagerPermissions.every((permission) => storedManager.permissions.includes(permission))
      && storedManager.permissions.length === previousManagerPermissions.length) {
      enterpriseRepo.setRolePermissions('manager', defaultManager.permissions);
    }

    const attributeCatalog = [
      ['brand', 'الماركة / العلامة التجارية', 'text'],
      ['model', 'الموديل / الرقم المصنعي', 'text'],
      ['expiry_date', 'تاريخ الانتهاء', 'date'],
      ['warranty_months', 'الضمان (بالأشهر)', 'number'],
      ['size', 'المقاس', 'text'],
      ['color', 'اللون', 'text'],
      ['material', 'الخامة', 'text'],
      ['serial_number', 'الرقم التسلسلي', 'text'],
      ['device_type', 'نوع الجهاز', 'text'],
      ['imei_serial', 'رقم IMEI / الرقم التسلسلي', 'text'],
      ['fault_description', 'وصف العطل', 'text'],
      ['warranty_status', 'حالة الضمان', 'text'],
      ['membership_number', 'رقم العضوية', 'text'],
      ['access_level', 'مستوى الدخول', 'text'],
      ['personal_trainer', 'المدرب الشخصي', 'text'],
      ['weight_kg', 'الوزن بالكيلو', 'number'],
      ['batch_number', 'رقم التشغيلة', 'text'],
      ['car_make', 'ماركة السيارة', 'text'],
      ['car_model', 'موديل السيارة', 'text'],
      ['year', 'سنة الصنع', 'number'],
      ['vehicle_plate', 'رقم لوحة السيارة', 'text'],
      ['odometer', 'قراءة العداد (كم)', 'number'],
      ['oem_number', 'رقم القطعة الأصلي', 'text'],
      ['milk_type', 'نوع الحليب', 'text'],
      ['sweetness_level', 'مستوى السكر', 'text'],
      ['extras', 'إضافات خاصة', 'text'],
    ];
    const existingAttributeKeys = new Set(enterpriseRepo.getAttributeDefinitions().map((attribute) => attribute.attribute_key));
    for (const [attribute_key, attribute_name, data_type] of attributeCatalog) {
      if (!existingAttributeKeys.has(attribute_key)) {
        enterpriseRepo.createAttributeDefinition({
          attribute_name,
          attribute_key,
          data_type,
        });
      }
    }

    seedDefaultWorkflows();
    return true;

  } catch (err) {
    console.error('Failed to seed enterprise defaults:', err.message);
    return false;
  }
}

function getModules() {
  return enterpriseRepo.getModules();
}

function setModuleEnabled(key, isEnabled) {
  if (!isEnabled && ALWAYS_ENABLED_PROFILE_MODULES.includes(key)) {
    throw new Error('لا يمكن تعطيل وحدة أساسية مطلوبة لتشغيل النظام');
  }
  return enterpriseRepo.setModuleEnabled(key, isEnabled);
}

function getBusinessProfiles() {
  return enterpriseRepo.getBusinessProfiles();
}

function getActiveBusinessProfile() {
  return enterpriseRepo.getActiveBusinessProfile();
}

function setActiveBusinessProfile(profileKey) {
  const profile = enterpriseRepo.getBusinessProfiles().find((item) => item.key === profileKey);
  if (!profile) throw new Error('القالب التجاري المحدد غير موجود');
  const settings = parseProfileSettings(profile);
  const enabledModules = new Set([
    ...PROFILE_BASELINE_MODULES,
    ...(settings.enabled_modules || []),
  ]);
  return enterpriseRepo.setActiveBusinessProfile(profileKey, [...enabledModules]);
}

function getAttributeDefinitions(profileKey = null) {
  const profile = profileKey
    ? enterpriseRepo.getBusinessProfiles().find((item) => item.key === profileKey)
    : enterpriseRepo.getActiveBusinessProfile();
  const configuredKeys = profile ? parseProfileSettings(profile).attributes : null;
  const definitions = enterpriseRepo.getAttributeDefinitions(profile?.key || null);
  if (!configuredKeys?.length) return definitions;
  const allowedKeys = new Set(configuredKeys);
  return definitions.filter((definition) =>
    allowedKeys.has(definition.attribute_key) ||
    definition.business_profile_key === profile?.key ||
    !PRESET_ATTRIBUTE_KEYS.has(definition.attribute_key)
  );
}

function parseProfileSettings(profile) {
  if (!profile?.settings_json) return {};
  const settings = typeof profile.settings_json === 'string'
    ? JSON.parse(profile.settings_json)
    : profile.settings_json;
  return {
    ...settings,
    attributes: settings.product_attributes || settings.attributes || [],
    terms: settings.terms || {
      order: settings.term_order,
      customer: settings.term_customer,
    },
  };
}

function getActiveBusinessConfiguration() {
  const profile = enterpriseRepo.getActiveBusinessProfile();
  const settings = parseProfileSettings(profile);
  return {
    profile: profile ? { key: profile.key, name: profile.name } : null,
    settings,
    modules: enterpriseRepo.getModules(),
    attributes: getAttributeDefinitions(profile?.key || null),
  };
}

function createAttributeDefinition(data) {
  if (!data.attribute_name || !data.attribute_key) {
    throw new Error('اسم ومفتاح الخاصية مطلوبان');
  }
  return enterpriseRepo.createAttributeDefinition(data);
}

function getVariantAttributeValues(variantId) {
  return enterpriseRepo.getVariantAttributeValues(variantId);
}

function getAllVariantAttributeValues() {
  return enterpriseRepo.getAllVariantAttributeValues();
}

function saveVariantAttributeValues(variantId, valuesMap) {
  if (!Number.isInteger(Number(variantId)) || Number(variantId) <= 0) {
    throw new Error('معرف متغير المنتج غير صالح');
  }
  const definitions = getAttributeDefinitions();
  const allowedIds = new Set(definitions.map((definition) => String(definition.id)));
  const values = valuesMap && typeof valuesMap === 'object' ? valuesMap : {};

  for (const definition of definitions) {
    const value = values[definition.id];
    if (definition.is_required && (value == null || String(value).trim() === '')) {
      throw new Error(`الحقل ${definition.attribute_name} مطلوب`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!allowedIds.has(String(key))) {
      throw new Error('تحتوي خصائص المنتج على حقل غير مسموح به');
    }
  }
  const allowedValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => allowedIds.has(String(key)))
  );
  return enterpriseRepo.saveVariantAttributeValues(variantId, allowedValues, [...allowedIds]);
}

function seedDefaultWorkflows(forceReset = false) {
  try {
    const existingWorkflows = enterpriseRepo.getWorkflows();
    if (!forceReset && existingWorkflows && existingWorkflows.length > 0) {
      return existingWorkflows;
    }

    if (forceReset) {
      for (const wf of existingWorkflows) {
        enterpriseRepo.deleteWorkflow(wf.id);
      }
    }

    // 1. Maintenance Workflow (الصيانة والورشة)
    const wfMaintId = enterpriseRepo.createWorkflow({
      module_key: 'orders',
      entity_type: 'maintenance_ticket',
      name: 'سير عمل صيانة الأجهزة والخدمات',
      description: 'مسار تذاكر ورشة الصيانة: استلام ← فحص ← انتظار قطعة ← جاهز ← تم التسليم',
      business_profile_key: 'maintenance',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'received', status_label: 'استلام الجهاز', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'inspection', status_label: 'فحص وتشخيص', badge_color: '#8b5cf6', step_order: 2, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'waiting_part', status_label: 'انتظار قطعة غيار', badge_color: '#f59e0b', step_order: 3, sla_hours: 72 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'ready', status_label: 'جاهز للتسليم', badge_color: '#10b981', step_order: 4 });
    enterpriseRepo.addWorkflowStatus(wfMaintId, { status_key: 'delivered', status_label: 'تم التسليم للمشتري', badge_color: '#059669', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfMaintId, [
      { from_status_key: 'received', to_status_key: 'inspection', allowed_roles_json: ['admin', 'manager', 'cashier', 'technician'], auto_action_type: 'none' },
      { from_status_key: 'inspection', to_status_key: 'waiting_part', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'send_notification', sla_limit_hours: 72, sla_alert_message: 'لو التذكرة واقفة 3 أيام نبّه بخصوص قطعة الغيار' },
      { from_status_key: 'inspection', to_status_key: 'ready', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'send_notification' },
      { from_status_key: 'waiting_part', to_status_key: 'ready', allowed_roles_json: ['admin', 'manager', 'technician'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'ready', to_status_key: 'delivered', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-701',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'تغيير شاشة آيفون 13 برو أصلية',
      customer_name: 'أحمد محمود',
      customer_phone: '01012345678',
      current_status_key: 'waiting_part',
      assigned_role: 'technician',
      notes: 'تم فحص الجهاز والشاشة غير متوفرة حالياً، تم طلب القطعة من المورد'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-702',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'فحص عطل باور ولاب توب ديل',
      customer_name: 'محمد الشريف',
      customer_phone: '01122334455',
      current_status_key: 'inspection',
      assigned_role: 'technician',
      notes: 'الجهاز لا يعمل إطلاقاً عند الضغط على زر التشغيل'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'TK-703',
      workflow_id: wfMaintId,
      entity_type: 'maintenance_ticket',
      title: 'صيانة بوردة وبلايستيشن 5',
      customer_name: 'سارة فاروق',
      customer_phone: '01233445566',
      current_status_key: 'ready',
      assigned_role: 'cashier',
      notes: 'تم الإصلاح وتجربة الجهاز بنجاح، بانتظار استلام العميل'
    });

    // 2. Gym Subscriptions Workflow (الجيم والاشتراكات)
    const wfGymId = enterpriseRepo.createWorkflow({
      module_key: 'subscriptions',
      entity_type: 'subscription',
      name: 'سير عمل تجديد وتجميد الاشتراك',
      description: 'مسار اشتراكات الجيم والرياضة: طلب جديد ← نشط ← تجميد مؤقت ← طلب تجديد ← منتهي',
      business_profile_key: 'subscriptions_gym',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'new_req', status_label: 'طلب جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'active', status_label: 'اشتراك نشط', badge_color: '#10b981', step_order: 2 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'frozen', status_label: 'تجميد مؤقت', badge_color: '#06b6d4', step_order: 3, sla_hours: 336 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'renewal_pending', status_label: 'طلب تجديد', badge_color: '#f59e0b', step_order: 4, sla_hours: 72 });
    enterpriseRepo.addWorkflowStatus(wfGymId, { status_key: 'expired', status_label: 'اشتراك منتهي', badge_color: '#6b7280', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfGymId, [
      { from_status_key: 'new_req', to_status_key: 'active', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'active', to_status_key: 'frozen', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'frozen', to_status_key: 'active', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' },
      { from_status_key: 'active', to_status_key: 'renewal_pending', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'send_notification', sla_limit_hours: 72 },
      { from_status_key: 'renewal_pending', to_status_key: 'active', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'renewal_pending', to_status_key: 'expired', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'SUB-101',
      workflow_id: wfGymId,
      entity_type: 'subscription',
      title: 'اشتراك جيم سنوي VIP مع مدرب شخصي',
      customer_name: 'حازم الإمام',
      customer_phone: '01000112233',
      current_status_key: 'active',
      assigned_role: 'manager',
      notes: 'اشتراك شامل السونا والحديد والسباحة'
    });

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'SUB-102',
      workflow_id: wfGymId,
      entity_type: 'subscription',
      title: 'طلب تجميد اشتراك لمدة 14 يوم بسبب السفر',
      customer_name: 'علي حسن',
      customer_phone: '01111223344',
      current_status_key: 'frozen',
      assigned_role: 'manager',
      notes: 'طلب العضو إيقاف الاشتراك مؤقتاً لحين العودة'
    });

    // 3. Delivery Request Workflow (طلبات التوصيل)
    const wfDelivId = enterpriseRepo.createWorkflow({
      module_key: 'orders',
      entity_type: 'delivery_request',
      name: 'سير عمل طلبات التوصيل والدليفري',
      description: 'مسار طلبات التوصيل: طلب جديد ← قيد التجهيز ← جاري التوصيل ← تم التسليم',
      business_profile_key: 'retail',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'new', status_label: 'طلب جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'preparing', status_label: 'قيد التجهيز بالمخزن', badge_color: '#8b5cf6', step_order: 2 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'shipping', status_label: 'جاري التوصيل مع الطيار', badge_color: '#f59e0b', step_order: 3, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'delivered', status_label: 'تم التسليم بنجاح', badge_color: '#10b981', step_order: 4, is_final: 1 });
    enterpriseRepo.addWorkflowStatus(wfDelivId, { status_key: 'returned', status_label: 'مرتجع / لم يتم التسليم', badge_color: '#ef4444', step_order: 5, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfDelivId, [
      { from_status_key: 'new', to_status_key: 'preparing', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'preparing', to_status_key: 'shipping', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'send_notification' },
      { from_status_key: 'shipping', to_status_key: 'delivered', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'print_receipt' },
      { from_status_key: 'shipping', to_status_key: 'returned', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'DEL-201',
      workflow_id: wfDelivId,
      entity_type: 'delivery_request',
      title: 'توصيل شحنة ملابس وأقمشة أونلاين',
      customer_name: 'منى عبد العزيز',
      customer_phone: '01288776655',
      current_status_key: 'shipping',
      assigned_role: 'cashier',
      notes: 'تم التسليم لمندوب التوصيل والطلب في الطريق للعميل'
    });

    // 4. Purchase Order Workflow (أمر شراء)
    const wfPOId = enterpriseRepo.createWorkflow({
      module_key: 'purchases',
      entity_type: 'purchase_order',
      name: 'سير عمل أوامر الشراء والتوريد',
      description: 'مسار المشتريات: مسودة ← موافقة الإدارة ← طلب صادر ← استلام المخزن',
      business_profile_key: 'spare_parts',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'draft', status_label: 'مسودة طلب', badge_color: '#6b7280', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'pending_approval', status_label: 'بانتظار الموافقة', badge_color: '#f59e0b', step_order: 2, sla_hours: 48 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'ordered', status_label: 'طلب توريد صادر', badge_color: '#3b82f6', step_order: 3 });
    enterpriseRepo.addWorkflowStatus(wfPOId, { status_key: 'received', status_label: 'تم الاستلام وإضافة المخزون', badge_color: '#10b981', step_order: 4, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfPOId, [
      { from_status_key: 'draft', to_status_key: 'pending_approval', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'pending_approval', to_status_key: 'ordered', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'send_notification' },
      { from_status_key: 'ordered', to_status_key: 'received', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'stock_deduct' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'PO-501',
      workflow_id: wfPOId,
      entity_type: 'purchase_order',
      title: 'طلب توريد شاشات وقطع غيار أصلية من المورد',
      customer_name: 'شركة التكنولوجيا المتقدمة',
      customer_phone: '0223456789',
      current_status_key: 'pending_approval',
      assigned_role: 'manager',
      notes: 'طلب توريد عدد 50 شاشة آيفون و20 بوردة صيانة'
    });

    // 5. Return Order Workflow (مرتجع)
    const wfRetId = enterpriseRepo.createWorkflow({
      module_key: 'returns',
      entity_type: 'return_order',
      name: 'سير عمل المرتجعات والاستبدال',
      description: 'مسار المرتجعات: طلب مرتجع ← فحص المرتجع ← تم الاسترداد/الاستبدال',
      business_profile_key: 'returns',
      is_active: 1
    });

    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'requested', status_label: 'طلب مرتجع جديد', badge_color: '#3b82f6', step_order: 1, is_initial: 1 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'inspecting', status_label: 'فحص حالة المرتجع', badge_color: '#8b5cf6', step_order: 2, sla_hours: 24 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'completed', status_label: 'تم الاسترداد / الاستبدال', badge_color: '#10b981', step_order: 3, is_final: 1 });
    enterpriseRepo.addWorkflowStatus(wfRetId, { status_key: 'rejected', status_label: 'طلب مرتجع مرفوض', badge_color: '#ef4444', step_order: 4, is_final: 1 });

    enterpriseRepo.saveWorkflowTransitions(wfRetId, [
      { from_status_key: 'requested', to_status_key: 'inspecting', allowed_roles_json: ['admin', 'manager', 'cashier'], auto_action_type: 'none' },
      { from_status_key: 'inspecting', to_status_key: 'completed', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'stock_deduct' },
      { from_status_key: 'inspecting', to_status_key: 'rejected', allowed_roles_json: ['admin', 'manager'], auto_action_type: 'none' }
    ]);

    enterpriseRepo.createWorkflowTicket({
      ticket_number: 'RET-801',
      workflow_id: wfRetId,
      entity_type: 'return_order',
      title: 'طلب استبدال قميص رجالي بسبب المقاس',
      customer_name: 'خالد سعيد',
      customer_phone: '01099887766',
      current_status_key: 'inspecting',
      assigned_role: 'cashier',
      notes: 'العميل يرغب باستبدال القميص بمقاس أكبر XL'
    });

    return enterpriseRepo.getWorkflows();
  } catch (err) {
    console.error('Error seeding default workflows:', err.message);
    return [];
  }
}

function getWorkflows() {
  const workflows = enterpriseRepo.getWorkflows();
  if (!workflows || workflows.length === 0) {
    return seedDefaultWorkflows();
  }
  return workflows;
}

function createWorkflow(data) {
  if (!data.name) {
    throw new Error('اسم سير العمل مطلوب');
  }
  const id = enterpriseRepo.createWorkflow(data);
  return enterpriseRepo.getWorkflows().find(w => w.id === id);
}

function updateWorkflow(id, data) {
  if (!id) throw new Error('معرف سير العمل مطلوب');
  return enterpriseRepo.updateWorkflow(id, data);
}

function deleteWorkflow(id) {
  if (!id) throw new Error('معرف سير العمل مطلوب');
  return enterpriseRepo.deleteWorkflow(id);
}

function addWorkflowStatus(workflowId, statusData) {
  if (!workflowId || !statusData.status_key || !statusData.status_label) {
    throw new Error('معرف سير العمل، ومفتاح وعنوان الحالة مطلوبان');
  }
  return enterpriseRepo.addWorkflowStatus(workflowId, statusData);
}

function updateWorkflowStatus(statusId, statusData) {
  if (!statusId) throw new Error('معرف الحالة مطلوب');
  return enterpriseRepo.updateWorkflowStatus(statusId, statusData);
}

function deleteWorkflowStatus(statusId) {
  if (!statusId) throw new Error('معرف الحالة مطلوب');
  return enterpriseRepo.deleteWorkflowStatus(statusId);
}

function saveWorkflowTransitions(workflowId, transitionsArray) {
  if (!workflowId) throw new Error('معرف سير العمل مطلوب');
  const workflow = enterpriseRepo.getWorkflowById(workflowId);
  if (!workflow) throw new Error('مسار العمل غير موجود');

  const statusKeys = new Set((workflow.statuses || []).map((status) => status.status_key));
  const transitionKeys = new Set();
  for (const transition of transitionsArray || []) {
    if (!statusKeys.has(transition.from_status_key) || !statusKeys.has(transition.to_status_key)) {
      throw new Error('حالة البداية أو الحالة الهدف غير موجودة في هذا المسار');
    }
    if (transition.from_status_key === transition.to_status_key) {
      throw new Error('لا يمكن أن تكون حالة البداية هي نفسها الحالة الهدف');
    }

    const transitionKey = `${transition.from_status_key}\u0000${transition.to_status_key}`;
    if (transitionKeys.has(transitionKey)) {
      throw new Error('لا يمكن تكرار الانتقال نفسه في المسار');
    }
    transitionKeys.add(transitionKey);

    let allowedRoles = transition.allowed_roles_json;
    if (typeof allowedRoles === 'string') {
      try {
        allowedRoles = JSON.parse(allowedRoles);
      } catch {
        throw new Error('قائمة الأدوار المسموح بها غير صالحة');
      }
    }
    if (!Array.isArray(allowedRoles)) {
      throw new Error('يجب تحديد الأدوار المسموح لها كقائمة');
    }
  }

  return enterpriseRepo.saveWorkflowTransitions(workflowId, transitionsArray);
}

function getWorkflowTickets(workflowId, statusKey = null) {
  if (!workflowId) return [];
  return enterpriseRepo.getWorkflowTickets(workflowId, statusKey);
}

function createWorkflowTicket(ticketData) {
  if (!ticketData.workflow_id || !ticketData.title || !ticketData.current_status_key) {
    throw new Error('بيانات التذكرة غير مكتملة (معرف سير العمل، العنوان والحالة الحالية)');
  }
  return enterpriseRepo.createWorkflowTicket(ticketData);
}

function updateTicketStatus(ticketId, workflowId, newStatusKey, currentUserRole = 'admin') {
  if (!ticketId || !workflowId || !newStatusKey) {
    throw new Error('معرف التذكرة ومسار العمل والحالة الجديدة مطلوبة');
  }

  const ticket = enterpriseRepo.getWorkflowTicketById(ticketId, workflowId);
  if (!ticket) {
    throw new Error('التذكرة غير موجودة في مسار العمل المحدد');
  }

  const workflow = enterpriseRepo.getWorkflowById(workflowId);
  if (!workflow) {
    throw new Error('مسار العمل غير موجود');
  }

  const currentStatusExists = workflow.statuses?.some((status) => status.status_key === ticket.current_status_key);
  const targetStatusExists = workflow.statuses?.some((status) => status.status_key === newStatusKey);

  if (!currentStatusExists) {
    throw new Error(`حالة التذكرة الحالية "${ticket.current_status_key}" غير موجودة في المسار الحالي`);
  }

  if (!targetStatusExists) {
    throw new Error(`الحالة الهدف "${newStatusKey}" غير موجودة في هذا المسار`);
  }

  const transition = workflow.transitions?.find((t) => t.from_status_key === ticket.current_status_key && t.to_status_key === newStatusKey);
  if (transition) {
    let allowedRoles;
    try {
      allowedRoles = typeof transition.allowed_roles_json === 'string'
        ? JSON.parse(transition.allowed_roles_json)
        : transition.allowed_roles_json;
    } catch {
      throw new Error('تعذر قراءة أدوار الانتقال؛ لم يتم تغيير حالة التذكرة');
    }

    if (!Array.isArray(allowedRoles)) {
      throw new Error('قائمة الأدوار المسموح بها لهذا الانتقال غير صالحة');
    }

    if (currentUserRole !== 'admin' && allowedRoles.length > 0 && !allowedRoles.includes(currentUserRole)) {
      throw new Error(`دور المستخدم (${currentUserRole}) غير مصرح له بتنفيذ هذا الانتقال (${ticket.current_status_key} ➔ ${newStatusKey})`);
    }
  } else if (workflow.transitions && workflow.transitions.length > 0) {
    throw new Error(`لا توجد صلاحية انتقال من "${ticket.current_status_key}" إلى "${newStatusKey}" في هذا المسار`);
  }

  const updatedTicket = enterpriseRepo.updateTicketStatus(ticketId, workflowId, newStatusKey);
  if (!updatedTicket) {
    throw new Error('تعذر تحديث التذكرة في مسار العمل المحدد');
  }

  if (transition?.auto_action_type === 'send_notification') {
    try {
      NotificationsService.addNotification({
        type: 'workflow_alert',
        title: `🔄 تحديث مرحلة سير العمل: ${ticket.ticket_number}`,
        message: `انتقلت التذكرة "${ticket.title}" إلى حالة ${newStatusKey}`,
        severity: 'info'
      });
    } catch {}
  }

  return updatedTicket;
}

function deleteWorkflowTicket(ticketId) {
  if (!ticketId) throw new Error('معرف التذكرة مطلوب');
  return enterpriseRepo.deleteWorkflowTicket(ticketId);
}

function resetPresetWorkflows() {
  return seedDefaultWorkflows(true);
}

function getAutomationRules() {
  return enterpriseRepo.getAutomationRules();
}

function createAutomationRule(data) {
  if (!data.rule_name || !data.trigger_event || !data.action_type) {
    throw new Error('بيانات قاعدة الأتمتة غير مكتملة');
  }
  return enterpriseRepo.createAutomationRule(data);
}

function setAutomationRuleEnabled(id, isEnabled) {
  return enterpriseRepo.setAutomationRuleEnabled(id, isEnabled);
}

function getRoles() {
  return enterpriseRepo.getRoles();
}

function createRole(roleKey, roleName, description) {
  const cleanKey = String(roleKey || '').trim().toLowerCase();
  const cleanName = String(roleName || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(cleanKey) || cleanKey === 'admin') {
    throw new Error('مفتاح الدور غير صالح أو محجوز');
  }
  if (!cleanName || cleanName.length > 80 || cleanDescription.length > 300) {
    throw new Error('اسم الدور أو وصفه غير صالح');
  }
  return enterpriseRepo.createRole(cleanKey, cleanName, cleanDescription, 0);
}

function setRolePermissions(roleKey, permissions) {
  const role = enterpriseRepo.getRoles().find((item) => item.role_key === roleKey);
  if (!role) throw new Error('الدور المطلوب غير موجود');
  if (role.role_key === 'admin') throw new Error('لا يمكن تعديل صلاحيات مدير النظام الكاملة');
  if (!Array.isArray(permissions) || permissions.length > VALID_PERMISSIONS.size) {
    throw new Error('قائمة الصلاحيات غير صالحة');
  }
  const uniquePermissions = [...new Set(permissions)];
  if (uniquePermissions.some((permission) => !VALID_PERMISSIONS.has(permission))) {
    throw new Error('تحتوي قائمة الصلاحيات على صلاحية غير معروفة');
  }
  return enterpriseRepo.setRolePermissions(roleKey, uniquePermissions);
}

/**
 * Helper to evaluate condition rule against event payload
 */
function matchesCondition(condition, payload) {
  if (!condition || Object.keys(condition).length === 0) return true;
  
  if (condition.threshold != null) {
    const val = payload.amount ?? payload.total_amount ?? payload.stock ?? payload.debt ?? 0;
    const op = condition.operator || '>';
    if (op === '>') return Number(val) > Number(condition.threshold);
    if (op === '>=') return Number(val) >= Number(condition.threshold);
    if (op === '<') return Number(val) < Number(condition.threshold);
    if (op === '<=') return Number(val) <= Number(condition.threshold);
    if (op === '==') return Number(val) === Number(condition.threshold);
  }

  if (condition.field) {
    const val = payload[condition.field];
    const target = condition.value;
    const op = condition.operator || '==';
    if (op === '>') return Number(val) > Number(target);
    if (op === '>=') return Number(val) >= Number(target);
    if (op === '<') return Number(val) < Number(target);
    if (op === '<=') return Number(val) <= Number(target);
    if (op === '==') return String(val) === String(target);
    if (op === '!=') return String(val) !== String(target);
  }

  return true;
}

/**
 * No-Code Automation Event Evaluator Engine
 */
function evaluateEventAutomations(triggerEvent, eventPayload = {}) {
  try {
    const rules = enterpriseRepo.getAutomationRules().filter(r => r.is_enabled === 1 && r.trigger_event === triggerEvent);
    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
      const conditionPayload = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json || '{}') : rule.condition_json;
      if (!matchesCondition(conditionPayload, eventPayload)) {
        continue;
      }

      const actionPayload = typeof rule.action_payload_json === 'string' ? JSON.parse(rule.action_payload_json || '{}') : rule.action_payload_json;
      
      switch (rule.action_type) {
        case 'notify_user':
          NotificationsService.notify({
            userId: actionPayload.user_id || null,
            type: actionPayload.type || 'info',
            title: actionPayload.title || `أتمتة: ${rule.rule_name}`,
            message: actionPayload.message || `تم تشغيل القاعدة التلقائية ${rule.rule_name}`,
            linkPage: actionPayload.linkPage || 'settings'
          });
          break;

        case 'grant_loyalty_points': {
          const points = Number(actionPayload.points || 10);
          NotificationsService.notify({
            userId: null,
            type: 'success',
            title: 'مكافأة نقاط ولاء 🎁',
            message: `تم منح العميل ${eventPayload.customer_name || ''} عدد ${points} نقطة ولاء تلقائياً (${rule.rule_name})`,
            linkPage: 'customers'
          });
          if (eventPayload.customer_id) {
            try {
              const crmService = require('./crm.service');
              crmService.addInteraction({
                customer_id: eventPayload.customer_id,
                type: 'offer',
                subject: `إضافة ${points} نقطة ولاء عبر محرك الأتمتة`,
                notes: `مكافأة تلقائية بموجب القاعدة: ${rule.rule_name}`
              });
            } catch (e) {
              console.warn('[AutomationEngine] addInteraction warning:', e.message);
            }
          }
          break;
        }

        case 'add_customer_note': {
          if (eventPayload.customer_id) {
            try {
              const crmService = require('./crm.service');
              crmService.addInteraction({
                customer_id: eventPayload.customer_id,
                type: 'note',
                subject: actionPayload.title || `ملاحظة أتمتة: ${rule.rule_name}`,
                notes: actionPayload.message || `ملاحظة تم إنشاؤها تلقائياً عند حدوث ${triggerEvent}`
              });
            } catch (e) {
              console.warn('[AutomationEngine] addCustomerNote warning:', e.message);
            }
          }
          NotificationsService.notify({
            userId: null,
            type: 'info',
            title: actionPayload.title || 'ملاحظة عميل جديدة 📝',
            message: actionPayload.message || `تم إضافة ملاحظة تلقائية للعميل بواسطة الأتمتة`,
            linkPage: 'customers'
          });
          break;
        }

        case 'flag_order_urgent': {
          if (eventPayload.order_id) {
            try {
              const ordersService = require('./orders.service');
              ordersService.addOrderComment(eventPayload.order_id, `⚡ أتمتة: تم تمييز الطلب كـ عاجل تلقائياً (${rule.rule_name})`);
            } catch (e) {
              console.warn('[AutomationEngine] flagOrderUrgent warning:', e.message);
            }
          }
          NotificationsService.notify({
            userId: null,
            type: 'warning',
            title: 'طلب عاجل 🚨',
            message: `تم تحديد أولوية الطلب كـ عاجل تلقائياً عبر الأتمتة: ${rule.rule_name}`,
            linkPage: 'orders'
          });
          break;
        }

        default:
          break;
      }
    }
  } catch (err) {
    console.warn('[AutomationEngine] Evaluation warning:', err.message);
  }
}

module.exports = {
  seedEnterpriseDefaults,
  getModules,
  setModuleEnabled,
  getBusinessProfiles,
  getActiveBusinessProfile,
  setActiveBusinessProfile,
  getActiveBusinessConfiguration,
  getAttributeDefinitions,
  createAttributeDefinition,
  getVariantAttributeValues,
  getAllVariantAttributeValues,
  saveVariantAttributeValues,
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  addWorkflowStatus,
  updateWorkflowStatus,
  deleteWorkflowStatus,
  saveWorkflowTransitions,
  getWorkflowTickets,
  createWorkflowTicket,
  updateTicketStatus,
  deleteWorkflowTicket,
  resetPresetWorkflows,
  getAutomationRules,
  createAutomationRule,
  setAutomationRuleEnabled,
  getRoles,
  createRole,
  setRolePermissions,
  evaluateEventAutomations,
  matchesCondition
};
