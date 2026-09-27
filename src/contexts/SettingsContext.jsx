import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUser } from './UserContext.jsx';

const defaultSettings = {
  store_name: 'بوتيك الفخامة',
  store_tagline: 'أحدث صيحات الموضة والأزياء',
  store_phone: '01000000000',
  store_address: 'العنوان الرئيسي - المحل',
  store_logo: '',
  receipt_footer: 'الاستبدال والاسترجاع خلال 14 يوماً من تاريخ الشراء بالفاتورة الأصلية. شكراً لزيارتكم!',
  receipt_paper_size: '80mm',
  show_logo_on_receipt: '1',
  show_barcode_on_receipt: '1',
  show_cashier_name: '1',
  app_branding_mode: 'onyx_with_store',
  primary_color: '#2E5BFF',
  secondary_color: '#1D4ED8',
  theme_preset: 'onyx_blue',
};

function normalizeHex(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : fallback;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function adjustBrightness(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const adjust = (channel) => Math.max(0, Math.min(255, channel + amount));
  return `#${[adjust(r), adjust(g), adjust(b)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

const SettingsContext = createContext({
  settings: defaultSettings,
  loading: true,
  refreshSettings: async () => {},
  saveSettings: async () => {},
  uploadLogo: async () => {},
  backupDatabase: async () => {},
  restoreDatabase: async () => {},
});

export function SettingsProvider({ children }) {
  const { currentUser, loadingSession } = useUser();
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getSettings) {
        const data = await window.electronAPI.getSettings();
        if (data && typeof data === 'object') {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      }
    } catch (err) {
      console.error('خطأ في جلب إعدادات المحل:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadingSession) return;
    if (currentUser) {
      refreshSettings();
    } else {
      setSettings(defaultSettings);
      setLoading(false);
    }
  }, [currentUser, loadingSession, refreshSettings]);

  useEffect(() => {
    const primary = normalizeHex(settings.primary_color, defaultSettings.primary_color);
    const secondary = normalizeHex(settings.secondary_color, defaultSettings.secondary_color);
    const rgb = hexToRgb(primary);
    const hover = adjustBrightness(primary, -12);
    const light = adjustBrightness(primary, 88);
    const root = document.documentElement;

    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--primary-secondary', secondary);
    root.style.setProperty('--primary-hover', hover);
    root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`);
    root.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty('--primary-light', light);
    root.style.setProperty('--primary-shadow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
  }, [settings.primary_color, settings.secondary_color]);

  const saveSettings = async (newSettings) => {
    try {
      if (window.electronAPI?.saveSettings) {
        const updated = await window.electronAPI.saveSettings(newSettings);
        setSettings((prev) => ({ ...prev, ...updated }));
        return { success: true };
      }

      return { success: false, error: 'electronAPI غير متوفر' };
    } catch (err) {
      console.error('خطأ في حفظ الإعدادات:', err);
      return { success: false, error: err.message };
    }
  };

  const uploadLogo = async () => {
    try {
      if (window.electronAPI?.uploadStoreLogo) {
        const res = await window.electronAPI.uploadStoreLogo();
        if (res?.success && res?.dataUrl) {
          setSettings((prev) => ({ ...prev, store_logo: res.dataUrl }));
          return { success: true, dataUrl: res.dataUrl };
        }
        return res;
      }
      return { canceled: true };
    } catch (err) {
      console.error('خطأ في رفع الشعار:', err);
      throw err;
    }
  };

  const backupDatabase = async () => {
    if (window.electronAPI?.backupDatabase) {
      return await window.electronAPI.backupDatabase();
    }
    throw new Error('electronAPI غير متوفر');
  };

  const restoreDatabase = async () => {
    if (window.electronAPI?.restoreDatabase) {
      const res = await window.electronAPI.restoreDatabase();
      if (res?.success) {
        await refreshSettings();
      }
      return res;
    }
    throw new Error('electronAPI غير متوفر');
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        refreshSettings,
        saveSettings,
        uploadLogo,
        backupDatabase,
        restoreDatabase,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
