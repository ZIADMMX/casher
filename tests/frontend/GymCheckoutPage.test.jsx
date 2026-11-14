import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import GymCheckoutPage from '../../src/pages/GymCheckoutPage.jsx';
import { balanceOf } from '../../src/components/gym/GymSubscriptionsPanel.jsx';
import * as subscriptionsApi from '../../src/api/subscriptions.js';
import * as customersApi from '../../src/api/customers.js';

vi.mock('../../src/api/bridge.js', () => ({ isBridgeAvailable: () => true }));
vi.mock('../../src/api/customers.js', () => ({
  getAllCustomersWithStats: Object.assign(vi.fn(), { isAvailable: () => true }),
  addCustomer: vi.fn(),
  getCustomerRecentSales: vi.fn(),
}));
vi.mock('../../src/api/subscriptions.js', () => ({
  getAllPackages: vi.fn(),
  getAllSubscriptions: vi.fn(),
  getSubscriptionStats: vi.fn(),
  subscribeCustomer: vi.fn(),
  renewSubscription: vi.fn(),
  consumeSubscriptionCredit: vi.fn(),
  freezeSubscription: vi.fn(),
  unfreezeSubscription: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
  getGymMemberCheckins: vi.fn(),
}));
vi.mock('../../src/api/products.js', () => ({ getAllProductsWithVariants: Object.assign(vi.fn().mockResolvedValue([]), { isAvailable: () => true }) }));
vi.mock('../../src/api/inventory.js', () => ({ getInventoryBranches: Object.assign(vi.fn().mockResolvedValue([]), { isAvailable: () => true }) }));
vi.mock('../../src/api/shifts.js', () => ({ getCurrentShift: Object.assign(vi.fn().mockResolvedValue({ id: 3, liveTotals: { openingCash: 0, cashSales: 0, cardSales: 0, creditSales: 0, totalSales: 0, salesCount: 0, expectedCash: 0 } }), { isAvailable: () => true }) }));
vi.mock('../../src/api/auth.js', () => ({ getSession: Object.assign(vi.fn().mockResolvedValue({ username: 'ziad' }), { isAvailable: () => true }) }));

const CUSTOMERS = [
  { id: 1, name: 'مروان', phone: '0100' },
  { id: 2, name: 'سمير', phone: '0111' },
  { id: 3, name: 'هاني', phone: '0122' },
];

beforeEach(() => {
  customersApi.getAllCustomersWithStats.mockReset().mockResolvedValue(CUSTOMERS);
  customersApi.addCustomer.mockReset();
  customersApi.getCustomerRecentSales.mockReset().mockResolvedValue([]);
  subscriptionsApi.getGymMemberCheckins.mockReset().mockResolvedValue([]);
  subscriptionsApi.getAllPackages.mockResolvedValue([{ id: 9, name: 'شهري', price: 600, duration_days: 30, is_active: 1 }]);
  subscriptionsApi.getAllSubscriptions.mockResolvedValue([
    { id: 5, customer_id: 1, customer_name: 'مروان', package_name: 'سنوي', package_price: 8400, status: 'expired', end_date: '2026-01-01', package_type: 'time_based' },
    { id: 6, customer_id: 2, customer_name: 'سمير', customer_phone: '0111', package_name: 'جلسات', package_price: 300, status: 'active', end_date: '2027-01-01', package_type: 'session_based', remaining_credits: 4, total_credits: 10 },
    { id: 7, customer_id: 2, customer_name: 'سمير', package_name: 'قديم', package_price: 100, status: 'frozen', end_date: '2027-01-01', package_type: 'time_based' },
  ]);
  subscriptionsApi.getSubscriptionStats.mockResolvedValue({ total_subscriptions: 3, active_count: 1, frozen_count: 1, expired_count: 1, depleted_count: 0 });
  [
    subscriptionsApi.subscribeCustomer, subscriptionsApi.renewSubscription, subscriptionsApi.consumeSubscriptionCredit,
    subscriptionsApi.freezeSubscription, subscriptionsApi.unfreezeSubscription,
    subscriptionsApi.createPackage, subscriptionsApi.updatePackage, subscriptionsApi.deletePackage,
  ].forEach((fn) => fn.mockReset().mockResolvedValue({}));
});

const openCollect = async () => {
  render(<GymCheckoutPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'تفعيل وتحصيل' }));
};

describe('activation + collection tab', () => {
  test('new subscription: pick member and package, then collect', async () => {
    await openCollect();
    fireEvent.click(await screen.findByRole('button', { name: /مروان/ }));
    fireEvent.click(screen.getByRole('button', { name: /شهري/ }));
    await screen.findByText(/الشيفت مفتوح/);
    fireEvent.click(screen.getByRole('button', { name: /✓ تحصيل/ }));
    await waitFor(() => expect(subscriptionsApi.subscribeCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 1, package_id: 9, payments: [{ method: 'cash', amount: 600 }] })
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('تم تفعيل شهري للعضو مروان');
  });

  test('renewal lists only that member subscriptions and renews the chosen one', async () => {
    await openCollect();
    fireEvent.click(await screen.findByRole('button', { name: /تجديد اشتراك/ }));
    fireEvent.click(await screen.findByRole('button', { name: /مروان/ }));
    fireEvent.click(screen.getByRole('button', { name: /سنوي/ }));
    await screen.findByText(/الشيفت مفتوح/);
    fireEvent.click(screen.getByRole('button', { name: /✓ تحصيل/ }));
    await waitFor(() => expect(subscriptionsApi.renewSubscription).toHaveBeenCalledWith(5, { payments: [{ method: 'cash', amount: 8400 }] }));
  });

  test('a member with no subscriptions is told to use a new subscription', async () => {
    await openCollect();
    fireEvent.click(await screen.findByRole('button', { name: /تجديد اشتراك/ }));
    fireEvent.click(await screen.findByRole('button', { name: /هاني/ }));
    expect(screen.getByText(/لا توجد اشتراكات سابقة/)).toBeInTheDocument();
  });

  test('searching filters the members list', async () => {
    await openCollect();
    await screen.findByRole('button', { name: /مروان/ });
    fireEvent.change(screen.getByLabelText('بحث عن عضو'), { target: { value: '0111' } });
    expect(screen.queryByRole('button', { name: /مروان/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /سمير/ })).toBeInTheDocument();
  });
});

describe('members tab (moved from the old subscriptions page)', () => {
  const openSubs = async () => {
    render(<GymCheckoutPage />);
    await screen.findByText('إجمالي الاشتراكات');
  };
  const pickMember = (name) => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

  test('shows the KPIs, one row per member, and the first member detail', async () => {
    await openSubs();
    expect(screen.getByText('عرض 2 من 2')).toBeInTheDocument();
    expect(screen.getByText('إجمالي الاشتراكات').closest('article')).toHaveTextContent('3');
    expect(screen.getByRole('region', { name: 'تفاصيل مروان' })).toBeInTheDocument(); // the first member is selected
    expect(screen.getByRole('button', { name: /سمير/ })).toBeInTheDocument();
  });

  test('a member with several subscriptions can switch between them', async () => {
    await openSubs();
    pickMember('سمير');
    const group = screen.getByRole('group', { name: 'اشتراكات العضو' });
    expect(group).toHaveTextContent('جلسات');
    fireEvent.click(screen.getByRole('button', { name: 'قديم' }));
    expect(screen.getByRole('button', { name: 'فك التجميد' })).toBeInTheDocument();
  });

  test('deducts one session only for an active session-based subscription', async () => {
    await openSubs();
    pickMember('سمير');
    fireEvent.click(screen.getByRole('button', { name: 'خصم جلسة' }));
    await waitFor(() => expect(subscriptionsApi.consumeSubscriptionCredit).toHaveBeenCalledWith(6, 1, null, expect.any(String)));
    pickMember('مروان');
    expect(screen.queryByRole('button', { name: 'خصم جلسة' })).not.toBeInTheDocument();
  });

  test('freezes with a reason chip, and unfreezes a frozen subscription', async () => {
    await openSubs();
    pickMember('سمير');
    fireEvent.click(screen.getByRole('button', { name: 'تجميد' }));
    expect(await screen.findByRole('dialog', { name: 'تجميد اشتراك' })).toHaveTextContent('ينتهي حاليًا');
    fireEvent.click(screen.getByRole('button', { name: 'سفر' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد التجميد' }));
    await waitFor(() => expect(subscriptionsApi.freezeSubscription).toHaveBeenCalledWith(6, 'سفر'));

    fireEvent.click(screen.getByRole('button', { name: 'قديم' }));
    fireEvent.click(await screen.findByRole('button', { name: 'فك التجميد' }));
    await waitFor(() => expect(subscriptionsApi.unfreezeSubscription).toHaveBeenCalledWith(7));
  });

  test('an action failure is shown, not swallowed', async () => {
    subscriptionsApi.consumeSubscriptionCredit.mockRejectedValue(new Error('الرصيد منتهي'));
    await openSubs();
    pickMember('سمير');
    fireEvent.click(screen.getByRole('button', { name: 'خصم جلسة' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('الرصيد منتهي');
  });

  test('renew jumps to collection with the selected subscription', async () => {
    await openSubs();
    pickMember('مروان');
    fireEvent.click(screen.getByRole('button', { name: 'تجديد' })); // مروان / سنوي
    await screen.findByText(/الشيفت مفتوح/);
    fireEvent.click(screen.getByRole('button', { name: /✓ تحصيل/ }));
    await waitFor(() => expect(subscriptionsApi.renewSubscription).toHaveBeenCalledWith(5, { payments: [{ method: 'cash', amount: 8400 }] }));
  });

  test('the search and status filter narrow the member list', async () => {
    await openSubs();
    fireEvent.change(screen.getByLabelText('بحث في الاشتراكات'), { target: { value: '0111' } });
    expect(screen.getByText('عرض 1 من 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث في الاشتراكات'), { target: { value: 'غير موجود' } });
    expect(screen.getByText(/لا توجد نتائج مطابقة للبحث/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث في الاشتراكات'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'منتهي' }));
    expect(screen.getByText('عرض 1 من 2')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'تفاصيل مروان' })).toBeInTheDocument();
  });

  test('shows attendance and recent payments of the selected member', async () => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    subscriptionsApi.getGymMemberCheckins.mockResolvedValue([
      { id: 2, result: 'allowed', created_at: now },
      { id: 1, result: 'denied', created_at: now },
    ]);
    customersApi.getCustomerRecentSales.mockResolvedValue([{ id: 41, total_amount: 300, payment_method: 'credit', created_at: now }]);
    await openSubs();
    expect(await screen.findByText('فاتورة #41')).toBeInTheDocument();
    const stat = screen.getByText('الحضور هذا الشهر').closest('div');
    expect(stat).toHaveTextContent('1'); // the denied scan is not a visit
    expect(screen.getByText('آخر زيارة').closest('div')).toHaveTextContent('اليوم');
    expect(screen.getByRole('table', { name: 'آخر المدفوعات' })).toHaveTextContent('آجل');
  });
});

describe('packages tab (moved from the old subscriptions page)', () => {
  const openPackages = async () => {
    render(<GymCheckoutPage />);
    fireEvent.click(await screen.findByRole('button', { name: /دليل الباقات والأنواع \(1\)/ }));
    await screen.findByRole('heading', { name: 'شهري' });
  };

  test('lists packages with their subscribers count', async () => {
    await openPackages();
    expect(screen.getByText(/مشتركون حاليًا/)).toBeInTheDocument();
  });

  test('deleting asks for confirmation first', async () => {
    await openPackages();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'حذف شهري' }));
    expect(subscriptionsApi.deletePackage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'حذف شهري' }));
    await waitFor(() => expect(subscriptionsApi.deletePackage).toHaveBeenCalledWith(9));
    confirm.mockRestore();
  });

  test('a failed delete is reported', async () => {
    subscriptionsApi.deletePackage.mockRejectedValue(new Error('الباقة عليها اشتراكات'));
    await openPackages();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'حذف شهري' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('الباقة عليها اشتراكات');
    confirm.mockRestore();
  });
});

describe('hub header and quick add', () => {
  test('the header buttons open activation and the package catalog', async () => {
    render(<GymCheckoutPage />);
    fireEvent.click(await screen.findByRole('button', { name: /اشتراك عميل جديد/ }));
    expect(await screen.findByLabelText('بحث عن عضو')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /إضافة باقة جديدة/ }));
    expect(screen.getByRole('button', { name: /دليل الباقات والأنواع/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a new member can be added on the spot and is selected', async () => {
    customersApi.addCustomer.mockResolvedValue({ id: 42 });
    customersApi.getAllCustomersWithStats.mockResolvedValue([...CUSTOMERS, { id: 42, name: 'نور', phone: '0155' }]);
    await openCollect();
    fireEvent.click(await screen.findByRole('button', { name: 'عميل جديد' }));
    fireEvent.change(screen.getByLabelText('اسم العميل الجديد'), { target: { value: 'نور' } });
    fireEvent.change(screen.getByLabelText('هاتف العميل الجديد'), { target: { value: '0155' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ واختيار/ }));
    await waitFor(() => expect(customersApi.addCustomer).toHaveBeenCalledWith({ name: 'نور', phone: '0155' }));
    expect(await screen.findByText('اختر الباقة')).toBeInTheDocument();
  });

  test('a new member needs a name', async () => {
    await openCollect();
    fireEvent.click(await screen.findByRole('button', { name: 'عميل جديد' }));
    fireEvent.click(screen.getByRole('button', { name: /حفظ واختيار/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('اسم العميل مطلوب');
    expect(customersApi.addCustomer).not.toHaveBeenCalled();
  });
});

describe('balanceOf', () => {
  test('session packages show the share of sessions left', () => {
    expect(balanceOf({ package_type: 'session_based', total_credits: 44, remaining_credits: 35 })).toMatchObject({ text: '35 من 44 جلسة', percent: 80 });
    expect(balanceOf({ package_type: 'session_based', total_credits: 0, remaining_credits: 0 }).percent).toBe(0);
  });

  test('time packages show the days left of the period', () => {
    const sub = { package_type: 'time_based', start_date: '2026-01-01T00:00:00Z', end_date: '2026-01-31T00:00:00Z' };
    const bal = balanceOf(sub, new Date('2026-01-16T00:00:00Z').getTime());
    expect(bal.text).toBe('15 يوم متبقي');
    expect(bal.percent).toBe(50);
    expect(balanceOf(sub, new Date('2026-03-01T00:00:00Z').getTime()).percent).toBe(0);
  });
});
