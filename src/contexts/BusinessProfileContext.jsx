import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const BusinessProfileContext = createContext(null);

export function BusinessProfileProvider({ children }) {
  const [configuration, setConfiguration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshConfiguration = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.getActiveBusinessConfiguration) {
      setConfiguration(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.getActiveBusinessConfiguration();
      setConfiguration(result);
      return result;
    } catch (err) {
      setError(err.message || 'تعذر تحميل إعدادات النشاط التجاري');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConfiguration().catch((err) => {
      console.error('فشل تحميل إعدادات النشاط:', err);
    });
  }, [refreshConfiguration]);

  const moduleState = useMemo(
    () => new Map((configuration?.modules || []).map((module) => [module.key, Boolean(module.is_enabled)])),
    [configuration]
  );

  const value = useMemo(() => ({
    configuration,
    loading,
    error,
    refreshConfiguration,
    isModuleEnabled: (key) => moduleState.has(key) ? moduleState.get(key) : true,
    getTerm: (key, fallback) =>
      configuration?.settings?.terms?.[key] ||
      configuration?.settings?.[`term_${key}`] ||
      fallback,
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
