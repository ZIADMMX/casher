const {
  getPermissionForChannel,
  getPermissionForApi,
  VALID_PERMISSIONS,
} = require('../../electron/security/permissions');

describe('permission routing', () => {
  test('maps team actions and employee-specific imports to the required permissions', () => {
    expect(getPermissionForChannel('users:getAll')).toBe('team.view');
    expect(getPermissionForChannel('users:add')).toBe('team.manage');
    expect(getPermissionForChannel('import:excel', [{ type: 'employees' }])).toBe('team.import');
    expect(getPermissionForChannel('import:excel', [{ type: 'products' }])).toBe('products.create');
    expect(getPermissionForChannel('export:employees')).toBe('team.export');
  });

  test('maps role and sensitive operations to explicit permissions', () => {
    expect(getPermissionForChannel('enterprise:setRolePermissions')).toBe('roles.manage');
    expect(getPermissionForChannel('products:delete')).toBe('products.delete');
    expect(getPermissionForChannel('returns:process')).toBe('pos.refund');
    expect(VALID_PERMISSIONS.has('roles.manage')).toBe(true);
  });

  test('maps API requests and rejects unknown routes by default', () => {
    expect(getPermissionForApi('/api/products/add', 'POST')).toBe('products.create');
    expect(getPermissionForApi('/api/inventory/stock', 'GET')).toBe('inventory.view');
    expect(getPermissionForApi('/api/inventory/transfers', 'POST')).toBe('inventory.transfer');
    expect(getPermissionForApi('/api/inventory/adjust', 'POST')).toBe('inventory.adjust');
    expect(getPermissionForApi('/api/inventory/count', 'POST')).toBe('inventory.adjust');
    expect(getPermissionForApi('/api/inventory/reorder-level', 'POST')).toBe('inventory.manage');
    expect(getPermissionForApi('/api/inventory/branches/3', 'PUT')).toBe('inventory.manage');
    expect(getPermissionForApi('/api/users', 'GET')).toBe('team.view');
    expect(getPermissionForApi('/api/auth/session', 'GET')).toBeNull();
    expect(getPermissionForApi('/api/unknown/private', 'GET')).toBeNull();
  });
});
