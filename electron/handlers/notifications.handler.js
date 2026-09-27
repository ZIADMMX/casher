const NotificationsService = require('../services/notifications.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const { notificationOptionsSchema, positiveIdSchema } = require('../validators/schema');

function registerNotificationsHandlers() {
  safeHandle('notifications:getAll', notificationOptionsSchema, (_event, options) => {
    authService.requireAuth();
    return NotificationsService.getAll(options);
  });

  safeHandle('notifications:getUnreadCount', () => {
    authService.requireAuth();
    return NotificationsService.getUnreadCount();
  });

  safeHandle('notifications:markAsRead', positiveIdSchema, (_event, id) => {
    authService.requireAuth();
    return NotificationsService.markAsRead(id);
  });

  safeHandle('notifications:markAllAsRead', () => {
    authService.requireAuth();
    return NotificationsService.markAllAsRead();
  });

  safeHandle('notifications:clearAll', () => {
    authService.requireAdmin();
    return NotificationsService.clearAll();
  });
}

module.exports = { registerNotificationsHandlers };
