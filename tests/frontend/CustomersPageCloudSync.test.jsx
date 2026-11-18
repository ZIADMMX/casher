import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  syncCustomersToCloud: vi.fn(),
  pullCustomersFromCloud: vi.fn(),
  getAllCustomersWithStats: vi.fn(async () => []),
  refetch: vi.fn(async () => {}),
}));

vi.mock('../../src/api/customers.js', () => ({
  syncCustomersToCloud: (...a) => api.syncCustomersToCloud(...a),
  pullCustomersFromCloud: (...a) => api.pullCustomersFromCloud(...a),
  getAllCustomersWithStats: (...a) => api.getAllCustomersWithStats(...a),
  addCustomer: vi.fn(),
  addManualDebt: vi.fn(),
  recordCustomerPayment: vi.fn(),
  getCustomerLedger: vi.fn(),
  getCustomerRecentSales: vi.fn(),
}));
vi.mock('../../src/api/crm.js', () => new Proxy({}, { get: () => vi.fn(async () => []) }));
vi.mock('../../src/api/importExport.js', () => ({ exportCustomers: vi.fn(), importCustomers: vi.fn() }));
vi.mock('../../src/hooks/useCustomers.js', () => ({
  default: () => ({
    customers: [], addCustomer: vi.fn(), addManualDebt: vi.fn(), recordPayment: vi.fn(),
    loading: false, error: '', refetch: api.refetch,
  }),
}));
vi.mock('../../src/contexts/UserContext.jsx', () => ({ useUser: () => ({ currentUser: { role: 'admin' } }) }));
vi.mock('../../src/contexts/SettingsContext.jsx', () => ({ useSettings: () => ({ settings: {} }) }));
vi.mock('../../src/contexts/BusinessProfileContext.jsx', () => ({
  useBusinessProfile: () => ({ getTerm: (_k, fallback) => fallback || 'عميل', configuration: { profile: { key: 'retail' } } }),
}));

const CustomersPage = (await import('../../src/pages/CustomersPage.jsx')).default;

describe('cloud backup buttons on the customers screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    api.getAllCustomersWithStats.mockResolvedValue([]);
  });

  test('the upload button sends the customers and reports what happened', async () => {
    api.syncCustomersToCloud.mockResolvedValue({ success: true, count: 2, message: 'تم رفع 2 عميل' });
    render(<CustomersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /رفع للسحابة/ }));

    await waitFor(() => expect(api.syncCustomersToCloud).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('تم رفع 2 عميل')).toBeTruthy();
    expect(api.refetch).toHaveBeenCalled();
  });

  test('a failed upload says so instead of claiming success', async () => {
    api.syncCustomersToCloud.mockResolvedValue({ success: false, error: 'لا يوجد اتصال' });
    render(<CustomersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /رفع للسحابة/ }));

    expect(await screen.findByText('لا يوجد اتصال')).toBeTruthy();
    expect(api.refetch).not.toHaveBeenCalled();
  });

  // A restore overwrites what is already on this machine, so it must ask first.
  test('restoring asks before it overwrites, and does nothing when refused', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CustomersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /استرجاع من السحابة/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(api.pullCustomersFromCloud).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    api.pullCustomersFromCloud.mockResolvedValue({ success: true, message: 'تم استرجاع 3 عملاء' });
    fireEvent.click(screen.getByRole('button', { name: /استرجاع من السحابة/ }));

    await waitFor(() => expect(api.pullCustomersFromCloud).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('تم استرجاع 3 عملاء')).toBeTruthy();
    confirmSpy.mockRestore();
  });
});
