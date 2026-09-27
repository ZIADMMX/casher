const { BrowserWindow } = require('electron');
const NotificationsRepository = require('../repositories/notifications.repository');
const { logError } = require('./logger.service');

const NotificationsService = {
  notify({ userId = null, type, title, message, linkPage = null }) {
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
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('notification:received', notification);
        }
      }

      return notification;
    } catch (err) {
      logError('NotificationsService', err);
      return null;
    }
  },

  getAll(options) {
    return NotificationsRepository.getAll(options);
  },

  getUnreadCount() {
    return NotificationsRepository.getUnreadCount();
  },

  markAsRead(id) {
    return NotificationsRepository.markAsRead(id);
  },

  markAllAsRead() {
    return NotificationsRepository.markAllAsRead();
  },

  clearAll() {
    return NotificationsRepository.clearAll();
  },
};

module.exports = NotificationsService;
