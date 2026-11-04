import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from './UserContext.jsx';

const NotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  toastNotification: null,
  loading: false,
  refreshNotifications: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  clearAll: async () => {},
  dismissToast: () => {},
});

export function NotificationsProvider({ children }) {
  const { currentUser, loadingSession } = useUser();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastNotification, setToastNotification] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshNotifications = useCallback(async () => {
    try {
      if (window.electronAPI?.getNotifications) {
        setLoading(true);
        const list = await window.electronAPI.getNotifications({ limit: 40 });
        const count = await window.electronAPI.getUnreadNotificationsCount();
        setNotifications(list || []);
        setUnreadCount(count || 0);
      }
    } catch (err) {
      console.error('خطأ في جلب الإشعارات:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingSession && currentUser) {
      refreshNotifications();
    }

    // الاستماع للإشعارات اللحظية القادمة من الباك اند
    if (window.electronAPI?.onNotificationReceived) {
      const unsubscribe = window.electronAPI.onNotificationReceived((newNotification) => {
        if (newNotification) {
          if (newNotification.user_id != null
            && String(newNotification.user_id) !== String(currentUser?.id)) return;
          setNotifications((prev) => [newNotification, ...prev.filter((n) => n.id !== newNotification.id)]);
          setUnreadCount((prev) => prev + 1);
          setToastNotification(newNotification);

          // إخفاء الـ Toast تلقائياً بعد 6 ثوانٍ
          setTimeout(() => {
            setToastNotification((current) => (current?.id === newNotification.id ? null : current));
          }, 6000);
        }
      });

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [currentUser, loadingSession, refreshNotifications]);

  const markAsRead = useCallback(async (id) => {
    try {
      if (window.electronAPI?.markNotificationAsRead) {
        await window.electronAPI.markNotificationAsRead(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('خطأ في تحديث حالة الإشعار:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      if (window.electronAPI?.markAllNotificationsAsRead) {
        await window.electronAPI.markAllNotificationsAsRead();
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('خطأ في تحديد كافة الإشعارات كمقروءة:', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      if (window.electronAPI?.clearAllNotifications) {
        await window.electronAPI.clearAllNotifications();
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('خطأ في مسح الإشعارات:', err);
    }
  }, []);

  const dismissToast = useCallback(() => {
    setToastNotification(null);
  }, []);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    toastNotification,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    dismissToast,
  }), [
    notifications,
    unreadCount,
    toastNotification,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    dismissToast,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
