import { describe, expect, test } from 'vitest';
import {
  daySessions, formatTime12, holidayName, holidayState, holidaySummary, nameInitial, parseHolidayName,
  sessionStats, shiftDate, summarizeHours, weekDays,
} from '../../src/utils/legalSchedule.js';

const hours = (weekdays, start = '09:00', end = '17:00') => weekdays.map((weekday) => ({ weekday, start_time: start, end_time: end }));

describe('legal schedule week strip', () => {
  test('starts on Saturday and holds the selected day', () => {
    const week = weekDays('2026-11-11'); // Wednesday
    expect(week.map((day) => day.date)).toEqual([
      '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ]);
    expect(week[0].weekday).toBe(6);
    expect(weekDays('2026-11-07')[0].date).toBe('2026-11-07');
    expect(weekDays('2026-11-13')[0].date).toBe('2026-11-07');
  });

  test('shifts across month ends', () => {
    expect(shiftDate('2026-11-28', 7)).toBe('2026-12-05');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('legal schedule labels', () => {
  test('12-hour Arabic times', () => {
    expect(formatTime12('10:00')).toBe('10:00 ص');
    expect(formatTime12('13:00')).toBe('1:00 م');
    expect(formatTime12('00:30')).toBe('12:30 ص');
    expect(formatTime12('12:00')).toBe('12:00 م');
    expect(formatTime12('')).toBe('');
  });

  test('working hours summaries', () => {
    expect(summarizeHours(hours([6, 0, 1, 2, 3, 4]))).toBe('السبت – الخميس · 9:00 ص – 5:00 م');
    expect(summarizeHours(hours([0, 1, 2, 3, 4], '10:00', '18:00'))).toBe('الأحد – الخميس · 10:00 ص – 6:00 م');
    expect(summarizeHours(hours([0, 1, 2, 3, 4, 5, 6], '09:00', '21:00'))).toBe('كل الأيام · 9:00 ص – 9:00 م');
    expect(summarizeHours(hours([6, 1]))).toBe('السبت، الإثنين · 9:00 ص – 5:00 م');
    expect(summarizeHours([...hours([0]), ...hours([1], '10:00')])).toBe('2 أيام عمل · أوقات مختلفة');
    expect(summarizeHours([])).toBe('لا توجد أوقات عمل');
  });

  test('avatar initial skips the title', () => {
    expect(nameInitial('أ. محمد علي')).toBe('م');
    expect(nameInitial('أ.سارة حسن')).toBe('س');
    expect(nameInitial('قاعة الاجتماعات')).toBe('ق');
    expect(nameInitial('')).toBe('؟');
  });
});

describe('legal unavailability helpers', () => {
  test('reason and details round-trip through the stored name', () => {
    expect(holidayName('سفر', '  مؤتمر الإسكندرية ')).toBe('سفر — مؤتمر الإسكندرية');
    expect(holidayName('عطلة رسمية', '')).toBe('عطلة رسمية');
    expect(parseHolidayName('سفر — مؤتمر الإسكندرية')).toEqual({ reason: 'سفر', details: 'مؤتمر الإسكندرية' });
    expect(parseHolidayName('عطلة رسمية')).toEqual({ reason: 'عطلة رسمية', details: '' });
    expect(parseHolidayName('إجازة قديمة مكتوبة يدويًا')).toEqual({ reason: '', details: 'إجازة قديمة مكتوبة يدويًا' });
  });

  test('state relative to today', () => {
    const h = (start_date, end_date) => ({ start_date, end_date });
    expect(holidayState(h('2026-11-14', '2026-11-14'), '2026-11-11')).toBe('upcoming');
    expect(holidayState(h('2026-11-10', '2026-11-12'), '2026-11-11')).toBe('current');
    expect(holidayState(h('2026-11-01', '2026-11-10'), '2026-11-11')).toBe('ended');
  });

  test('summary line', () => {
    expect(holidaySummary({ resource_name: 'أ. محمد علي', start_date: '2026-11-14', end_date: '2026-11-14' })).toBe('أ. محمد علي · يوم كامل');
    expect(holidaySummary({ start_date: '2026-11-20', end_date: '2026-11-21' })).toBe('المكتب كله · 20 – 21 نوفمبر · يوم كامل');
    expect(holidaySummary({ start_date: '2026-11-30', end_date: '2026-12-02' })).toBe('المكتب كله · 30 نوفمبر – 2 ديسمبر · يوم كامل');
    expect(holidaySummary({ resource_name: 'قاعة الاجتماعات', start_date: '2026-11-25', end_date: '2026-11-25', start_time: '13:00', end_time: '16:00' }))
      .toBe('قاعة الاجتماعات · 1:00 م – 4:00 م');
  });
});

describe('legal day sessions', () => {
  const at = (hour) => new Date(2026, 10, 11, hour, 0).toISOString();
  const list = [
    { id: 1, status: 'confirmed', start_at: at(15) },
    { id: 2, status: 'booked', start_at: at(10) },
    { id: 3, status: 'cancelled', start_at: at(11) },
    { id: 4, status: 'completed', start_at: at(9) },
    { id: 5, status: 'booked', start_at: new Date(2026, 10, 12, 10).toISOString() },
    { id: 6, status: 'no_show', start_at: at(17) },
  ];

  test('keeps the day in time order and drops cancelled sessions', () => {
    expect(daySessions(list, '2026-11-11').map((session) => session.id)).toEqual([4, 2, 1, 6]);
  });

  test('counts confirmed and pending sessions', () => {
    expect(sessionStats(daySessions(list, '2026-11-11'))).toEqual({ total: 4, confirmed: 2, pending: 1 });
  });
});
