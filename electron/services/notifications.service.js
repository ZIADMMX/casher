const { BrowserWindow, Notification } = require('electron');
const NotificationsRepository = require('../repositories/notifications.repository');
const { logError } = require('./logger.service');

const NotificationsService = {
  // desktop: also show a Windows notification, for reminders that matter while the app is minimized.
  notify({ userId = null, type, title, message, linkPage = null, desktop = false }) {
    if (!type || !title || !message) {
      console.warn('تنبيه: محاولة إنشاء إشعار بدون بيانات مكتملة');
      return null;
    }

    try {
      const notification = NotificationsRepository.create({
        userId,
        type,
        title,
        message,
        linkPage,
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
        });
        toast.show();
      }

      return notification;
    } catch (err) {
      logError('NotificationsService', err);
      return null;
    }
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
