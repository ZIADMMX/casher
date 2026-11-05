import { useState, useEffect, useCallback } from 'react';
import * as customersApi from '../api/customers.js';

function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const data = await customersApi.getAllCustomersWithStats();
    setCustomers(data);
    setLoading(false);
  }, []);

  async function addCustomer(data) {
    setError('');
    try {
      const result = await customersApi.addCustomer(data);
      await fetchCustomers();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function addManualDebt(data) {
    setError('');
    try {
      const result = await customersApi.addManualDebt(data);
      await fetchCustomers();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }

  }

  async function recordPayment(data) {
    setError('');
    try {
      const result = await customersApi.recordCustomerPayment(data);
      await fetchCustomers();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return { customers, addCustomer, addManualDebt, recordPayment, loading, error, refetch: fetchCustomers };
}

export default useCustomers;