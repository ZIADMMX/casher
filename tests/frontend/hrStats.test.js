import { describe, expect, it } from 'vitest';
import {
  countWithoutShift, filterLeaves, leaveDays, summarizeLeaves, todayAttendanceLabel,
} from '../../src/utils/hrStats.js';

const today = '2026-11-11';
const leaves = [
  { id: 1, user_id: 1, status: 'pending', start_date: '2026-11-20', end_date: '2026-11-21', created_at: '2026-11-10 09:00:00' },
  { id: 2, user_id: 2, status: 'approved', start_date: '2026-11-10', end_date: '2026-11-12', reviewed_at: '2026-11-09 10:00:00' },
  { id: 3, user_id: 2, status: 'approved', start_date: '2026-11-11', end_date: '2026-11-11', reviewed_at: '2026-11-09 10:00:00' },
  { id: 4, user_id: 3, status: 'approved', start_date: '2026-08-01', end_date: '2026-08-02', reviewed_at: '2026-07-30 10:00:00' },
  { id: 5, user_id: 4, status: 'rejected', start_date: '2026-11-01', end_date: '2026-11-01', created_at: '2026-10-20 10:00:00' },
];

describe('leave helpers', () => {
  it('filters by status and keeps everything for "all"', () => {
    expect(filterLeaves(leaves, 'all')).toHaveLength(5);
    expect(filterLeaves(leaves, 'approved').map((l) => l.id)).toEqual([2, 3, 4]);
    expect(filterLeaves(leaves, 'rejected').map((l) => l.id)).toEqual([5]);
  });

  it('counts only last-30-day decisions and distinct people on leave today', () => {
    expect(summarizeLeaves(leaves, today)).toEqual({ pending: 1, approved: 2, rejected: 1, onLeaveNow: 1 });
  });

  it('counts leave days inclusively, across month ends', () => {
    expect(leaveDays('2026-11-11', '2026-11-11')).toBe(1);
    expect(leaveDays('2026-10-30', '2026-11-02')).toBe(4);
    expect(leaveDays('', '2026-11-02')).toBe(0);
  });
});

describe('team helpers', () => {
  it('counts active employees missing a full shift', () => {
    expect(countWithoutShift([
      { is_active: 1, scheduled_start: '09:00', scheduled_end: '17:00' },
      { is_active: 1, scheduled_start: '09:00', scheduled_end: null },
      { is_active: 1 },
      { is_active: 0 },
    ])).toBe(2);
  });

  it('labels today attendance with leave taking priority', () => {
    expect(todayAttendanceLabel({ on_leave: 1, is_present: 1 }).label).toBe('في إجازة');
    expect(todayAttendanceLabel({ is_present: 1 }).label).toBe('حاضر');
    expect(todayAttendanceLabel({ checked_out_today: 1 }).label).toBe('انصرف');
    expect(todayAttendanceLabel({}).label).toBe('لم يسجّل بعد');
  });
});
