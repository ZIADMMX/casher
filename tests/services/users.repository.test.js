const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

const usersRepo = require('../../electron/repositories/users.repository');
const attendanceRepo = require('../../electron/repositories/attendance.repository');
const leavesRepo = require('../../electron/repositories/leaves.repository');

describe('users.repository activity data', () => {
  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    mockDb.exec(fs.readFileSync(schemaPath, 'utf8'));
  });

  beforeEach(() => {
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM returns;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM shift_expenses;
      DELETE FROM shifts;
      DELETE FROM attendance_records;
      DELETE FROM leave_requests;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);

    mockDb.prepare(`
      INSERT INTO users (id, username, password_hash, role)
      VALUES (1, 'manager', 'hash', 'admin'), (2, 'cashier', 'hash', 'cashier')
    `).run();
    mockDb.prepare(`
      INSERT INTO shifts
        (id, user_id, status, total_expenses, cash_difference, opening_cash)
      VALUES
        (10, 2, 'closed', 8, -2, 50),
        (11, 2, 'open', 0, NULL, 20)
    `).run();
    mockDb.prepare(`
      INSERT INTO attendance_records (user_id, attendance_date, check_in)
      VALUES (2, DATE('now', 'localtime'), '2026-10-07 09:00:00')
    `).run();
    mockDb.prepare(`
      INSERT INTO sales
        (id, shift_id, user_id, customer_name, total_amount, discount, payment_method, created_at)
      VALUES
        (20, 10, 2, 'Customer A', 100, 5, 'cash', '2026-09-20 10:00:00'),
        (21, 10, 2, 'Customer B', 200, 10, 'card', '2026-09-21 11:00:00')
    `).run();
    mockDb.prepare(`
      INSERT INTO sale_items (sale_id, quantity, unit_price)
      VALUES (20, 2, 50), (21, 1, 200)
    `).run();
  });

  afterAll(() => {
    mockDb.close();
  });

  test('returns only public account data and accurate lifetime sales and shift totals', () => {
    const details = usersRepo.getDetails(2);

    expect(details.user).toEqual(expect.objectContaining({
      id: 2,
      username: 'cashier',
      role: 'cashier',
    }));
    expect(details.user).not.toHaveProperty('password_hash');
    expect(details.stats).toEqual(expect.objectContaining({
      invoiceCount: 2,
      totalSales: 300,
      averageInvoice: 150,
      totalDiscounts: 15,
      cashSales: 100,
      cardSales: 200,
      shiftCount: 2,
      openShiftCount: 1,
      closedShiftCount: 1,
      totalExpenses: 8,
      totalShortage: 2,
    }));
  });

  test('paginates invoice and shift activity for the selected cashier only', () => {
    expect(usersRepo.getSalesActivity(2, 1, 0)).toEqual([
      expect.objectContaining({ id: 21, item_count: 1 }),
    ]);
    expect(usersRepo.getShiftsActivity(2, 1, 0)).toEqual([
      expect.objectContaining({
        id: 11,
        sales_count: 0,
        total_sales: 0,
        status: 'open',
      }),
    ]);
    expect(usersRepo.getDetails(999)).toBeNull();
  });

  test('returns employee profile fields and marks users with an open attendance record present', () => {
    mockDb.prepare(`
      UPDATE users
      SET full_name = 'Cashier Name',
          job_title = 'Sales associate',
          specialty = 'Retail',
          working_hours = '09:00 - 17:00'
      WHERE id = 2
    `).run();

    expect(usersRepo.getAll()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 2,
        full_name: 'Cashier Name',
        job_title: 'Sales associate',
        specialty: 'Retail',
        working_hours: '09:00 - 17:00',
        is_present: 1,
      }),
    ]));
  });

  test('loads daily attendance and persists scheduled start and end times', () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    expect(attendanceRepo.getByDate(date)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        user_id: 2,
        attendance_date: date,
        check_in: '2026-10-07 09:00:00',
      }),
    ]));

    attendanceRepo.updateSchedule(2, '09:00', '17:00');
    expect(attendanceRepo.getByDate(date)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        user_id: 2,
        scheduled_start: '09:00',
        scheduled_end: '17:00',
      }),
    ]));
  });

  test('stores leave request decisions and returns accurate leave statistics', () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    leavesRepo.create({
      userId: 2,
      startDate: date,
      endDate: date,
      reason: 'Annual leave',
      status: 'approved',
      requestedByUserId: 1,
    });
    leavesRepo.create({
      userId: 2,
      startDate: date,
      endDate: date,
      reason: 'Pending request',
      status: 'pending',
      requestedByUserId: 1,
    });
    leavesRepo.create({
      userId: 2,
      startDate: date,
      endDate: date,
      reason: 'Rejected request',
      status: 'rejected',
      requestedByUserId: 1,
    });

    const result = leavesRepo.getAll();
    expect(result.items).toHaveLength(3);
    expect(result.stats).toEqual({
      pending: 1,
      approved: 1,
      currentlyOnLeave: 1,
      rejected: 1,
    });
    expect(leavesRepo.hasApprovedOverlap(2, date, date)).toBe(true);
  });

  test('persists profile, compensation, role and account status for new employees', () => {
    const result = usersRepo.create({
      username: 'new-manager',
      passwordHash: 'hash',
      role: 'admin',
      firstName: 'First',
      lastName: 'Last',
      fullName: 'First Last',
      phone: '+201012345678',
      jobTitle: 'مدير',
      profileImage: 'C:\\employee-images\\profile.png',
      payType: 'monthly',
      payAmount: 12000,
      commissionRate: 4.5,
      isActive: false,
      forcePasswordChange: true,
    });

    expect(usersRepo.getById(Number(result.lastInsertRowid))).toEqual(expect.objectContaining({
      role: 'admin',
      first_name: 'First',
      last_name: 'Last',
      full_name: 'First Last',
      phone: '+201012345678',
      job_title: 'مدير',
      profile_image: 'C:\\employee-images\\profile.png',
      pay_type: 'monthly',
      pay_amount: 12000,
      commission_rate: 4.5,
      is_active: 0,
      force_password_change: 1,
    }));
  });

  test('reads and updates personal profile fields without exposing credentials', () => {
    usersRepo.updatePersonalProfile(2, {
      firstName: 'Sara',
      lastName: 'Ali',
      email: 'sara@example.com',
      phone: '+201000000000',
      gender: 'female',
      dateOfBirth: '1995-04-12',
      country: 'Egypt',
      city: 'Cairo',
      address: '12 Main Street',
    });

    expect(usersRepo.getProfileById(2)).toEqual(expect.objectContaining({
      id: 2,
      username: 'cashier',
      full_name: 'Sara Ali',
      first_name: 'Sara',
      last_name: 'Ali',
      email: 'sara@example.com',
      phone: '+201000000000',
      gender: 'female',
      date_of_birth: '1995-04-12',
      country: 'Egypt',
      city: 'Cairo',
      address: '12 Main Street',
    }));
    expect(usersRepo.getProfileById(2)).not.toHaveProperty('password_hash');
  });

  test('preserves a legacy full name when only one name field is edited', () => {
    mockDb.prepare("UPDATE users SET full_name = 'Legacy Name' WHERE id = 2").run();

    usersRepo.updatePersonalProfile(2, { firstName: 'Updated' });

    expect(usersRepo.getProfileById(2)).toEqual(expect.objectContaining({
      full_name: 'Updated Name',
      first_name: 'Updated',
    }));
  });

  test('sets a forced password change without returning the password hash', () => {
    usersRepo.updatePassword(2, 'new-hash');
    usersRepo.setForcePasswordChange(2, true);

    expect(usersRepo.getDetails(2).user.force_password_change).toBe(1);
    expect(usersRepo.getDetails(2).user).not.toHaveProperty('password_hash');
  });
});
