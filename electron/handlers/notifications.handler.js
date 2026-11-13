const NotificationsService = require('../services/notifications.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const { notificationOptionsSchema, positiveIdSchema } = require('../validators/schema');

// Every signed-in user reads their own notifications; the channel map would demand settings.* (cashiers lack it).
const signedIn = { authorize: (event) => authService.requireAuth(event?.sender?.id) };

// [userId, withActivity]: only admins see the per-action activity notes.
function viewer() {
  authService.requireAuth();
  const session = authService.getCurrentSession();
  return [session?.id || null, session?.role === 'admin'];
}

function registerNotificationsHandlers() {
  safeHandle('notifications:getAll', notificationOptionsSchema, (_event, options) => {
    const [userId, withActivity] = viewer();
    return NotificationsService.getAll(options, userId, withActivity);
  }, signedIn);

  safeHandle('notifications:getUnreadCount', () => NotificationsService.getUnreadCount(...viewer()), signedIn);

  safeHandle('notifications:markAsRead', positiveIdSchema, (_event, id) => (
    NotificationsService.markAsRead(id, ...viewer())
  ), signedIn);

  safeHandle('notifications:markAllAsRead', () => NotificationsService.markAllAsRead(...viewer()), signedIn);

  // Keeps the channel permission (settings.manage): requireAdmin lets role-based admins through only with it.
  safeHandle('notifications:clearAll', () => {
    authService.requireAdmin();
    return NotificationsService.clearAll();
  });
}

module.exports = { registerNotificationsHandlers };
