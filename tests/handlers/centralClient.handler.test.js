// Pairing a terminal with a central server is admin-only, checked against the
// session of the window that asked (not a machine-wide default).
const mockHandlers = new Map();

jest.mock('../../electron/handlers/safeHandle', () => ({
  safeHandle: jest.fn((channel, handler) => mockHandlers.set(channel, handler)),
}));
jest.mock('../../electron/services/centralClient.service', () => ({
  getSession: jest.fn(),
  configure: jest.fn(() => ({ enabled: true })),
  setWarehouse: jest.fn(() => ({ ok: true })),
}));
jest.mock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn() }));

const centralClient = require('../../electron/services/centralClient.service');
const authService = require('../../electron/services/auth.service');
const { registerCentralClientHandlers } = require('../../electron/handlers/centralClient.handler');

registerCentralClientHandlers();
const event = { sender: { id: 42 } };

beforeEach(() => {
  jest.clearAllMocks();
  centralClient.getSession.mockResolvedValue(null);
  authService.requireAdmin.mockReturnValue({ id: 1, role: 'admin' });
});

test.each([
  ['central:configure', { baseUrl: 'https://server.local', fingerprint256: 'AA' }, 'configure'],
  ['central:setWarehouse', 3, 'setWarehouse'],
])('%s checks the admin against the calling window', async (channel, arg, method) => {
  await mockHandlers.get(channel)(event, arg);
  expect(authService.requireAdmin).toHaveBeenCalledWith(42);
  expect(centralClient[method]).toHaveBeenCalledWith(arg);
});

test.each(['central:configure', 'central:setWarehouse'])(
  '%s is refused for a non-admin window and changes nothing',
  async (channel) => {
    authService.requireAdmin.mockImplementation(() => { throw new Error('غير مصرح لك بتنفيذ هذا الإجراء'); });
    await expect(mockHandlers.get(channel)(event, 1)).rejects.toThrow('غير مصرح');
    expect(centralClient.configure).not.toHaveBeenCalled();
    expect(centralClient.setWarehouse).not.toHaveBeenCalled();
  }
);

test('a non-admin central session is refused', async () => {
  centralClient.getSession.mockResolvedValue({ role: 'cashier' });
  await expect(mockHandlers.get('central:configure')(event, 'x')).rejects.toThrow('غير مصرح');
  expect(centralClient.configure).not.toHaveBeenCalled();
});
