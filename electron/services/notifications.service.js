const { BrowserWindow, Notification } = require('electron');
const NotificationsRepository = require('../repositories/notifications.repository');
const { logError } = require('./logger.service');

const NotificationsService = {
  // desktop: also show a Windows notification, for reminders that matter while the app is minimized.
  // dedupeKey: skip if the same alert was already raised in the last 24h (e.g. low stock on every sale).
  notify({ userId = null, type, title, message, linkPage = null, desktop = false, dedupeKey = null }) {
    if (!type || !title || !message) {
      console.warn('تنبيه: محاولة إنشاء إشعار بدون بيانات مكتملة');
      return null;
    }

    try {
      if (dedupeKey && NotificationsRepository.existsRecent(dedupeKey, userId)) return null;

      const notification = NotificationsRepository.create({
        userId,
        type,
        title,
        message,
        linkPage,
        dedupeKey,
      });

      // إرسال فوري للنافذة الرئيسية المفتوحة (Real-Time IPC Push)
      const windows = BrowserWindow?.getAllWindows ? BrowserWindow.getAllWindows() : [];
      for (const win of windows) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('notification:received', notification);
        }
      }

      if (desktop && Notification?.isSupported?.()) {
        const toast = new Notification({ title, body: message });
        toast.on('click', () => {
          const win = windows.find((item) => item && !item.isDestroyed());
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.focus();
          win.webContents.send('notification:clicked', notification);
        });
        toast.show();
      }

      return notification;
    } catch (err) {
      logError('NotificationsService', err);
      return null;
    }
  },

  // withActivity: admins also see the "activity" notes recorded after every save/edit/delete.
  getAll(options, userId, withActivity = false) {
    return NotificationsRepository.getAll({ ...options, userId, withActivity });
  },

  getUnreadCount(userId, withActivity = false) {
    return NotificationsRepository.getUnreadCount(userId, withActivity);
  },

  markAsRead(id, userId, withActivity = false) {
    return NotificationsRepository.markAsRead(id, userId, withActivity);
  },

  markAllAsRead(userId, withActivity = false) {
    return NotificationsRepository.markAllAsRead(userId, withActivity);
  },

  clearAll() {
    return NotificationsRepository.clearAll();
  },
};

module.exports = NotificationsService;
