const {
  PAGE_MODULES,
  isBusinessProfilePageEnabled,
  SECTOR_PAGE_POLICIES,
  normalizeSectorKey,
} = require('../../src/utils/businessProfilePages.cjs');

describe('Sector Page Isolation Policies', () => {
  const allSectors = [
    'grocery',
    'retail',
    'cafe_restaurant',
    'electronics',
    'maintenance',
    'spare_parts',
    'subscriptions_gym',
    'salon_barbershop',
    'law_firm',
    'crm',
  ];

  test('every sector has defined allowedPages and deniedPages in SECTOR_PAGE_POLICIES', () => {
    allSectors.forEach((sector) => {
      const policy = SECTOR_PAGE_POLICIES[sector];
      expect(policy).toBeDefined();
      expect(Array.isArray(policy.allowedPages)).toBe(true);
      expect(Array.isArray(policy.deniedPages)).toBe(true);
      expect(policy.allowedPages.length).toBeGreaterThan(0);
    });
  });

  test('normalizes auto_workshop alias to spare_parts', () => {
    expect(normalizeSectorKey('auto_workshop')).toBe('spare_parts');
    expect(normalizeSectorKey('spare_parts')).toBe('spare_parts');
    expect(normalizeSectorKey(null)).toBe('custom');
  });

  test('CRM is separate from the law firm sector and follows the CRM module toggle elsewhere', () => {
    expect(PAGE_MODULES.crm).toBe('crm');
    [...allSectors.filter((sector) => !['crm', 'law_firm'].includes(sector)), 'custom'].forEach((sector) => {
      expect(isBusinessProfilePageEnabled('crm', sector, () => true)).toBe(true);
    });
    expect(isBusinessProfilePageEnabled('crm', 'law_firm', () => true)).toBe(false);
    expect(isBusinessProfilePageEnabled('crm', 'retail', () => false)).toBe(false);
    expect(isBusinessProfilePageEnabled('customers', 'law_firm', () => false)).toBe(true);
  });

  test('CRM sector exposes CRM tools without exposing point of sale or unrelated sector pages', () => {
    expect(isBusinessProfilePageEnabled('crm', 'crm', () => true)).toBe(true);
    expect(isBusinessProfilePageEnabled('customers', 'crm', () => true)).toBe(false);
    expect(isBusinessProfilePageEnabled('reports', 'crm', () => true)).toBe(true);
    expect(isBusinessProfilePageEnabled('users', 'crm', () => true)).toBe(true);
    ['users', 'attendance', 'leaves', 'roles', 'salaries'].forEach((page) => {
      expect(isBusinessProfilePageEnabled(page, 'crm', () => true)).toBe(true);
      expect(isBusinessProfilePageEnabled(page, 'crm', () => false)).toBe(true);
    });
    expect(isBusinessProfilePageEnabled('pos', 'crm', () => true)).toBe(false);
    expect(isBusinessProfilePageEnabled('products', 'crm', () => true)).toBe(false);
    expect(isBusinessProfilePageEnabled('appointments', 'crm', () => true)).toBe(false);
  });

  describe('Strict Denials per Sector', () => {
    test('Grocery does NOT have cases, salon, appointments, subscriptions, commissions', () => {
      expect(isBusinessProfilePageEnabled('cases', 'grocery')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'grocery')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'grocery')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'grocery')).toBe(false);
      expect(isBusinessProfilePageEnabled('commissions', 'grocery')).toBe(false);
      // Allowed core
      expect(isBusinessProfilePageEnabled('pos', 'grocery')).toBe(true);
      expect(isBusinessProfilePageEnabled('products', 'grocery')).toBe(true);
    });

    test('Retail does NOT have cases, salon, appointments, subscriptions, commissions', () => {
      expect(isBusinessProfilePageEnabled('cases', 'retail')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'retail')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'retail')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'retail')).toBe(false);
      // Allowed core
      expect(isBusinessProfilePageEnabled('pos', 'retail')).toBe(true);
      expect(isBusinessProfilePageEnabled('returns', 'retail')).toBe(true);
    });

    test('Cafe/Restaurant does NOT have cases, salon, appointments, subscriptions', () => {
      expect(isBusinessProfilePageEnabled('cases', 'cafe_restaurant')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'cafe_restaurant')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'cafe_restaurant')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'cafe_restaurant')).toBe(false);
    });

    test('Electronics does NOT have cases, salon, appointments, subscriptions', () => {
      expect(isBusinessProfilePageEnabled('cases', 'electronics')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'electronics')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'electronics')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'electronics')).toBe(false);
    });

    test('Maintenance does NOT have cases, salon, appointments, subscriptions', () => {
      expect(isBusinessProfilePageEnabled('cases', 'maintenance')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'maintenance')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'maintenance')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'maintenance')).toBe(false);
      // Allowed commissions for technicians
      expect(isBusinessProfilePageEnabled('commissions', 'maintenance')).toBe(true);
    });

    test('Spare parts (and auto_workshop) does NOT have cases, salon, appointments, subscriptions', () => {
      ['spare_parts', 'auto_workshop'].forEach((profile) => {
        expect(isBusinessProfilePageEnabled('cases', profile)).toBe(false);
        expect(isBusinessProfilePageEnabled('salon', profile)).toBe(false);
        expect(isBusinessProfilePageEnabled('appointments', profile)).toBe(false);
        expect(isBusinessProfilePageEnabled('subscriptions', profile)).toBe(false);
        expect(isBusinessProfilePageEnabled('pos', profile)).toBe(true);
        expect(isBusinessProfilePageEnabled('products', profile)).toBe(true);
      });
    });

    test('Subscriptions Gym has subscriptions and appointments, but NOT cases, salon, orders, returns', () => {
      expect(isBusinessProfilePageEnabled('subscriptions', 'subscriptions_gym')).toBe(true);
      expect(isBusinessProfilePageEnabled('appointments', 'subscriptions_gym')).toBe(true);
      expect(isBusinessProfilePageEnabled('cases', 'subscriptions_gym')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'subscriptions_gym')).toBe(false);
      expect(isBusinessProfilePageEnabled('orders', 'subscriptions_gym')).toBe(false);
      expect(isBusinessProfilePageEnabled('returns', 'subscriptions_gym')).toBe(false);
    });

    test('Salon Barbershop has its salon page, hides unrelated appointments, branches, suppliers, and workflows', () => {
      expect(isBusinessProfilePageEnabled('salon', 'salon_barbershop')).toBe(true);
      expect(isBusinessProfilePageEnabled('salon', 'salon_barbershop', (key) => key !== 'salon')).toBe(false);
      expect(isBusinessProfilePageEnabled('appointments', 'salon_barbershop')).toBe(false);
      expect(isBusinessProfilePageEnabled('branches', 'salon_barbershop')).toBe(false);
      expect(isBusinessProfilePageEnabled('suppliers', 'salon_barbershop')).toBe(false);
      expect(isBusinessProfilePageEnabled('workflows', 'salon_barbershop')).toBe(false);
      expect(isBusinessProfilePageEnabled('products', 'salon_barbershop')).toBe(true);
      expect(isBusinessProfilePageEnabled('subscriptions', 'salon_barbershop')).toBe(true);
      expect(isBusinessProfilePageEnabled('commissions', 'salon_barbershop')).toBe(true);
      expect(isBusinessProfilePageEnabled('cases', 'salon_barbershop')).toBe(false);
      expect(isBusinessProfilePageEnabled('orders', 'salon_barbershop')).toBe(false);
    });

    test('Law firm has legal pages but NOT POS or retail, CRM, and salon pages', () => {
      expect(isBusinessProfilePageEnabled('cases', 'law_firm')).toBe(true);
      expect(isBusinessProfilePageEnabled('appointments', 'law_firm')).toBe(true);
      expect(isBusinessProfilePageEnabled('today', 'law_firm')).toBe(true);
      expect(isBusinessProfilePageEnabled('today', 'law_firm', () => false)).toBe(true);
      expect(isBusinessProfilePageEnabled('pos', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('crm', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('subscriptions', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('returns', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('products', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('branches', 'law_firm')).toBe(false);
      expect(isBusinessProfilePageEnabled('orders', 'law_firm')).toBe(false);
    });

    test('Custom profile does not leak vertical-exclusive modules (cases, salon)', () => {
      expect(isBusinessProfilePageEnabled('cases', 'custom')).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'custom')).toBe(false);
      expect(isBusinessProfilePageEnabled('pos', 'custom')).toBe(true);
    });
  });

  describe('Module toggle integration (isModuleEnabled function)', () => {
    test('disables page when isModuleEnabled returns false', () => {
      const mockIsModuleEnabled = (moduleKey) => moduleKey !== 'purchases';
      expect(isBusinessProfilePageEnabled('suppliers', 'grocery', mockIsModuleEnabled)).toBe(false);
      expect(isBusinessProfilePageEnabled('pos', 'grocery', mockIsModuleEnabled)).toBe(true);
    });

    test('denied page remains disabled even if isModuleEnabled returns true', () => {
      const mockAlwaysTrue = () => true;
      expect(isBusinessProfilePageEnabled('cases', 'grocery', mockAlwaysTrue)).toBe(false);
      expect(isBusinessProfilePageEnabled('salon', 'retail', mockAlwaysTrue)).toBe(false);
      expect(isBusinessProfilePageEnabled('products', 'law_firm', mockAlwaysTrue)).toBe(false);
    });
  });
});
