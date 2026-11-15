import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import GymMembersPage from '../../src/pages/GymMembersPage.jsx';
import CustomersEntry from '../../src/pages/CustomersEntry.jsx';
import { buildMembers, filterMembers, summarize } from '../../src/utils/gymMembers.js';
import * as customersApi from '../../src/api/customers.js';
import * as subscriptionsApi from '../../src/api/subscriptions.js';

vi.mock('../../src/api/bridge.js', () => ({ isBridgeAvailable: () => true }));
vi.mock('../../src/api/customers.js', () => ({
  getAllCustomersWithStats: vi.fn(),
  addCustomer: vi.fn(),
  recordCustomerPayment: vi.fn(),
}));
vi.mock('../../src/api/importExport.js', () => ({ exportCustomers: vi.fn(), selectImportFile: vi.fn() }));
vi.mock('../../src/api/subscriptions.js', () => ({
  getAllSubscriptions: vi.fn(),
  getGymVisitSummary: vi.fn(),
  getGymMemberProfiles: vi.fn(),
  getGymTrainers: vi.fn(),
  saveGymMemberProfile: vi.fn(),
}));
vi.mock('../../src/pages/CustomersPage.jsx', () => ({ default: () => <div>الصفحة القديمة للعملاء</div> }));

const DAY = 86400000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();
const month = new Date();
const thisMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-02 10:00:00`;

const CUSTOMERS = [
  { id: 1, name: 'مروان', phone: '01000000001', debt: 0, created_at: '2020-01-01 00:00:00' },
  { id: 2, name: 'سمير', phone: '01000000002', debt: 0, created_at: '2020-01-01 00:00:00' },
  { id: 3, name: 'هاني', phone: '01000000003', debt: 0, created_at: '2020-01-01 00:00:00' },
  { id: 4, name: 'خالد', phone: '01000000004', debt: 0, created_at: '2020-01-01 00:00:00' },
  { id: 5, name: 'يوسف', phone: '', debt: 450, created_at: thisMonth },
];
const SUBS = [
  { id: 11, customer_id: 1, status: 'active', end_date: at(40), package_name: 'سنوي', package_type: 'time_based' },
  { id: 12, customer_id: 2, status: 'active', end_date: at(3), package_name: 'شهري', package_type: 'time_based' },
  { id: 13, customer_id: 3, status: 'frozen', end_date: at(30), package_name: 'ربع سنوي', package_type: 'time_based' },
  { id: 14, customer_id: 4, status: 'expired', end_date: at(-10), package_name: 'شهري', package_type: 'time_based' },
  { id: 15, customer_id: 4, status: 'cancelled', end_date: at(-50), package_name: 'قديم', package_type: 'time_based' },
];

const setup = (props = {}) => {
  const onNavigate = vi.fn();
  render(<GymMembersPage onNavigate={onNavigate} {...props} />);
  return { onNavigate };
};
const rowOf = async (name) => (await screen.findByText(name, { selector: 'button.gmp-name' })).closest('[role="row"]');

beforeEach(() => {
  customersApi.getAllCustomersWithStats.mockReset().mockResolvedValue(CUSTOMERS);
  customersApi.addCustomer.mockReset().mockResolvedValue({ id: 77 });
  customersApi.recordCustomerPayment.mockReset().mockResolvedValue({});
  subscriptionsApi.getAllSubscriptions.mockReset().mockResolvedValue(SUBS);
  subscriptionsApi.getGymVisitSummary.mockReset().mockResolvedValue([{ customer_id: 1, last_visit: '2026-11-10 18:00:00', visits_month: 9 }]);
  subscriptionsApi.getGymMemberProfiles.mockReset().mockResolvedValue([{ customer_id: 1, trainer_id: 4, trainer_name: 'كابتن حسام' }]);
  subscriptionsApi.getGymTrainers.mockReset().mockResolvedValue([{ id: 4, name: 'كابتن حسام', is_active: 1 }]);
  subscriptionsApi.saveGymMemberProfile.mockReset().mockResolvedValue({});
});

describe('members directory helpers', () => {
  const members = buildMembers({
    customers: CUSTOMERS,
    subscriptions: SUBS,
    visits: [{ customer_id: 1, last_visit: '2026-11-10 18:00:00', visits_month: 9 }],
    profiles: [{ customer_id: 1, trainer_name: 'كابتن حسام' }],
  });

  it('derives status, expiry warning, visits, trainer and debt per member', () => {
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    expect(byId[1]).toMatchObject({ status: 'active', code: 'GM-1', visitsMonth: 9, trainer: 'كابتن حسام', expiring: false });
    expect(byId[2]).toMatchObject({ status: 'active', expiring: true, daysLeft: 3 });
    expect(byId[3].status).toBe('frozen');
    expect(byId[4]).toMatchObject({ status: 'expired', packageName: 'شهري' }); // the cancelled one is ignored
    expect(byId[5]).toMatchObject({ status: 'none', debt: 450, isNew: true });
  });

  it('treats a stored "active" subscription past its end date as expired and prefers active, then frozen', () => {
    const [m] = buildMembers({
      customers: [{ id: 9, name: 'س' }],
      subscriptions: [
        { id: 1, customer_id: 9, status: 'active', end_date: at(-2) },
        { id: 2, customer_id: 9, status: 'frozen', end_date: at(10) },
      ],
    });
    expect(m.status).toBe('frozen');
    const [late] = buildMembers({ customers: [{ id: 9, name: 'س' }], subscriptions: [{ id: 1, customer_id: 9, status: 'active', end_date: at(-2) }] });
    expect(late.status).toBe('expired');
  });

  it('summarises and filters', () => {
    expect(summarize(members)).toEqual({ total: 5, active: 2, expiring: 1, frozen: 1, none: 1, fresh: 1 });
    expect(filterMembers(members, 'expiring', '').map((m) => m.id)).toEqual([2]);
    expect(filterMembers(members, 'all', 'gm-4').map((m) => m.id)).toEqual([4]);
    expect(filterMembers(members, 'none', '').map((m) => m.id)).toEqual([5]);
  });
});

describe('GymMembersPage', () => {
  it('shows the members title and none of the CRM / purchase wording', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'الأعضاء' })).toBeInTheDocument();
    expect(screen.getByText('تسجيل ومتابعة أعضاء النادي واشتراكاتهم')).toBeInTheDocument();
    ['CRM', 'Pipeline', 'Timeline', 'Regular', 'متوسط مشتريات', 'عدد فواتير', 'إجمالي المشتريات', 'آخر تواصل', 'حملات'].forEach((text) => {
      expect(screen.queryByText(new RegExp(text))).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('lists the member columns and one row per member', async () => {
    setup();
    await rowOf('مروان');
    const table = screen.getByRole('table', { name: 'جدول الأعضاء' });
    ['الاسم', 'الكود', 'الهاتف', 'الباقة', 'الحالة', 'ينتهي في', 'آخر زيارة', 'زيارات الشهر', 'المدرب', 'مستحق', 'الإجراءات'].forEach((name) => {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    });
    const row = await rowOf('مروان');
    expect(within(row).getByText('GM-1')).toBeInTheDocument();
    expect(within(row).getByText('سنوي')).toBeInTheDocument();
    expect(within(row).getByText('نشط')).toBeInTheDocument();
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(within(row).getByText('كابتن حسام')).toBeInTheDocument();
    expect(within(row).getByText(/يوم متبقي/)).toBeInTheDocument();
    // 5 members + the header row
    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('warns on members expiring in under 7 days', async () => {
    setup();
    const row = await rowOf('سمير');
    expect(within(row).getByText('3 يوم متبقي').closest('.gmp-end')).toHaveClass('is-warn');
    expect(within(await rowOf('مروان')).getByText(/يوم متبقي/).closest('.gmp-end')).not.toHaveClass('is-warn');
  });

  it('shows the KPI cards', async () => {
    setup();
    await rowOf('مروان');
    const kpis = screen.getByRole('region', { name: 'مؤشرات الأعضاء' });
    const value = (label) => within(within(kpis).getByText(label).closest('article')).getByText(/^\d+$/).textContent;
    expect(value('إجمالي الأعضاء')).toBe('5');
    expect(value('نشطون')).toBe('2');
    expect(value('ينتهي هذا الأسبوع')).toBe('1');
    expect(value('مجمدون')).toBe('1');
    expect(value('بدون اشتراك')).toBe('1');
    expect(value('أعضاء جدد')).toBe('1');
  });

  it('filters by status, by expiring this week and by search (name, phone, code)', async () => {
    setup();
    await rowOf('مروان');
    const filters = screen.getByRole('group', { name: 'تصفية الأعضاء' });

    fireEvent.click(within(filters).getByRole('button', { name: /مجمد/ }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(await rowOf('هاني')).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('button', { name: /ينتهي هذا الأسبوع/ }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(await rowOf('سمير')).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('button', { name: /بدون اشتراك/ }));
    expect(await rowOf('يوسف')).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole('button', { name: /الكل/ }));
    const search = screen.getByRole('searchbox', { name: 'بحث عن عضو' });
    fireEvent.change(search, { target: { value: '01000000004' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.change(search, { target: { value: 'GM-2' } });
    expect(await rowOf('سمير')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'لا أحد' } });
    expect(screen.getByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
  });

  it('opens the subscriptions hub to renew, to open the file and to subscribe', async () => {
    const { onNavigate } = setup();
    fireEvent.click(within(await rowOf('مروان')).getByRole('button', { name: 'تجديد اشتراك مروان' }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'renew', customerId: 1, subscriptionId: 11 } });

    fireEvent.click(within(await rowOf('مروان')).getByRole('button', { name: 'فتح ملف مروان' }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'open', customerId: 1 } });

    const none = await rowOf('يوسف');
    expect(within(none).queryByRole('button', { name: /تجديد/ })).not.toBeInTheDocument();
    expect(within(none).queryByRole('button', { name: /فتح ملف/ })).not.toBeInTheDocument();
    fireEvent.click(within(none).getByRole('button', { name: 'اشتراك جديد لـ يوسف' }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'activate', customerId: 5 } });
  });

  it('has a call / WhatsApp / copy popover for each member', async () => {
    setup();
    fireEvent.click(within(await rowOf('مروان')).getByRole('button', { name: 'المزيد لـ مروان' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /اتصال/ })).toHaveAttribute('href', 'tel:01000000001');
    expect(within(menu).getByRole('menuitem', { name: /واتساب/ })).toBeEnabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    // A member without a phone cannot be called.
    fireEvent.click(within(await rowOf('يوسف')).getByRole('button', { name: 'المزيد لـ يوسف' }));
    expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /واتساب/ })).toBeDisabled();
  });

  it('the row WhatsApp icon opens wa.me on the member number (and is hidden with no phone)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    setup();
    fireEvent.click(within(await rowOf('مروان')).getByRole('button', { name: 'واتساب مروان' }));
    expect(open).toHaveBeenCalledWith('https://wa.me/201000000001', '_blank');
    expect(within(await rowOf('يوسف')).queryByRole('button', { name: 'واتساب يوسف' })).not.toBeInTheDocument();
    open.mockRestore();
  });

  it('records a payment from the balance column', async () => {
    setup();
    const row = await rowOf('يوسف');
    expect(within(row).getByText('450 ج.م')).toBeInTheDocument();
    expect(within(await rowOf('مروان')).queryByRole('button', { name: /سداد/ })).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'سداد مستحق يوسف' }));
    const dialog = await screen.findByRole('dialog', { name: 'تسجيل سداد' });
    fireEvent.change(within(dialog).getByLabelText('مبلغ السداد (ج.م)'), { target: { value: '200' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ السداد/ }));
    await waitFor(() => expect(customersApi.recordCustomerPayment).toHaveBeenCalledWith({ customerId: 5, amount: 200, paymentMethod: 'cash', notes: '' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('adds a member with emergency contact, health notes and trainer, then offers "subscribe now"', async () => {
    const { onNavigate } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /إضافة عضو جديد/ }));
    const dialog = await screen.findByRole('dialog', { name: 'إضافة عضو جديد' });

    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ العضو/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('اسم العضو مطلوب');
    expect(customersApi.addCustomer).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/الاسم/), { target: { value: ' ليلى ' } });
    fireEvent.change(within(dialog).getByLabelText('الهاتف'), { target: { value: '01011112222' } });
    fireEvent.change(within(dialog).getByLabelText('جهة اتصال الطوارئ'), { target: { value: 'منى (الأم)' } });
    fireEvent.change(within(dialog).getByLabelText('ملاحظات صحية'), { target: { value: 'إصابة في الركبة' } });
    await within(dialog).findByRole('option', { name: 'كابتن حسام' });
    fireEvent.change(within(dialog).getByLabelText('المدرب'), { target: { value: '4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ العضو/ }));

    await waitFor(() => expect(customersApi.addCustomer).toHaveBeenCalledWith({ name: 'ليلى', phone: '01011112222', email: null }));
    expect(subscriptionsApi.saveGymMemberProfile).toHaveBeenCalledWith(77, { emergency_name: 'منى (الأم)', emergency_phone: '', health_notes: 'إصابة في الركبة', trainer_id: 4 });
    expect(await screen.findByText('GM-77')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /اشتراك الآن/ }));
    expect(onNavigate).toHaveBeenCalledWith('gym-checkout', { gymIntent: { action: 'activate', customerId: 77 } });
  });

  it('skips the profile call when only the customer fields are filled, and says so when the profile fails', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /إضافة عضو جديد/ }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/الاسم/), { target: { value: 'نور' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ العضو/ }));
    await screen.findByText('GM-77');
    expect(subscriptionsApi.saveGymMemberProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'تم' }));
    fireEvent.click(await screen.findByRole('button', { name: /إضافة عضو جديد/ }));
    dialog = await screen.findByRole('dialog');
    subscriptionsApi.saveGymMemberProfile.mockRejectedValueOnce(new Error('رقم هاتف الطوارئ غير صحيح'));
    fireEvent.change(within(dialog).getByLabelText(/الاسم/), { target: { value: 'رنا' } });
    fireEvent.change(within(dialog).getByLabelText('هاتف الطوارئ'), { target: { value: 'abc' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ العضو/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تم تسجيل العضو لكن تعذر حفظ بياناته الإضافية: رقم هاتف الطوارئ غير صحيح');
  });

  it('keeps the directory when the visit summary fails', async () => {
    subscriptionsApi.getGymVisitSummary.mockRejectedValue(new Error('boom'));
    setup();
    const row = await rowOf('مروان');
    expect(within(row).getByText('GM-1')).toBeInTheDocument();
  });

  it('uses no blue in its own styles', async () => {
    const css = (await import('../../src/styles/gymMembersPage.css?raw')).default;
    expect(css).not.toMatch(/#(?:[0-9a-f]{0,2})?(?:1d4ed8|2563eb|3b82f6|1e40af)\b/i);
  });
});

describe('customers route isolation', () => {
  const entry = (profileKey) => render(<CustomersEntry profileKey={profileKey} onNavigate={vi.fn()} onNavigateWithOptions={vi.fn()} />);

  it('gives only the gym the members directory', async () => {
    entry('subscriptions_gym');
    expect(await screen.findByRole('heading', { name: 'الأعضاء' })).toBeInTheDocument();
    expect(screen.queryByText('الصفحة القديمة للعملاء')).not.toBeInTheDocument();
  });

  it('a gate memberIntent opens that member\'s profile directly', async () => {
    render(<CustomersEntry profileKey="subscriptions_gym" memberIntent={{ customerId: 1 }} onNavigate={vi.fn()} onNavigateWithOptions={vi.fn()} />);
    expect(await screen.findByLabelText('ملف العضو مروان')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'الأعضاء' })).not.toBeInTheDocument();
  });

  it.each(['retail', 'grocery', 'cafe_restaurant', 'electronics', 'maintenance', 'spare_parts', 'salon_barbershop', 'law_firm', 'custom', 'crm', undefined])(
    'keeps the shared customers page for %s',
    (profileKey) => {
      entry(profileKey);
      expect(screen.getByText('الصفحة القديمة للعملاء')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'الأعضاء' })).not.toBeInTheDocument();
    },
  );
});
