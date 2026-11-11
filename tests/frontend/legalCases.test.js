import { describe, expect, test } from 'vitest';
import { feeProgress, formatMoney, nextSessionInfo } from '../../src/utils/legalCases.js';

describe('case fees', () => {
  test('partial, settled, overpaid and no-contract cases', () => {
    expect(feeProgress({ contract_amount: 15000, paid_amount: 9000 })).toEqual({ total: 15000, paid: 9000, remaining: 6000, percent: 60, settled: false });
    expect(feeProgress({ contract_amount: 40000, paid_amount: 40000 })).toMatchObject({ remaining: 0, percent: 100, settled: true });
    expect(feeProgress({ contract_amount: 1000, paid_amount: 1500 })).toMatchObject({ remaining: 0, percent: 100, settled: true });
    expect(feeProgress({ contract_amount: 0, paid_amount: 300 })).toMatchObject({ total: 0, percent: 0, settled: false });
    expect(feeProgress({ contract_amount: null, paid_amount: undefined })).toMatchObject({ total: 0, paid: 0 });
  });

  test('money uses Latin digits with separators', () => {
    expect(formatMoney(106000)).toBe('106,000');
    expect(formatMoney(null)).toBe('0');
  });
});

describe('next session column', () => {
  const now = new Date(2026, 10, 11);

  test('shows the local date and the session reason', () => {
    expect(nextSessionInfo({ next_session_date: '2026-11-14T10:00', next_session_reason: 'مرافعة' }, now))
      .toEqual({ label: '14 نوفمبر', note: 'مرافعة' });
    expect(nextSessionInfo({ next_session_date: '2026-11-30 23:30' }, now)).toEqual({ label: '30 نوفمبر', note: 'جلسة' });
    expect(nextSessionInfo({ next_session_date: '2027-01-05T09:00' }, now).label).toBe('5 يناير 2027');
  });

  test('explains a missing session by the case status', () => {
    expect(nextSessionInfo({ status: 'active' }, now)).toEqual({ label: null, note: 'بانتظار تحديد جلسة' });
    expect(nextSessionInfo({ status: 'judged' }, now).note).toBe('صدر الحكم');
    expect(nextSessionInfo({ status: 'closed', next_session_date: 'bad' }, now).note).toBe('الملف منتهٍ');
  });
});
