const enterpriseRepo = require('../repositories/enterprise.repository');
const NotificationsService = require('./notifications.service');

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
  { key: 'users', name: 'المستخدمون', description: 'إدارة حسابات المستخدمين والأدوار', display_order: 14, is_enabled: 1 }
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
      enabled_modules: ['pos', 'inventory', 'orders', 'subscriptions', 'commissions', 'crm', 'purchases', 'reports', 'settings', 'enterprise']
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
  }
];
const ALWAYS_ENABLED_PROFILE_MODULES = ['pos', 'settings', 'enterprise'];
const PROFILE_BASELINE_MODULES = [
  ...ALWAYS_ENABLED_PROFILE_MODULES,
  'customers',
  'returns',
  'shifts',
  'users',
];
const PRESET_ATTRIBUTE_KEYS = new Set([
  'size', 'color', 'brand', 'material', 'model', 'serial_number',
  'warranty_months', 'device_type', 'imei_serial', 'fault_description',
  'warranty_status', 'membership_number', 'access_level', 'personal_trainer',
  'weight_kg', 'expiry_date', 'batch_number', 'car_make', 'car_model',
  'year', 'oem_number',
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
    permissions: ['pos.view', 'pos.sell', 'orders.manage', 'subscriptions.manage', 'crm.manage', 'inventory.view', 'reports.view']
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
  try {
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
      ['oem_number', 'رقم القطعة الأصلي', 'text'],
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

  } catch (err) {
    console.error('Failed to seed enterprise defaults:', err.message);
  }
}

// System Boot Initialization
seedEnterpriseDefaults();

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

function getWorkflows() {
  return enterpriseRepo.getWorkflows();
}

function addWorkflowStatus(workflowId, statusData) {
  if (!statusData.status_key || !statusData.status_label) {
    throw new Error('مفتاح وعنوان الحالة مطلوبان');
  }
  return enterpriseRepo.addWorkflowStatus(workflowId, statusData);
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
  if (!roleKey || !roleName) {
    throw new Error('مفتاح واسم الدور مطلوبان');
  }
  return enterpriseRepo.createRole(roleKey, roleName, description, 0);
}

function setRolePermissions(roleKey, permissions) {
  return enterpriseRepo.setRolePermissions(roleKey, permissions);
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
  addWorkflowStatus,
  getAutomationRules,
  createAutomationRule,
  setAutomationRuleEnabled,
  getRoles,
  createRole,
  setRolePermissions,
  evaluateEventAutomations,
  matchesCondition
};
