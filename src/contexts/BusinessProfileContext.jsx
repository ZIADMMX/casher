import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from './UserContext.jsx';
import * as enterpriseApi from '../api/enterprise.js';

const BusinessProfileContext = createContext(null);

export function BusinessProfileProvider({ children }) {
  const { currentUser, loadingSession } = useUser();
  const userId = currentUser?.id;
  const hasCurrentUser = Boolean(currentUser);
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const requestSequence = useRef(0);

  const refreshConfiguration = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!enterpriseApi.getActiveBusinessConfiguration.isAvailable()) {
      if (requestId === requestSequence.current) {
        setConfiguration(null);
        setLoading(false);
      }
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const result = await enterpriseApi.getActiveBusinessConfiguration();
      if (requestId === requestSequence.current) {
        setConfiguration(result);
        setRetryAttempt(0);
      }
      return result;
    } catch (err) {
      if (requestId === requestSequence.current) {
        setError(err.message || 'تعذر تحميل إعدادات النشاط التجاري');
        setRetryAttempt((attempt) => attempt + 1);
      }
      throw err;
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (loadingSession) return;
    if (!hasCurrentUser) {
      requestSequence.current += 1;
      setConfiguration(null);
      setError('');
      setRetryAttempt(0);
      setLoading(false);
      return;
    }

    refreshConfiguration().catch((err) => {
      console.error('فشل تحميل إعدادات النشاط:', err);
    });
  }, [hasCurrentUser, userId, loadingSession, refreshConfiguration]);

  useEffect(() => {
    if (!hasCurrentUser || !error) return undefined;

    const delay = Math.min(30_000, 2_000 * (2 ** Math.min(retryAttempt - 1, 4)));
    const retryTimer = window.setTimeout(() => {
      refreshConfiguration().catch((retryError) => {
        console.warn('تعذر تحديث إعدادات النشاط، ستتم إعادة المحاولة:', retryError);
      });
    }, delay);

    return () => window.clearTimeout(retryTimer);
  }, [error, hasCurrentUser, refreshConfiguration, retryAttempt]);

  const moduleState = useMemo(
    () => new Map((configuration?.modules || []).map((module) => [module.key, Boolean(module.is_enabled)])),
    [configuration]
  );

  const value = useMemo(() => ({
    configuration,
    loading,
    error,
    refreshConfiguration,
    isModuleEnabled: (key) => {
      if (moduleState.has(key)) return moduleState.get(key);
      // إذا لم تكن الوحدات قد حُملت بعد (لا يوجد مصفوفة modules)، اسمح بالوحدات الأساسية فقط
      const coreModules = ['pos', 'settings', 'enterprise'];
      if (!configuration?.modules || configuration.modules.length === 0) {
        return coreModules.includes(key);
      }
      // إذا كانت الوحدات محملة لكن الوحدة غير موجودة في القائمة، فالافتراضي هو التعطيل لمنع التسرب
      return false;
    },
    getTerm: (key, fallback) =>
      configuration?.settings?.terms?.[key] ||
      configuration?.settings?.[`term_${key}`] ||
      fallback,
    units: Array.isArray(configuration?.settings?.default_units)
      ? configuration.settings.default_units
      : [],
    attributes: configuration?.attributes || [],
  }), [configuration, error, loading, moduleState, refreshConfiguration]);

  return (
    <BusinessProfileContext.Provider value={value}>
      {children}
    </BusinessProfileContext.Provider>
  );
}

export function useBusinessProfile() {
  const context = useContext(BusinessProfileContext);
  if (!context) {
    throw new Error('useBusinessProfile must be used within BusinessProfileProvider');
  }
  return context;
}
