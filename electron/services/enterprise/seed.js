// Startup seed: installs the built-in modules, profiles, roles and workflows.
const enterpriseRepo = require('../../repositories/enterprise.repository');
const { DEFAULT_MODULES, DEFAULT_PROFILES, PROFILE_BASELINE_MODULES, DEFAULT_ROLES } = require('./defaults');
const { setActiveBusinessProfile } = require('./profiles');
const { seedDefaultWorkflows } = require('./workflows');

function seedEnterpriseDefaults() {
  if (!enterpriseRepo.hasSystemModulesTable()) return false;

  try {
    // تنظيف أي صفات أو أدوار اختبارية مترسبة من بيئة الفحص
    try {
      enterpriseRepo.purgeTestFixtures();
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
      setActiveBusinessProfile('retail');
    }
    const usersModule = enterpriseRepo.getModules().find((module) => module.key === 'users');
    if (usersModule && !usersModule.is_enabled) {
      enterpriseRepo.setModuleEnabled('users', true);
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

module.exports = {
  seedEnterpriseDefaults,
};
