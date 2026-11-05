import { hasPermission } from '../../src/utils/accessControl.js';

describe('hasPermission', () => {
  test('admin role and wildcard permission allow everything', () => {
    expect(hasPermission({ role: 'admin', permissions: [] }, 'users.delete')).toBe(true);
    expect(hasPermission({ role: 'cashier', permissions: ['*'] }, 'users.delete')).toBe(true);
  });

  test('an exact permission is allowed and a missing one is denied', () => {
    const cashier = { role: 'cashier', permissions: ['pos.sell'] };
    expect(hasPermission(cashier, 'pos.sell')).toBe(true);
    expect(hasPermission(cashier, 'pos.discount')).toBe(false);
  });

  test('any permission in an area implies viewing that area', () => {
    const user = { role: 'cashier', permissions: ['products.edit'] };
    expect(hasPermission(user, 'products.view')).toBe(true);
    expect(hasPermission(user, 'reports.view')).toBe(false);
  });

  test('a view permission in one area does not leak into an area with a longer name', () => {
    const user = { role: 'cashier', permissions: ['products_admin.edit'] };
    expect(hasPermission(user, 'products.view')).toBe(false);
  });

  test('a view permission does not grant other actions', () => {
    const user = { role: 'cashier', permissions: ['products.view'] };
    expect(hasPermission(user, 'products.edit')).toBe(false);
  });

  test('no user or no permissions denies safely', () => {
    expect(hasPermission(null, 'pos.sell')).toBe(false);
    expect(hasPermission({ role: 'cashier' }, 'pos.sell')).toBe(false);
    expect(hasPermission({ role: 'cashier', permissions: [] }, undefined)).toBe(false);
  });
});
