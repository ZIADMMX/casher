import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError.js';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('kashiear_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
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
        if (window.electronAPI?.getSession) {
          const session = await window.electronAPI.getSession();
          if (mounted && session) {
            setCurrentUser(session);
            sessionStorage.setItem('kashiear_user', JSON.stringify(session));
          } else if (mounted && window.electronAPI?.isSetupRequired) {
            setSetupRequired(await window.electronAPI.isSetupRequired());
          }
        }
      } catch (err) {
        console.error('فشل استرجاع الجلسة:', err);
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
    if (!currentUserRef.current || !window.electronAPI?.refreshSession) return undefined;

    const refreshInterval = window.setInterval(async () => {
      try {
        const result = await window.electronAPI.refreshSession();
        if (!result?.user) {
          setCurrentUser(null);
          sessionStorage.removeItem('kashiear_user');
          return;
        }
        setCurrentUser(result.user);
        sessionStorage.setItem('kashiear_user', JSON.stringify(result.user));
      } catch (err) {
        console.error('فشل تجديد الجلسة:', err);
        setCurrentUser(null);
        sessionStorage.removeItem('kashiear_user');
      }
    }, 25 * 60 * 1000);

    return () => window.clearInterval(refreshInterval);
  }, [isLoggedIn]);

  async function login(username, password) {
    try {
      const res = await window.electronAPI.login({ username, password });
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
  }

  async function createInitialAdmin(username, password, autoLogin = true) {
    try {
      const res = await window.electronAPI.createInitialAdmin({ username, password });
      const user = res?.user || res;
      setSetupRequired(false);
      if (autoLogin) {
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
  }

  function completeInitialSetup(user) {
    setCurrentUser(user);
    try {
      sessionStorage.setItem('kashiear_user', JSON.stringify(user));
    } catch {
      // ignore
    }
  }

  async function logout() {
    await window.electronAPI.logout();
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('kashiear_user');
    } catch {
      // ignore
    }
  }

  async function updateProfile(data) {
    const res = await window.electronAPI.updateProfile(data);
    if (res?.user) {
      setCurrentUser(res.user);
      try {
        sessionStorage.setItem('kashiear_user', JSON.stringify(res.user));
      } catch {
        // ignore
      }
    }
    return res;
  }

  async function changePassword(newPassword) {
    const res = await window.electronAPI.changePassword(newPassword);
    if (res?.user) {
      setCurrentUser(res.user);
      try {
        sessionStorage.setItem('kashiear_user', JSON.stringify(res.user));
      } catch {
        // ignore
      }
    }
    return res;
  }

  return (
    <UserContext.Provider value={{
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
    }}>
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
