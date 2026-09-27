import { useState, useEffect, useCallback } from 'react';

function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function addCashier(data) {
    setError('');
    try {
      await window.electronAPI.addCashier(data);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function removeUser(userId) {
    setError('');
    try {
      await window.electronAPI.removeUser(userId);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function toggleActive(userId) {
    setError('');
    try {
      await window.electronAPI.toggleUserActive(userId);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, addCashier, removeUser, toggleActive, loading, error };
}

export default useUsers;