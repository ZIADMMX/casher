// Payroll rules on a fresh in-memory database: absence, lateness, overtime,
// advance installments, transport allowance and the draft -> approve -> pay flow.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
const payroll = require('../../electron/services/payroll.service');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const MONTH = { month: 3, year: 2030 };

function addUser(username, fields) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, pay_type, pay_amount,
      scheduled_start, scheduled_end, transport_allowance, is_active)
    VALUES (?, 'x', 'cashier', ?, ?, ?, ?, ?, ?, 1)
  `).run(username, username, fields.pay_type || 'monthly', fields.pay_amount,
    fields.scheduled_start || null, fields.scheduled_end || null, fields.transport_allowance || 0);
  return Number(lastInsertRowid);
}

function attend(userId, days, checkIn, checkOut) {
  const insert = db.prepare('INSERT INTO attendance_records (user_id, attendance_date, check_in, check_out) VALUES (?, ?, ?, ?)');
  for (let day = 1; day <= days; day += 1) {
    const date = `2030-03-${String(day).padStart(2, '0')}`;
    insert.run(userId, date, `${date} ${checkIn}:00`, checkOut ? `${date} ${checkOut}:00` : null);
  }
}

describe('payroll service', () => {
  let monthly;
  let hourly;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    db.prepare('UPDATE users SET is_active = 0').run();

    // 12,000 a month: day = 400, hour = 50. 20 days attended, 2 on approved leave -> 4 absent.
    // Every day 10 minutes late (200 min) and 30 minutes overtime (600 min).
    monthly = addUser('mahmoud', { pay_amount: 12000, scheduled_start: '09:00', scheduled_end: '17:00', transport_allowance: 500 });
    attend(monthly, 20, '09:10', '17:30');
    db.prepare(`INSERT INTO leave_requests (user_id, start_date, end_date, reason, status)
      VALUES (?, '2030-03-21', '2030-03-22', 'x', 'approved')`).run(monthly);
    db.prepare(`INSERT INTO salary_advances (user_id, amount, request_date, status, installments)
      VALUES (?, 5000, '2030-01-01', 'approved', 5)`).run(monthly);

    // 100 an hour, 3 days of 8 hours.
    hourly = addUser('sara', { pay_type: 'hourly', pay_amount: 100 });
    attend(hourly, 3, '09:00', '17:00');
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  test('preview applies absence, lateness, transport and one advance installment', () => {
    const preview = payroll.previewPayrollPeriod(MONTH);
    const item = preview.items.find((row) => row.user_id === monthly);
    expect(item.absent_days).toBe(4);
    expect(item.late_minutes).toBe(200);
    // 4 days * 400 + 200 min * 50/60
    expect(item.absent_deduction).toBeCloseTo(1600 + 166.67, 2);
    expect(item.transport_allowance).toBe(500);
    expect(item.overtime_amount).toBe(0); // overtime rule is off by default
    expect(item.advances_deducted).toBe(1000);
    expect(item.net_salary).toBeCloseTo(12000 + 500 - 1766.67 - 1000, 2);
  });

  test('overtime is 1.5x the hour rate when the rule is on', () => {
    const preview = payroll.previewPayrollPeriod({ ...MONTH, rules: { overtime: true } });
    const item = preview.items.find((row) => row.user_id === monthly);
    expect(item.overtime_minutes).toBe(600);
    expect(item.overtime_amount).toBe(750); // 10 h * 50 * 1.5
  });

  test('hourly employees are paid for worked hours with no absence deduction', () => {
    const item = payroll.previewPayrollPeriod(MONTH).items.find((row) => row.user_id === hourly);
    expect(item.basic_salary).toBe(2400);
    expect(item.absent_deduction).toBe(0);
  });

  test('draft -> approve -> pay all, recording the advance installment once', () => {
    const draft = payroll.generatePayrollPeriod({
      ...MONTH,
      user_ids: [monthly],
      adjustments: { [monthly]: { transport_allowance: 700, bonus: 300 } },
    });
    expect(draft.status).toBe('draft');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].bonus_amount).toBe(300);
    expect(db.prepare('SELECT transport_allowance FROM users WHERE id = ?').get(monthly).transport_allowance).toBe(700);

    expect(() => payroll.payPayrollPeriod(draft.id)).toThrow('اعتمد المسير');
    expect(() => payroll.generatePayrollPeriod(MONTH)).toThrow('يوجد مسير');

    payroll.approvePayrollPeriod(draft.id);
    const paid = payroll.payPayrollPeriod(draft.id, { payment_method: 'bank_transfer' });
    expect(paid.status).toBe('paid');
    expect(paid.items[0].payment_method).toBe('bank_transfer');
    expect(() => payroll.payEmployeeSalary(paid.items[0].id)).toThrow('مصروف بالفعل');
    expect(db.prepare('SELECT repaid_amount FROM salary_advances WHERE user_id = ?').get(monthly).repaid_amount).toBe(1000);
    expect(() => payroll.deletePayrollPeriod(draft.id)).toThrow();
  });

  test('advances reject a bad installment count', () => {
    expect(() => payroll.createAdvance({ user_id: monthly, amount: 100, installments: 0 })).toThrow('عدد الأقساط');
    const list = payroll.createAdvance({ user_id: monthly, amount: 1200, installments: 3 });
    expect(list.find((row) => row.amount === 1200).installments).toBe(3);
  });
});
