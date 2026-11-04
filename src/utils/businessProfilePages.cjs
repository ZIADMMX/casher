// src/utils/businessProfilePages.cjs

const PAGE_MODULES = {
  pos: 'pos',
  kitchen: 'pos',
  orders: 'orders',
  subscriptions: 'subscriptions',
  commissions: 'commissions',
  returns: 'returns',
  products: 'inventory',
  branches: 'inventory',
  customers: 'crm',
  crm: 'crm',
  suppliers: 'purchases',
  shifts: 'shifts',
  reports: 'reports',
  users: 'users',
  attendance: 'users',
  leaves: 'users',
  roles: 'users',
  salaries: 'users',
  settings: 'settings',
  enterprise: 'enterprise',
  workflows: 'enterprise',
  'screen-designer': 'settings',
  today: 'pos',
  profile: null,
  cases: 'cases',
  courts: 'cases',
  appointments: 'appointments',
};

// سياسة الصفحات الصريحة لكل قطاع (White-list & Black-list Policy)
// يضمن العزل التام بين القطاعات الـ 9 ومنع تسرب الشاشات غير المخصصة لنشاط معين
const SECTOR_PAGE_POLICIES = {
  grocery: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  retail: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  cafe_restaurant: {
    allowedPages: [
      'today', 'pos', 'kitchen', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  electronics: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  maintenance: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  spare_parts: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  subscriptions_gym: {
    allowedPages: [
      'today', 'pos', 'subscriptions', 'appointments', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions',
    ],
    deniedPages: ['cases', 'salon', 'orders', 'returns'],
  },
  salon_barbershop: {
    allowedPages: [
      'today', 'pos', 'subscriptions', 'commissions',
      'products', 'customers', 'crm', 'shifts', 'reports',
      'users', 'attendance', 'leaves', 'roles', 'salaries', 'settings',
      'enterprise', 'screen-designer', 'profile',
    ],
    deniedPages: ['salon', 'cases', 'orders', 'appointments', 'branches', 'suppliers', 'workflows'],
  },
  law_firm: {
    allowedPages: [
      'today', 'cases', 'appointments', 'customers', 'suppliers',
      'courts',
      'shifts', 'reports', 'users', 'attendance', 'leaves', 'roles',
      'salaries', 'settings', 'enterprise', 'workflows', 'screen-designer',
      'profile',
    ],
    deniedPages: ['salon', 'subscriptions', 'returns', 'products', 'branches', 'orders', 'crm', 'pos'],
  },
  custom: {
    allowedPages: [
      'today', 'pos', 'orders', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions', 'subscriptions', 'appointments',
    ],
    deniedPages: ['cases', 'salon'],
  },
  crm: {
    allowedPages: [
      'crm', 'reports', 'users', 'attendance', 'leaves', 'roles', 'salaries',
      'settings', 'enterprise', 'profile',
    ],
    deniedPages: [
      'today', 'pos', 'kitchen', 'orders', 'appointments', 'subscriptions',
      'commissions', 'returns', 'products', 'branches', 'suppliers', 'shifts',
      'workflows', 'screen-designer', 'cases', 'salon',
    ],
  },
};

function normalizeSectorKey(rawKey) {
  if (!rawKey) return 'custom';
  if (rawKey === 'auto_workshop') return 'spare_parts';
  return rawKey;
}

function isBusinessProfilePageEnabled(pageKey, profileKey, isModuleEnabled) {
  const normalizedProfile = normalizeSectorKey(profileKey);
  const policy = SECTOR_PAGE_POLICIES[normalizedProfile] || SECTOR_PAGE_POLICIES.custom;

  // 1. فحص قائمة الحظر الصريح للقطاع
  if (policy.deniedPages && policy.deniedPages.includes(pageKey)) {
    return false;
  }

  // 2. فحص قائمة الصفحات المسموحة للقطاع
  if (policy.allowedPages && !policy.allowedPages.includes(pageKey)) {
    return false;
  }

  if (
    normalizedProfile === 'crm'
    && ['users', 'attendance', 'leaves', 'roles', 'salaries'].includes(pageKey)
  ) {
    return true;
  }

  if (normalizedProfile === 'law_firm' && ['customers', 'today'].includes(pageKey)) {
    return true;
  }

  // 3. فحص تبعية الوحدة (Module Dependency) إذا تم تزويد دالة فحص الوحدات
  const moduleKey = PAGE_MODULES[pageKey];
  if (moduleKey && typeof isModuleEnabled === 'function') {
    return isModuleEnabled(moduleKey);
  }

  return true;
}

module.exports = {
  PAGE_MODULES,
  SECTOR_PAGE_POLICIES,
  normalizeSectorKey,
  isBusinessProfilePageEnabled,
};
