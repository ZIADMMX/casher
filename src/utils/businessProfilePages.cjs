// src/utils/businessProfilePages.cjs

const PAGE_MODULES = {
  pos: 'pos',
  kitchen: 'pos',
  subscriptions: 'subscriptions',
  trainers: 'subscriptions',
  'gym-gate': 'subscriptions',
  'gym-checkout': 'subscriptions',
  'gym-attendance': 'subscriptions',
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
  webhooks: 'settings',
  'screen-designer': 'settings',
  today: 'pos',
  profile: null,
  cases: 'cases',
  courts: 'cases',
  appointments: 'appointments',
  salon: 'salon',
};

// سياسة الصفحات الصريحة لكل قطاع (White-list & Black-list Policy)
// يضمن العزل التام بين القطاعات الـ 9 ومنع تسرب الشاشات غير المخصصة لنشاط معين
const SECTOR_PAGE_POLICIES = {
  grocery: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  retail: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  cafe_restaurant: {
    allowedPages: [
      'today', 'pos', 'kitchen', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions', 'commissions'],
  },
  electronics: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  maintenance: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  spare_parts: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions',
    ],
    deniedPages: ['cases', 'salon', 'appointments', 'subscriptions'],
  },
  subscriptions_gym: {
    allowedPages: [
      'today', 'pos', 'gym-checkout', 'trainers', 'gym-gate', 'gym-attendance', 'appointments', 'products',
      'customers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'profile',
    ],
    // Hidden for gyms: technical/B2B/retail pages a gym owner never opens.
    deniedPages: [
      'cases', 'salon', 'returns', 'webhooks', 'enterprise', 'workflows', 'screen-designer',
      'commissions', 'branches', 'suppliers', 'crm',
    ],
  },
  salon_barbershop: {
    allowedPages: [
      'today', 'pos', 'salon', 'subscriptions', 'commissions',
      'products', 'customers', 'crm', 'shifts', 'reports',
      'users', 'attendance', 'leaves', 'roles', 'salaries', 'settings', 'webhooks',
      'enterprise', 'screen-designer', 'profile',
    ],
    deniedPages: ['cases', 'appointments', 'branches', 'suppliers', 'workflows'],
  },
  law_firm: {
    allowedPages: [
      'today', 'cases', 'appointments', 'customers', 'suppliers',
      'courts',
      'shifts', 'reports', 'users', 'attendance', 'leaves', 'roles',
      'salaries', 'settings', 'webhooks', 'enterprise', 'workflows', 'screen-designer',
      'profile',
    ],
    deniedPages: ['salon', 'subscriptions', 'returns', 'products', 'branches', 'crm', 'pos'],
  },
  custom: {
    allowedPages: [
      'today', 'pos', 'returns', 'products', 'branches',
      'customers', 'crm', 'suppliers', 'shifts', 'reports', 'users', 'attendance',
      'leaves', 'roles', 'salaries', 'settings', 'webhooks', 'enterprise', 'workflows',
      'screen-designer', 'profile', 'commissions', 'subscriptions', 'appointments',
    ],
    deniedPages: ['cases', 'salon'],
  },
  crm: {
    allowedPages: [
      'crm', 'reports', 'users', 'attendance', 'leaves', 'roles', 'salaries',
      'settings', 'webhooks', 'enterprise', 'profile',
    ],
    deniedPages: [
      'today', 'pos', 'kitchen', 'appointments', 'subscriptions',
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

  // The gym's own screens are the sector itself, so a stray module toggle must not hide them.
  if (normalizedProfile === 'subscriptions_gym' && ['gym-checkout', 'trainers', 'gym-gate', 'gym-attendance'].includes(pageKey)) {
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
