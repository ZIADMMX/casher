import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError.js';
import * as usersApi from '../api/users.js';

function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.getAllUsers();
      setUsers(data);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر تحميل المستخدمين'));
    } finally {
      setLoading(false);
    }
  }, []);

  const addCashier = useCallback(async (data) => {
    setError('');
    try {
      await usersApi.addCashier(data);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر إضافة المستخدم'));
      return false;
    }
  }, [fetchUsers]);

  const removeUser = useCallback(async (userId) => {
    setError('');
    try {
      await usersApi.removeUser(userId);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر حذف المستخدم'));
      return false;
    }
  }, [fetchUsers]);

  const toggleActive = useCallback(async (userId) => {
    setError('');
    try {
      await usersApi.toggleUserActive(userId);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر تحديث حالة المستخدم'));
      return false;
    }
  }, [fetchUsers]);

  const resetPassword = useCallback(async (data) => {
    setError('');
    try {
      await usersApi.resetUserPassword(data);
      await fetchUsers();
      return true;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر إعادة تعيين كلمة المرور'));
      return false;
    }
  }, [fetchUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return useMemo(() => ({
    users,
    addCashier,
    removeUser,
    toggleActive,
    resetPassword,
    fetchUsers,
    loading,
    error,
  }), [users, addCashier, removeUser, toggleActive, resetPassword, fetchUsers, loading, error]);
}

export default useUsers;