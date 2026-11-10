const mockRegisteredHandlers = new Map();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockRegisteredHandlers.set(channel, handler)),
  },
}));

jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(),
  runWithSession: jest.fn((session, callback) => callback()),
  runWithPermission: jest.fn((permission, callback) => callback()),
  requirePermission: jest.fn(),
}));

const authService = require('../../electron/services/auth.service');
const { safeHandle } = require('../../electron/handlers/safeHandle');

describe('safeHandle IPC session context', () => {
  beforeEach(() => {
    mockRegisteredHandlers.clear();
    jest.clearAllMocks();
    authService.getCurrentSession.mockReturnValue({ id: 7, role: 'admin' });
    authService.runWithSession.mockImplementation((session, callback) => callback());
    authService.runWithPermission.mockImplementation((permission, callback) => callback());
  });

  test('runs a protected handler with the session belonging to its Electron window', async () => {
    const session = { id: 7, role: 'admin' };
    const event = { sender: { id: 42 } };
    const payload = { name: 'test' };
    const handler = jest.fn(() => 'created');
    authService.getCurrentSession.mockReturnValue(session);

    safeHandle('products:addWithVariant', handler);

    await expect(mockRegisteredHandlers.get('products:addWithVariant')(event, payload))
      .resolves.toBe('created');
    expect(authService.getCurrentSession).toHaveBeenCalledWith(42);
    expect(authService.runWithSession).toHaveBeenCalledWith(session, expect.any(Function));
    expect(authService.requirePermission).toHaveBeenCalledWith('products.create');
    expect(handler).toHaveBeenCalledWith(event, payload);
  });

  test('rejects a protected handler when its window has no authenticated session', async () => {
    const handler = jest.fn();
    authService.getCurrentSession.mockReturnValue(null);
    authService.requirePermission.mockImplementation(() => {
      throw new Error('يجب تسجيل الدخول أولاً');
    });

    safeHandle('sales:create', handler);

    await expect(mockRegisteredHandlers.get('sales:create')({ sender: { id: 42 } }, {}))
      .rejects.toThrow('يجب تسجيل الدخول أولاً');
    expect(authService.runWithSession).toHaveBeenCalledWith(null, expect.any(Function));
    expect(handler).not.toHaveBeenCalled();
  });

  test('lets a busy cashier ring up more than the 5-per-40s write limit', async () => {
    const handler = jest.fn(() => 'sold');
    authService.requirePermission.mockImplementation(() => {});
    safeHandle('sales:create', handler);

    for (let sale = 0; sale < 8; sale += 1) {
      await expect(mockRegisteredHandlers.get('sales:create')({ sender: { id: 42 } }, {}))
        .resolves.toBe('sold');
    }
  });

  test.each(['auth:login', 'central:request'])(
    'keeps %s outside the local session wrapper',
    async (channel) => {
      const handler = jest.fn(() => 'handled');
      safeHandle(channel, handler);

      await expect(mockRegisteredHandlers.get(channel)({ sender: { id: 42 } }))
        .resolves.toBe('handled');
      // getCurrentSession may be read to key the login rate limit; what matters is
      // that these channels never run inside the local session/permission wrapper.
      expect(authService.runWithSession).not.toHaveBeenCalled();
      expect(authService.requirePermission).not.toHaveBeenCalled();
    }
  );
});