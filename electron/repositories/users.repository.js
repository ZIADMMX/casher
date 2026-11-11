const { db } = require('../database/db');

function getByUsername(username) {
  const clean = username ? username.trim() : '';
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(clean);
}

function create(user) {
  const stmt = db.prepare(`
    INSERT INTO users (
      username, password_hash, role, system_role_key, full_name, first_name, last_name,
      phone, email, job_title, specialty, working_hours, profile_image,
      pay_type, pay_amount, commission_rate, is_active, notes,
      force_password_change, recovery_key_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    user.username,
    user.passwordHash,
    user.role,
    user.systemRoleKey || null,
    user.fullName || null,
    user.firstName || null,
    user.lastName || null,
    user.phone || null,
    user.email || null,
    user.jobTitle || null,
    user.specialty || null,
    user.workingHours || null,
    user.profileImage || null,
    user.payType || null,
    user.payAmount ?? null,
    user.commissionRate ?? null,
    user.isActive === false ? 0 : 1,
    user.notes || null,
    user.forcePasswordChange ? 1 : 0,
    user.recoveryKeyHash || null
  );
}

function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function getAll() {
  return db.prepare(`
    SELECT
      u.id, u.username, u.role, u.system_role_key, u.full_name, u.first_name, u.last_name, u.phone, u.email,
      u.job_title, u.specialty, u.working_hours, u.profile_image, u.pay_type, u.pay_amount,
      u.commission_rate, u.notes, u.is_active, u.created_at, u.scheduled_start, u.scheduled_end,
      EXISTS(
        SELECT 1 FROM attendance_records a
        WHERE a.user_id = u.id
          AND a.attendance_date = DATE('now', 'localtime')
          AND a.check_out IS NOT NULL
      ) AS checked_out_today,
      EXISTS(
        SELECT 1 FROM leave_requests l
        WHERE l.user_id = u.id AND l.status = 'approved'
          AND l.start_date <= DATE('now', 'localtime') AND l.end_date >= DATE('now', 'localtime')
      ) AS on_leave,
      EXISTS(
        SELECT 1 FROM attendance_records a
        WHERE a.user_id = u.id
          AND a.attendance_date = DATE('now', 'localtime')
          AND a.check_out IS NULL
      ) AS is_present
    FROM users
    AS u
    ORDER BY u.created_at DESC
  `).all();
}

function getDetails(id) {
  const user = db.prepare(`
    SELECT id, username, role, system_role_key, full_name, first_name, last_name, phone, email, job_title, specialty,
      working_hours, profile_image, pay_type, pay_amount, commission_rate,
      notes, is_active, force_password_change, created_at
    FROM users
    WHERE id = ?
  `).get(id);
  if (!user) return null;

  const sales = db.prepare(`
    SELECT
      COUNT(*) as invoice_count,
      COALESCE(SUM(total_amount), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discounts,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) as credit_sales,
      MAX(created_at) as last_sale_at
    FROM sales
    WHERE user_id = ?
  `).get(id);

  const shifts = db.prepare(`
    SELECT
      COUNT(*) as shift_count,
      COUNT(CASE WHEN status = 'open' THEN 1 END) as open_shift_count,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_shift_count,
      COALESCE(SUM(total_expenses), 0) as total_expenses,
      COALESCE(SUM(CASE WHEN cash_difference < 0 THEN ABS(cash_difference) ELSE 0 END), 0) as total_shortage,
      COALESCE(SUM(CASE WHEN cash_difference > 0 THEN cash_difference ELSE 0 END), 0) as total_overage
    FROM shifts
    WHERE user_id = ?
  `).get(id);

  const returns = db.prepare(`
    SELECT COUNT(*) as return_count, COALESCE(SUM(refund_amount), 0) as total_refunds
    FROM returns
    WHERE user_id = ?
  `).get(id);

  return {
    user,
    stats: {
      invoiceCount: sales.invoice_count,
      totalSales: sales.total_sales,
      averageInvoice: sales.invoice_count ? sales.total_sales / sales.invoice_count : 0,
      totalDiscounts: sales.total_discounts,
      cashSales: sales.cash_sales,
      cardSales: sales.card_sales,
      creditSales: sales.credit_sales,
      lastSaleAt: sales.last_sale_at,
      shiftCount: shifts.shift_count,
      openShiftCount: shifts.open_shift_count,
      closedShiftCount: shifts.closed_shift_count,
      totalExpenses: shifts.total_expenses,
      totalShortage: shifts.total_shortage,
      totalOverage: shifts.total_overage,
      returnCount: returns.return_count,
      totalRefunds: returns.total_refunds,
    },
  };
}

function getSalesActivity(userId, limit, offset) {
  return db.prepare(`
    SELECT
      s.id, s.customer_name, s.customer_phone, s.total_amount, s.discount,
      s.payment_method, s.created_at,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as item_count
    FROM sales s
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function getShiftsActivity(userId, limit, offset) {
  return db.prepare(`
    SELECT
      s.id, s.shift_type, s.pos_station, s.start_time, s.end_time, s.status,
      s.total_cash_sales, s.total_card_sales, s.total_credit_sales,
      s.total_expenses, s.expected_cash, s.actual_cash, s.cash_difference,
      (SELECT COUNT(*) FROM sales WHERE shift_id = s.id) as sales_count,
      COALESCE((
        SELECT SUM(total_amount)
        FROM sales
        WHERE shift_id = s.id
      ), 0) as total_sales
    FROM shifts s
    WHERE s.user_id = ?
    ORDER BY s.start_time DESC, s.id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function getAdmin() {
  return db.prepare("SELECT * FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1").get();
}

function setActive(id, isActive) {
  return db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
}

function getById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getProfileById(id) {
  return db.prepare(`
    SELECT id, username, role, system_role_key, full_name, first_name, last_name,
      phone, email, gender, date_of_birth, country, city, address, profile_image, created_at
    FROM users
    WHERE id = ?
  `).get(id);
}

function updatePersonalProfile(id, profile) {
  const columns = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
    gender: 'gender',
    dateOfBirth: 'date_of_birth',
    country: 'country',
    city: 'city',
    address: 'address',
  };
  const updates = Object.entries(columns)
    .filter(([field]) => profile[field] !== undefined)
    .map(([field, column]) => [column, profile[field]]);

  if (profile.firstName !== undefined || profile.lastName !== undefined) {
    const current = getById(id);
    const legacyName = String(current?.full_name || '').trim();
    const legacyFirstName = legacyName.split(/\s+/)[0] || null;
    const legacyLastName = current?.first_name && legacyName.startsWith(current.first_name)
      ? legacyName.slice(current.first_name.length).trim() || null
      : legacyName.split(/\s+/).slice(1).join(' ') || null;
    const firstName = profile.firstName === undefined
      ? current?.first_name ?? legacyFirstName
      : profile.firstName;
    const lastName = profile.lastName === undefined
      ? current?.last_name ?? legacyLastName
      : profile.lastName;
    updates.push(['full_name', [firstName, lastName].filter(Boolean).join(' ') || null]);
  }

  if (!updates.length) return { changes: 0 };
  const assignments = updates.map(([column]) => `${column} = ?`).join(', ');
  return db.prepare(`UPDATE users SET ${assignments} WHERE id = ?`)
    .run(...updates.map(([, value]) => value), id);
}

function updateUsername(id, username) {
  return db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, id);
}

function updatePassword(id, passwordHash) {
  return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function setForcePasswordChange(id, required) {
  return db.prepare('UPDATE users SET force_password_change = ? WHERE id = ?').run(required ? 1 : 0, id);
}

function updateRecoveryKeyHash(id, recoveryKeyHash) {
  return db.prepare('UPDATE users SET recovery_key_hash = ? WHERE id = ?').run(recoveryKeyHash, id);
}

function clearForcePasswordChange(id) {
  return db.prepare('UPDATE users SET force_password_change = 0 WHERE id = ?').run(id);
}

module.exports = {
  getByUsername,
  getById,
  getAdmin,
  create,
  countAll,
  getAll,
  getDetails,
  getSalesActivity,
  getShiftsActivity,
  getProfileById,
  updatePersonalProfile,
  setActive,
  updateUsername,
  updatePassword,
  setForcePasswordChange,
  updateRecoveryKeyHash,
  clearForcePasswordChange,
};
