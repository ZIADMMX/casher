const mockRegisteredHandlers = new Map();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockRegisteredHandlers.set(channel, handler)),
  },
}));

jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 14, role: 'admin' })),
  runWithSession: jest.fn((session, callback) => callback()),
  runWithPermission: jest.fn((permission, callback) => callback()),
  requireAuth: jest.fn(),
}));

jest.mock('../../electron/services/centralClient.service', () => ({
  getSession: jest.fn(),
}));

jest.mock('../../electron/services/enterprise.service', () => ({
  getActiveBusinessConfiguration: jest.fn(),
}));

const authService = require('../../electron/services/auth.service');
const centralClient = require('../../electron/services/centralClient.service');
const enterpriseService = require('../../electron/services/enterprise.service');
const { registerEnterpriseHandlers } = require('../../electron/handlers/enterprise.handler');

describe('enterprise configuration IPC authorization', () => {
  beforeEach(() => {
    mockRegisteredHandlers.clear();
    jest.clearAllMocks();
    registerEnterpriseHandlers();
    centralClient.getSession.mockResolvedValue(null);
    enterpriseService.getActiveBusinessConfiguration.mockReturnValue({ profile: { key: 'retail' } });
  });

  test('allows an authenticated local user to read the active configuration', async () => {
    const event = { sender: { id: 14 } };
    const handler = mockRegisteredHandlers.get('enterprise:getActiveConfiguration');

    await expect(handler(event)).resolves.toEqual({ profile: { key: 'retail' } });
    expect(authService.requireAuth).toHaveBeenCalledWith(14);
    expect(enterpriseService.getActiveBusinessConfiguration).toHaveBeenCalledTimes(1);
  });

  test('allows an authenticated central-server session without a local session', async () => {
    centralClient.getSession.mockResolvedValue({ id: 8, role: 'cashier' });
    authService.getCurrentSession.mockReturnValue(null);
    const handler = mockRegisteredHandlers.get('enterprise:getActiveConfiguration');

    await expect(handler({ sender: { id: 14 } })).resolves.toEqual({ profile: { key: 'retail' } });
    expect(authService.requireAuth).not.toHaveBeenCalled();
  });

  test('does not return configuration to an unauthenticated user', async () => {
    authService.getCurrentSession.mockReturnValue(null);
    authService.requireAuth.mockImplementation(() => {
      throw new Error('يجب تسجيل الدخول أولاً');
    });
    const handler = mockRegisteredHandlers.get('enterprise:getActiveConfiguration');

    await expect(handler({ sender: { id: 14 } })).rejects.toThrow('يجب تسجيل الدخول أولاً');
    expect(enterpriseService.getActiveBusinessConfiguration).not.toHaveBeenCalled();
  });
});
