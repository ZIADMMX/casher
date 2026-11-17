const { BrowserWindow, Notification } = require('electron');
const NotificationsRepository = require('../repositories/notifications.repository');
const { logError } = require('./logger.service');

// Electron drops a toast (and its click handler) once it is garbage collected, so live ones are kept here.
const liveToasts = new Set();

// The owner can switch Windows toasts off with the "desktop_notifications" setting (default: on).
function desktopEnabled() {
  try {
    const value = require('../repositories/settings.repository').get('desktop_notifications');
    return String(value ?? '1') !== '0';
  } catch {
    return true;
  }
}

// Why a toast would not appear, in words the owner can act on (null = it should).
function desktopBlocker() {
  if (!Notification?.isSupported?.()) return 'هذا الجهاز لا يدعم إشعارات النظام';
  if (!desktopEnabled()) return 'إشعارات ويندوز متوقفة من إعدادات التطبيق (desktop_notifications)';
  return null;
}

function showDesktopToast(notification, windows) {
  if (desktopBlocker()) return;
  const toast = new Notification({ title: notification.title, body: notification.message, silent: false });
  liveToasts.add(toast);
  const release = () => liveToasts.delete(toast);
  toast.on('click', () => {
    release();
    // Works from the taskbar, from behind other apps and from a hidden window alike.
    const win = windows.find((item) => item && !item.isDestroyed()) || BrowserWindow?.getAllWindows?.().find((item) => !item.isDestroyed());
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    win.webContents.send('notification:clicked', notification);
  });
  toast.on('close', release);
  toast.on('failed', (_event, error) => { release(); logError('NotificationsService.toast', new Error(String(error || 'toast failed'))); });
  toast.show();
}

const NotificationsService = {
  // Every notification goes to the bell, to the open window (in-app toast) and to Windows itself,
  // so it is seen whether the app is in front, behind other windows or minimized.
  // desktop: false opts a single note out of the Windows toast.
  // dedupeKey: skip if the same alert was already raised in the last 24h (e.g. low stock on every sale).
  notify({ userId = null, type, title, message, linkPage = null, desktop = true, dedupeKey = null }) {
    if (!type || !title || !message) {
      console.warn('تنبيه: محاولة إنشاء إشعار بدون بيانات مكتملة');
      return null;
    }

    try {
      if (dedupeKey && NotificationsRepository.existsRecent(dedupeKey, userId)) return null;

      const notification = NotificationsRepository.create({ userId, type, title, message, linkPage, dedupeKey });

      const windows = BrowserWindow?.getAllWindows ? BrowserWindow.getAllWindows() : [];
      for (const win of windows) {
        if (win && !win.isDestroyed()) win.webContents.send('notification:received', notification);
      }

      if (desktop) showDesktopToast(notification, windows);
      return notification;
    } catch (err) {
      logError('NotificationsService', err);
      return null;
    }
  },

  // The bell's "test notification" button: raises a real one and says whether Windows can show it.
  sendTest(userId = null) {
    const blocker = desktopBlocker();
    const notification = NotificationsService.notify({
      userId, type: 'info', title: 'إشعار تجريبي', message: 'لو شفت الرسالة دي في ويندوز، الإشعارات شغالة.',
    });
    return { ok: Boolean(notification), desktop: !blocker, reason: blocker };
  },

  getAll(options, userId) {
    return NotificationsRepository.getAll({ ...options, userId });
  },

  getUnreadCount(userId) {
    return NotificationsRepository.getUnreadCount(userId);
  },

  markAsRead(id, userId) {
    return NotificationsRepository.markAsRead(id, userId);
  },

  markAllAsRead(userId) {
    return NotificationsRepository.markAllAsRead(userId);
  },

  clearAll() {
    return NotificationsRepository.clearAll();
  },
};

module.exports = NotificationsService;
