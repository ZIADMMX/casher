import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError.js';
import * as authApi from '../api/auth.js';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        if (authApi.getSession.isAvailable()) {
          const session = await authApi.getSession();
          if (mounted) {
            if (session) {
              setCurrentUser(session);
              sessionStorage.setItem('kashiear_user', JSON.stringify(session));
            } else {
              setCurrentUser(null);
              sessionStorage.removeItem('kashiear_user');
              if (authApi.isSetupRequired.isAvailable()) {
                setSetupRequired(await authApi.isSetupRequired());
              }
            }
          }
        }
      } catch (err) {
        console.error('فشل استرجاع الجلسة:', err);
        if (mounted) {
          setCurrentUser(null);
          sessionStorage.removeItem('kashiear_user');
        }
      } finally {
        if (mounted) setLoadingSession(false);
      }
    }
    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  // Derived boolean – tells the interval effect whether a session is active.
  // Extracted to a variable so ESLint can statically verify the dependency array.
  const isLoggedIn = !!currentUser;

  useEffect(() => {
    if (!currentUserRef.current || !authApi.refreshSession.isAvailable()) return undefined;

    const refreshInterval = window.setInterval(async () => {
      try {
        const result = await authApi.refreshSession();
        if (result?.user) {
          setCurrentUser(result.user);
          sessionStorage.setItem('kashiear_user', JSON.stringify(result.user));
          return;
        }

        console.warn('تعذر تجديد الجلسة؛ سيستمر العمل بالجلسة الحالية لتجنب مقاطعة البيع.');
      } catch (err) {
        // Do NOT log out cashier on transient network errors, timeouts, or IPC exceptions
        console.warn('تنبيه عابر أثناء تجديد الجلسة (تم التجاهل لمنع مقاطعة الكاشير أثناء البيع):', err);
      }
    }, 25 * 60 * 1000);

    return () => window.clearInterval(refreshInterval);
  }, [isLoggedIn]);

  const login = useCallback(async (username, password) => {
    try {
      const res = await authApi.login({ username, password });
      const user = res?.user || res;
      setCurrentUser(user);
      try {
        sessionStorage.setItem('kashiear_user', JSON.stringify(user));
      } catch {
        // ignore
      }
      return user;
    } catch (error) {
      throw new Error(normalizeErrorMessage(error));
    }
  }, []);

  const createInitialAdmin = useCallback(async (username, password, autoLogin = true, extra = {}) => {
    try {
      const res = await authApi.createInitialAdmin({ username, password, ...extra });
      const user = res?.user || res;
      if (autoLogin) {
        setSetupRequired(false);
        setCurrentUser(user);
        try {
          sessionStorage.setItem('kashiear_user', JSON.stringify(user));
        } catch {
          // ignore
        }
      }
      return { user, recoveryKey: res?.recoveryKey };
    } catch (error) {
      throw new Error(normalizeErrorMessage(error));
    }
  }, []);

  const completeInitialSetup = useCallback((user) => {
    setSetupRequired(false);
    setCurrentUser(user);
    try {
      sessionStorage.setItem('kashiear_user', JSON.stringify(user));
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('kashiear_user');
    } catch {
      // ignore
    }
  }, []);

  const updateProfile = useCallback(async (data) => {
    const res = await authApi.updateProfile(data);
    if (res?.user) {
      setCurrentUser(res.user);
      try {
        sessionStorage.setItem('kashiear_user', JSON.stringify(res.user));
      } catch {
        // ignore
      }
    }
    return res;
  }, []);

  const changePassword = useCallback(async (newPassword) => {
    const res = await authApi.changePassword(newPassword);
    if (res?.user) {
      setCurrentUser(res.user);
      try {
        sessionStorage.setItem('kashiear_user', JSON.stringify(res.user));
      } catch {
        // ignore
      }
    }
    return res;
  }, []);

  const value = useMemo(() => ({
    currentUser,
    setCurrentUser,
    login,
    createInitialAdmin,
    completeInitialSetup,
    logout,
    updateProfile,
    changePassword,
    loadingSession,
    setupRequired,
    setSetupRequired,
  }), [
    currentUser,
    login,
    createInitialAdmin,
    completeInitialSetup,
    logout,
    updateProfile,
    changePassword,
    loadingSession,
    setupRequired,
    setSetupRequired,
  ]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

export default UserContext;
