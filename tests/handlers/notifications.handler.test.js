const mockRegisteredHandlers = new Map();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, handler) => mockRegisteredHandlers.set(channel, handler)),
  },
}));

jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 5, role: 'cashier' })),
  runWithSession: jest.fn((session, callback) => callback()),
  runWithPermission: jest.fn((permission, callback) => callback()),
  // A cashier has no settings.* permission.
  requirePermission: jest.fn(() => { throw new Error('غير مصرح لك بتنفيذ هذا الإجراء'); }),
  requireAuth: jest.fn(),
  requireAdmin: jest.fn(() => { throw new Error('للأدمن فقط'); }),
}));

jest.mock('../../electron/services/notifications.service', () => ({
  getAll: jest.fn(() => [{ id: 1 }]),
  getUnreadCount: jest.fn(() => 3),
  markAsRead: jest.fn(() => ({ id: 1, is_read: 1 })),
  markAllAsRead: jest.fn(() => ({ affected: 2 })),
  clearAll: jest.fn(),
}));

const NotificationsService = require('../../electron/services/notifications.service');
const { registerNotificationsHandlers } = require('../../electron/handlers/notifications.handler');

describe('notifications IPC for a cashier', () => {
  beforeAll(() => registerNotificationsHandlers());
  const call = (channel, ...args) => mockRegisteredHandlers.get(channel)({ sender: { id: 9 } }, ...args);

  test('reads and marks own notifications without settings permissions', async () => {
    await expect(call('notifications:getAll', { limit: 40 })).resolves.toEqual([{ id: 1 }]);
    await expect(call('notifications:getUnreadCount')).resolves.toBe(3);
    await expect(call('notifications:markAsRead', 1)).resolves.toEqual({ id: 1, is_read: 1 });
    await expect(call('notifications:markAllAsRead')).resolves.toEqual({ affected: 2 });
    // A cashier does not get the admin-only activity notes.
    expect(NotificationsService.getAll).toHaveBeenCalledWith({ limit: 40 }, 5);
  });

  test('still cannot clear everyone\'s notifications', async () => {
    await expect(call('notifications:clearAll')).rejects.toThrow();
    expect(NotificationsService.clearAll).not.toHaveBeenCalled();
  });
});
