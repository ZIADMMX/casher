import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import GymMembersPage from '../../src/pages/GymMembersPage.jsx';
import { analyzeVisits } from '../../src/utils/gymAttendance.js';
import QRCode from 'qrcode';
import * as customersApi from '../../src/api/customers.js';
import * as subscriptionsApi from '../../src/api/subscriptions.js';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));
vi.mock('../../src/api/bridge.js', () => ({ isBridgeAvailable: () => true }));
vi.mock('../../src/api/customers.js', () => ({
  getAllCustomersWithStats: vi.fn(),
  addCustomer: vi.fn(),
  recordCustomerPayment: vi.fn(),
  getCustomerLedger: vi.fn(),
  getCustomerRecentSales: vi.fn(),
}));
vi.mock('../../src/api/importExport.js', () => ({ exportCustomers: vi.fn(), selectImportFile: vi.fn() }));
vi.mock('../../src/api/subscriptions.js', () => ({
  getAllSubscriptions: vi.fn(),
  getGymVisitSummary: vi.fn(),
  getGymMemberProfiles: vi.fn(),
  getGymMemberProfile: vi.fn(),
  getGymMemberCode: vi.fn(),
  getGymMemberCheckins: vi.fn(),
  getGymTrainers: vi.fn(),
  saveGymMemberProfile: vi.fn(),
}));

const DAY = 86400000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();
// Local noon on a given weekday offset, written the way SQLite stores it (UTC).
const stamp = (daysAgo, hour) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const CUSTOMERS = [
  { id: 1, name: 'مروان', phone: '01000000001', email: 'm@x.com', debt: 300, totalSpent: 1800, created_at: '2025-01-05 00:00:00' },
  { id: 2, name: 'سمير', phone: '', debt: 0, totalSpent: 0, created_at: '2025-01-05 00:00:00' },
];
const SUBS = [
  { id: 11, customer_id: 1, status: 'active', start_date: at(-20), end_date: at(40), package_name: 'سنوي', package_price: 1500, package_type: 'time_based' },
  { id: 10, customer_id: 1, status: 'expired', start_date: at(-400), end_date: at(-100), package_name: 'شهري', package_price: 300, package_type: 'time_based' },
  { id: 9, customer_id: 1, status: 'cancelled', start_date: at(-500), end_date: at(-450), package_name: 'تجريبي', package_price: 0, package_type: 'time_based' },
];
const VISITS = [
  { id: 3, result: 'allowed', reason: 'ok', gate: 'بوابة 1', created_at: stamp(1, 18) },
  { id: 2, result: 'denied', reason: 'منتهي', gate: 'بوابة 1', created_at: stamp(2, 9) },
  { id: 1, result: 'allowed', reason: 'ok', gate: 'بوابة 2', created_at: stamp(8, 18) },
];

const openProfile = async (name = 'مروان') => {
  const onNavigate = vi.fn();
  render(<GymMembersPage onNavigate={onNavigate} />);
  fireEvent.click(await screen.findByRole('button', { name: `فتح بروفايل ${name}` }));
  return { onNavigate, profile: await screen.findByLabelText(`ملف العضو ${name}`) };
};

beforeEach(() => {
  QRCode.toDataURL.mockClear();
  subscriptionsApi.getGymMemberCode.mockReset().mockImplementation(async (id) => ({ customer_id: id, code: `GM-${id}`, qr: `GM-${id}-${String(id).repeat(12).slice(0, 12)}` }));
  customersApi.getAllCustomersWithStats.mockReset().mockResolvedValue(CUSTOMERS);
  customersApi.recordCustomerPayment.mockReset().mockResolvedValue({});
  customersApi.getCustomerLedger.mockReset().mockResolvedValue({
    payments: [{ id: 5, amount: 200, payment_method: 'cash', notes: 'دفعة', payment_date: '2026-01-02 10:00:00' }],
  });
  customersApi.getCustomerRecentSales.mockReset().mockResolvedValue([
    { id: 41, total_amount: 1500, payment_method: 'card', created_at: '2026-01-01 10:00:00' },
    { id: 42, total_amount: 300, payment_method: 'credit', created_at: '2026-01-03 10:00:00' },
  ]);
  subscriptionsApi.getAllSubscriptions.mockReset().mockResolvedValue(SUBS);
  subscriptionsApi.getGymVisitSummary.mockReset().mockResolvedValue([]);
  subscriptionsApi.getGymMemberProfiles.mockReset().mockResolvedValue([]);
  subscriptionsApi.getGymMemberProfile.mockReset().mockResolvedValue({ emergency_name: 'والد مروان', emergency_phone: '0100999', health_notes: 'ركبة حساسة', trainer_name: 'كابتن حسام' });
  subscriptionsApi.getGymMemberCheckins.mockReset().mockResolvedValue(VISITS);
  subscriptionsApi.getGymTrainers.mockReset().mockResolvedValue([]);
});

describe('member QR', () => {
  it('encodes each member own secret card code and still shows GM-<id>', async () => {
    const { profile } = await openProfile('مروان');
    await within(profile).findByAltText('QR GM-1');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('GM-1-111111111111', expect.anything());
    expect(within(profile).getAllByText('GM-1').length).toBeGreaterThan(0);
  });

  it('gives another member a different QR payload', async () => {
    const { profile } = await openProfile('سمير');
    await within(profile).findByAltText('QR GM-2');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('GM-2-222222222222', expect.anything());
    expect(QRCode.toDataURL).not.toHaveBeenCalledWith('GM-1-111111111111', expect.anything());
  });

  it('falls back to the plain GM-<id> when the secret code cannot be loaded', async () => {
    subscriptionsApi.getGymMemberCode.mockRejectedValue(new Error('x'));
    const { profile } = await openProfile('مروان');
    await within(profile).findByAltText('QR GM-1');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('GM-1', expect.anything());
  });
});

describe('analyzeVisits', () => {
  it('counts weekdays and hours, ignores denied scans and finds the peak', () => {
    const s = analyzeVisits(VISITS);
    expect(s.total).toBe(2);
    expect(s.byHour[new Date(`${VISITS[0].created_at.replace(' ', 'T')}Z`).getHours()]).toBe(2);
    expect(s.topHour).toBe(new Date(`${VISITS[0].created_at.replace(' ', 'T')}Z`).getHours());
    expect(s.byWeekday.reduce((a, b) => a + b, 0)).toBe(2);
    expect(analyzeVisits([])).toMatchObject({ total: 0, topHour: -1, topWeekday: -1, perWeek: 0, lastVisit: null });
  });
});

describe('member profile', () => {
  it('opens from the member name and shows data, QR, balance, subscription, attendance and the full history', async () => {
    const { profile } = await openProfile();
    const p = within(profile);

    expect(p.getByRole('heading', { name: 'مروان' })).toBeInTheDocument();
    expect(p.getAllByText('GM-1').length).toBeGreaterThan(0);
    expect(await p.findByAltText('QR GM-1')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(p.getByText('m@x.com')).toBeInTheDocument();
    expect(await p.findByText('والد مروان')).toBeInTheDocument();
    expect(p.getByText('ركبة حساسة')).toBeInTheDocument();
    expect(p.getByText('كابتن حسام')).toBeInTheDocument();

    // money: owed now + invoices and payments in one history
    expect(p.getAllByText('300').length).toBeGreaterThan(0);
    const money = await p.findByRole('table', { name: 'الحركة المالية' });
    expect(within(money).getAllByRole('row')).toHaveLength(1 + 3); // header + 2 invoices + 1 payment
    expect(within(money).getByText('سداد')).toBeInTheDocument();
    expect(within(money).getByText('آجل', { selector: 'span:nth-child(4)' })).toBeInTheDocument();

    // subscriptions: current, old, and the cancelled one is still in the history
    const subs = p.getByRole('table', { name: 'سجل الاشتراكات' });
    expect(within(subs).getAllByRole('row')).toHaveLength(1 + 3);
    expect(within(subs).getByText('تجريبي')).toBeInTheDocument();
    expect(within(subs).getByText('ملغي')).toBeInTheDocument();

    // attendance log keeps the denied scan but statistics do not count it
    const log = await p.findByRole('table', { name: 'سجل الدخول' });
    expect(within(log).getAllByRole('row')).toHaveLength(1 + 3);
    expect(within(log).getByText('مرفوض')).toBeInTheDocument();
    expect(p.getByRole('img', { name: 'عدد الزيارات في كل يوم من الأسبوع' })).toBeInTheDocument();
    expect(p.getByRole('img', { name: 'عدد الزيارات في كل ساعة' })).toBeInTheDocument();
  });

  it('asks the checkins for the whole history, not just this month', async () => {
    await openProfile();
    await waitFor(() => expect(subscriptionsApi.getGymMemberCheckins).toHaveBeenCalled());
    const [id, filters] = subscriptionsApi.getGymMemberCheckins.mock.calls[0];
    expect(id).toBe(1);
    expect(filters.from < '2010').toBe(true);
    expect(filters.limit).toBeGreaterThanOrEqual(1000);
    expect(customersApi.getCustomerRecentSales).toHaveBeenCalledWith(1, 500);
  });

  it('goes back to the directory', async () => {
    const { profile } = await openProfile();
    fireEvent.click(within(profile).getByRole('button', { name: 'العودة إلى قائمة الأعضاء' }));
    expect(await screen.findByRole('button', { name: 'فتح بروفايل سمير' })).toBeInTheDocument();
    expect(screen.queryByLabelText('ملف العضو مروان')).not.toBeInTheDocument();
  });

  it('hands renew, manage and pay to the existing flows', async () => {
    const { profile, onNavigate } = await openProfile();
    const p = within(profile);
    fireEvent.click(p.getByRole('button', { name: /تجديد/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'renew', customerId: 1, subscriptionId: 11 } });
    fireEvent.click(p.getByRole('button', { name: /إدارة الاشتراك/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'open', customerId: 1 } });
    fireEvent.click(p.getByRole('button', { name: /سداد المستحق/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers "subscribe now" and no call link for a member with no subscription and no phone', async () => {
    const { profile, onNavigate } = await openProfile('سمير');
    const p = within(profile);
    expect(p.queryByRole('link', { name: /اتصال/ })).not.toBeInTheDocument();
    expect(p.queryByRole('button', { name: /تجديد/ })).not.toBeInTheDocument();
    fireEvent.click(p.getByRole('button', { name: /اشتراك الآن/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('gym-checkout', { gymIntent: { action: 'activate', customerId: 2 } });
  });

  it('still opens when the history queries fail', async () => {
    subscriptionsApi.getGymMemberCheckins.mockRejectedValue(new Error('x'));
    customersApi.getCustomerLedger.mockRejectedValue(new Error('x'));
    customersApi.getCustomerRecentSales.mockRejectedValue(new Error('x'));
    const { profile } = await openProfile();
    expect(await within(profile).findByText('لا توجد زيارات مسجلة لهذا العضو.')).toBeInTheDocument();
    expect(within(profile).getByText('لا توجد حركة مالية.')).toBeInTheDocument();
  });
});
