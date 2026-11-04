jest.mock('electron', () => ({ BrowserWindow: jest.fn() }));

const mockRolePermissions = {
  hr: ['team.view', 'team.manage', 'roles.manage'],
  cashier_plus: ['pos.view', 'pos.sell'],
};
const mockActor = { id: 3, role: 'cashier', system_role_key: 'hr' };

jest.mock('../../electron/repositories/enterprise.repository', () => ({
  getRoles: jest.fn(() => [{ role_key: 'hr' }, { role_key: 'cashier_plus' }]),
  getRolePermissions: jest.fn((key) => mockRolePermissions[key] || []),
  setRolePermissions: jest.fn(),
}));
jest.mock('../../electron/repositories/users.repository', () => ({
  getById: jest.fn(() => mockActor),
}));
jest.mock('../../electron/services/notifications.service', () => ({}));
jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(() => ({ id: 3 })),
}));

const enterpriseRepo = require('../../electron/repositories/enterprise.repository');
const { setRolePermissions } = require('../../electron/services/enterprise.service');
const { buildReceiptHtml } = require('../../electron/services/print.service');
const { getClientIp } = require('../../electron/services/rateLimiter');

describe('Security: delegated role managers cannot escalate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('cannot edit their own role', () => {
    expect(() => setRolePermissions('hr', ['team.view', 'settings.manage'])).toThrow('دورك');
    expect(enterpriseRepo.setRolePermissions).not.toHaveBeenCalled();
  });

  test('cannot grant a permission they do not hold', () => {
    expect(() => setRolePermissions('cashier_plus', ['pos.view', 'settings.manage'])).toThrow('لا تملكها');
    expect(enterpriseRepo.setRolePermissions).not.toHaveBeenCalled();
  });

  test('can grant permissions they hold and keep existing ones', () => {
    setRolePermissions('cashier_plus', ['pos.view', 'pos.sell', 'team.view']);
    expect(enterpriseRepo.setRolePermissions).toHaveBeenCalledWith('cashier_plus', ['pos.view', 'pos.sell', 'team.view']);
  });
});

describe('Security: receipt HTML escapes item fields', () => {
  test('product name, size and color cannot inject markup', () => {
    const html = buildReceiptHtml({
      saleId: 1,
      items: [{
        productName: '<img src=x onerror=alert(1)>',
        size: '<b>XL</b>',
        color: '"><script>x()</script>',
        quantity: 1,
        unitPrice: 10,
      }],
      subtotal: 10, discount: 0, total: 10,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x()');
    expect(html).not.toContain('<b>XL</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('Security: client IP for rate limiting', () => {
  const req = (peer, xff) => ({ socket: { remoteAddress: peer }, headers: xff ? { 'x-forwarded-for': xff } : {} });

  test('ignores X-Forwarded-For by default', () => {
    expect(getClientIp(req('10.0.0.5', '1.2.3.4'))).toBe('10.0.0.5');
  });

  test('ignores X-Forwarded-For from a non-loopback peer even with trustProxy', () => {
    expect(getClientIp(req('10.0.0.5', '1.2.3.4'), { trustProxy: true })).toBe('10.0.0.5');
  });

  test('uses the first forwarded address from the local load balancer', () => {
    expect(getClientIp(req('127.0.0.1', '10.0.0.9, 1.1.1.1'), { trustProxy: true })).toBe('10.0.0.9');
  });
});
