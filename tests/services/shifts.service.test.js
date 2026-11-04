jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => null),
  openShift: jest.fn(() => ({ id: 4, opening_cash: 100 })),
  closeShift: jest.fn(() => ({
    id: 4,
    expected_cash: 147.35,
    actual_cash: 145,
    cash_difference: -2.35,
  })),
  addShiftExpense: jest.fn(() => 12),
  getShiftDetails: jest.fn(() => ({ id: 4, user_id: 7, status: 'open' })),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/attendance.service', () => ({
  getActiveAttendanceToday: jest.fn(() => ({
    id: 21,
    user_id: 7,
    check_in: '2026-10-31 08:00:00',
    check_out: null,
  })),
}));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier', role: 'cashier' })),
}));

const shiftsRepo = require('../../electron/repositories/shifts.repository');
const attendanceService = require('../../electron/services/attendance.service');
const authService = require('../../electron/services/auth.service');
const { openShift, closeShift, addShiftExpense } = require('../../electron/services/shifts.service');

describe('shifts.service financial operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getCurrentSession.mockReturnValue({ id: 7, username: 'cashier', role: 'cashier' });
    attendanceService.getActiveAttendanceToday.mockReturnValue({
      id: 21,
      user_id: 7,
      check_in: '2026-10-31 08:00:00',
      check_out: null,
    });
  });

  test('passes precise opening cash and returns the opened shift', () => {
    expect(openShift({ openingCash: '100.25' })).toEqual({ id: 4, opening_cash: 100 });
    expect(shiftsRepo.openShift).toHaveBeenCalledWith(expect.objectContaining({
      openingCash: 100.25,
      userId: 7,
      attendanceRecordId: 21,
    }));
  });

  test('blocks cashier shift opening until today attendance is active', () => {
    attendanceService.getActiveAttendanceToday.mockReturnValue(null);

    expect(() => openShift({ openingCash: 100 }))
      .toThrow('سجّل حضورك أولاً قبل فتح الوردية');
    expect(shiftsRepo.openShift).not.toHaveBeenCalled();
  });

  test('also blocks administrators from opening a shift without attendance', () => {
    authService.getCurrentSession.mockReturnValue({ id: 7, username: 'admin', role: 'admin' });
    attendanceService.getActiveAttendanceToday.mockReturnValue(null);

    expect(() => openShift({ openingCash: 100 }))
      .toThrow('سجّل حضورك أولاً قبل فتح الوردية');
    expect(shiftsRepo.openShift).not.toHaveBeenCalled();
  });

  test('returns the exact shortage/overage calculated when closing', () => {
    const result = closeShift({ shiftId: 4, actualCash: '145.00' });

    expect(result.cash_difference).toBe(-2.35);
    expect(shiftsRepo.closeShift).toHaveBeenCalledWith({
      shiftId: 4,
      actualCash: 145,
      cashBreakdown: undefined,
      notes: undefined,
      closedByUserId: 7,
    });
  });

  test('normalizes expense amounts and rejects zero or negative expenses', () => {
    expect(addShiftExpense({ shiftId: 4, amount: '12.35', category: 'Transport' })).toEqual({
      id: 12,
      success: true,
    });
    expect(shiftsRepo.addShiftExpense).toHaveBeenCalledWith(expect.objectContaining({
      amount: 12.35,
      category: 'Transport',
      userId: 7,
    }));

    expect(() => addShiftExpense({ shiftId: 4, amount: 0, category: 'Transport' }))
      .toThrow('أكبر من الصفر');
  });
});