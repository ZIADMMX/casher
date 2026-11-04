jest.mock('../../electron/repositories/attendance.repository', () => ({
  getByDate: jest.fn(),
  getLast30DaysSummary: jest.fn(),
  updateSchedule: jest.fn(),
  getUser: jest.fn(),
  getRecord: jest.fn(),
  createCheckIn: jest.fn(),
  setCheckOut: jest.fn(),
}));
jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => null),
}));

jest.mock('../../electron/services/auth.service', () => ({
  requireAdmin: jest.fn(),
  requireAuth: jest.fn(() => ({ id: 1, role: 'admin' })),
}));

const attendanceRepo = require('../../electron/repositories/attendance.repository');
const authService = require('../../electron/services/auth.service');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const attendanceService = require('../../electron/services/attendance.service');

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('attendance.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validates and returns attendance for the selected date', () => {
    const date = attendanceService.getTodayDate();
    attendanceRepo.getByDate.mockReturnValue([{ user_id: 4 }]);

    expect(attendanceService.getAttendanceForDate(date)).toEqual([{ user_id: 4 }]);
    expect(attendanceRepo.getByDate).toHaveBeenCalledWith(date);
    expect(() => attendanceService.getAttendanceForDate('2026-02-30')).toThrow('تاريخ الحضور غير صالح');
  });

  test('registers one immediate check-in for an active employee today', () => {
    const date = attendanceService.getTodayDate();
    attendanceRepo.getUser.mockReturnValue({ id: 4, is_active: 1 });
    attendanceRepo.getRecord.mockReturnValue(null);

    expect(attendanceService.checkIn({ userId: 4, date })).toEqual({ success: true });
    expect(attendanceRepo.createCheckIn).toHaveBeenCalledWith(
      4,
      date,
      expect.stringMatching(new RegExp(`^${date} \\d{2}:\\d{2}:\\d{2}$`)),
    );
  });

  test('allows a cashier to check in only their own account', () => {
    const date = attendanceService.getTodayDate();
    authService.requireAuth.mockReturnValue({ id: 4, role: 'cashier' });
    attendanceRepo.getUser.mockReturnValue({ id: 4, is_active: 1 });
    attendanceRepo.getRecord.mockReturnValue(null);

    expect(attendanceService.checkIn({ date })).toEqual({ success: true });
    expect(attendanceRepo.createCheckIn).toHaveBeenCalledWith(4, date, expect.any(String));
    expect(() => attendanceService.checkIn({ userId: 5, date }))
      .toThrow('يمكنك تسجيل حضورك لنفسك فقط');
  });

  test('rejects duplicate and inactive employee check-ins', () => {
    const date = attendanceService.getTodayDate();
    attendanceRepo.getUser.mockReturnValue({ id: 4, is_active: 1 });
    attendanceRepo.getRecord.mockReturnValue({ id: 7 });
    expect(() => attendanceService.checkIn({ userId: 4, date }))
      .toThrow('تم تسجيل حضور الموظف لهذا اليوم بالفعل');

    attendanceRepo.getUser.mockReturnValue({ id: 4, is_active: 0 });
    attendanceRepo.getRecord.mockReturnValue(null);
    expect(() => attendanceService.checkIn({ userId: 4, date }))
      .toThrow('لا يمكن تسجيل حضور حساب معطل');
  });

  test('allows checking out only once after check-in', () => {
    const date = attendanceService.getTodayDate();
    attendanceRepo.getRecord.mockReturnValue({ id: 7, check_out: null });
    attendanceRepo.setCheckOut.mockReturnValue({ changes: 1 });

    expect(attendanceService.checkOut({ userId: 4, date })).toEqual({ success: true });
    expect(attendanceRepo.setCheckOut).toHaveBeenCalledWith(
      7,
      expect.stringMatching(new RegExp(`^${date} \\d{2}:\\d{2}:\\d{2}$`)),
    );

    attendanceRepo.getRecord.mockReturnValue(null);
    expect(() => attendanceService.checkOut({ userId: 4, date })).toThrow('يجب تسجيل الحضور قبل الانصراف');
  });

  test('returns only an active attendance record for shift association', () => {
    attendanceRepo.getRecord.mockReturnValue({
      id: 15,
      check_in: '2026-10-31 08:00:00',
      check_out: null,
    });
    expect(attendanceService.getActiveAttendanceToday(4)).toMatchObject({ id: 15 });

    attendanceRepo.getRecord.mockReturnValue({
      id: 15,
      check_in: '2026-10-31 08:00:00',
      check_out: '2026-10-31 16:00:00',
    });
    expect(attendanceService.getActiveAttendanceToday(4)).toBeNull();
  });

  test('requires a cashier to close their shift before checking out', () => {
    authService.requireAuth.mockReturnValue({ id: 4, role: 'cashier' });
    attendanceRepo.getRecord.mockReturnValue({ id: 7, check_out: null });
    shiftsRepo.getCurrentOpenShift.mockReturnValue({ id: 12, user_id: 4 });

    expect(() => attendanceService.checkOut({ date: attendanceService.getTodayDate() }))
      .toThrow('أغلق ورديتك أولاً قبل تسجيل الانصراف');
    expect(attendanceRepo.setCheckOut).not.toHaveBeenCalled();
  });

  test('prevents an administrator from checking out an employee with an open shift', () => {
    authService.requireAuth.mockReturnValue({ id: 1, role: 'admin' });
    attendanceRepo.getRecord.mockReturnValue({ id: 7, check_out: null });
    shiftsRepo.getCurrentOpenShift.mockReturnValue({ id: 12, user_id: 4 });

    expect(() => attendanceService.checkOut({
      userId: 4,
      date: attendanceService.getTodayDate(),
    })).toThrow('أغلق ورديتك أولاً قبل تسجيل الانصراف');
    expect(attendanceRepo.setCheckOut).not.toHaveBeenCalled();
  });

  test('summarizes present and unrecorded days over a rolling 30-day period', () => {
    attendanceRepo.getLast30DaysSummary.mockReturnValue([{
      user_id: 4,
      created_at: '2020-01-01 08:00:00',
      present_days: 18,
    }]);

    const [summary] = attendanceService.getLast30DaysSummary();
    expect(summary.monitored_days).toBe(30);
    expect(summary.present_days).toBe(18);
    expect(summary.absent_days).toBe(12);
    expect(attendanceRepo.getLast30DaysSummary).toHaveBeenCalledWith(
      expect.any(String),
      attendanceService.getTodayDate(),
    );
  });

  test('does not let an immediate punch change a historical date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(() => attendanceService.checkIn({ userId: 4, date: formatDate(yesterday) }))
      .toThrow('تسجيل الحضور الفوري متاح لتاريخ اليوم فقط');
  });
});
