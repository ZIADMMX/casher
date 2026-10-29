const payrollRepo = require('../repositories/payroll.repository');
const { db } = require('../database/db');

/**
 * Payroll Service
 * المنطق المالي وحساب مسيرات الرواتب، العمولات، الخصومات والسلف
 */

const MONTH_NAMES_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function generatePayrollPeriod({ month, year, createdBy, notes }) {
  const m = Number(month);
  const y = Number(year);
  if (!m || m < 1 || m > 12) throw new Error('الشهر غير صحيح (1 - 12)');
  if (!y || y < 2000) throw new Error('السنة غير صحيحة');

  const periodName = `مسير رواتب ${MONTH_NAMES_AR[m] || m} ${y}`;
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // التحقق من عدم وجود مسير سابق لنفس الشهر
  const existing = db.prepare('SELECT id FROM payroll_periods WHERE month = ? AND year = ?').get(m, y);
  if (existing) {
    throw new Error(`يوجد مسير رواتب مسجل مسبقاً لشهر ${m}/${y}`);
  }

  const periodId = payrollRepo.createPayrollPeriod({
    period_name: periodName,
    month: m,
    year: y,
    start_date: startDate,
    end_date: endDate,
    created_by: createdBy,
    notes,
  });

  // جلب الموظفين النشطين
  const activeUsers = db.prepare(`
    SELECT id, username, full_name, pay_type, pay_amount, commission_rate
    FROM users
    WHERE is_active = 1
  `).all();

  for (const user of activeUsers) {
    const basicSalary = Number(user.pay_amount) || 0;

    // 1. حساب العمولات لشهر المسير
    let commissionsAmount = 0;
    try {
      const commRow = db.prepare(`
        SELECT COALESCE(SUM(earned_amount), 0) as total_comm
        FROM commission_earnings
        WHERE user_id = ? 
          AND DATE(created_at) >= ? 
          AND DATE(created_at) <= ?
      `).get(user.id, startDate, endDate);
      commissionsAmount = Number(commRow?.total_comm) || 0;
    } catch {}

    // 2. حساب الغياب من جدول الحضور (افتراض شهر 30 يوم)
    let absentDays = 0;
    let absentDeduction = 0;
    try {
      const attendanceCount = db.prepare(`
        SELECT COUNT(DISTINCT attendance_date) as attended
        FROM attendance_records
        WHERE user_id = ? 
          AND attendance_date >= ? 
          AND attendance_date <= ?
      `).get(user.id, startDate, endDate);

      // إذا كان الموظف مسجل براتب شهري، يحسب الغياب بناء على الأيام الرسمية
      const attended = Number(attendanceCount?.attended) || 0;
      if (attended > 0 && basicSalary > 0) {
        // أيام العمل المعتادة ~26 يوم
        const expectedDays = 26;
        if (attended < expectedDays) {
          absentDays = Math.max(0, expectedDays - attended);
          // خصم اليومية = الراتب / 30
          const dayRate = basicSalary / 30;
          absentDeduction = Math.round(absentDays * dayRate);
        }
      }
    } catch {}

    // 3. احتساب السلف غير المسددة
    let advancesDeducted = 0;
    try {
      const advRow = db.prepare(`
        SELECT COALESCE(SUM(amount - repaid_amount), 0) as total_adv
        FROM salary_advances
        WHERE user_id = ? AND status = 'approved' AND (amount - repaid_amount) > 0
      `).get(user.id);
      advancesDeducted = Number(advRow?.total_adv) || 0;
      // لا نخصم سلفة تزيد عن 50% من الأساسي لتجنب تصفير الراتب
      if (advancesDeducted > basicSalary * 0.5 && basicSalary > 0) {
        advancesDeducted = Math.round(basicSalary * 0.5);
      }
    } catch {}

    const netSalary = Math.max(
      0,
      basicSalary + commissionsAmount - absentDeduction - advancesDeducted
    );

    payrollRepo.insertPayrollItem({
      payroll_period_id: periodId,
      user_id: user.id,
      basic_salary: basicSalary,
      housing_allowance: 0,
      transport_allowance: 0,
      other_allowances: 0,
      commissions_amount: commissionsAmount,
      overtime_amount: 0,
      bonus_amount: 0,
      deductions_amount: 0,
      absent_days: absentDays,
      absent_deduction: absentDeduction,
      advances_deducted: advancesDeducted,
      net_salary: netSalary,
    });
  }

  payrollRepo.updatePayrollPeriodTotals(periodId);
  return getPayrollDetails(periodId);
}

function getAllPayrollPeriods() {
  return payrollRepo.getAllPayrollPeriods();
}

function getPayrollDetails(payrollId) {
  const period = payrollRepo.getPayrollPeriodById(payrollId);
  if (!period) throw new Error('مسير الرواتب غير موجود');
  const items = payrollRepo.getPayrollItems(payrollId);
  return {
    ...period,
    items,
  };
}

function payEmployeeSalary(itemId, { payment_method = 'cash', paid_amount, payment_notes }) {
  const item = payrollRepo.getPayrollItemById(itemId);
  if (!item) throw new Error('بند الراتب غير موجود');

  const amountToPay = Number(paid_amount) || item.net_salary;

  payrollRepo.updatePayrollItemPayment(itemId, {
    payment_status: 'paid',
    payment_method,
    paid_amount: amountToPay,
    payment_notes,
  });

  // إذا كان هناك سلف مخصومة، نسجل سدادها
  if (item.advances_deducted > 0) {
    try {
      const openAdvances = db.prepare(`
        SELECT id, amount, repaid_amount 
        FROM salary_advances 
        WHERE user_id = ? AND status = 'approved'
      `).all(item.user_id);

      let remainingToDeduct = item.advances_deducted;
      for (const adv of openAdvances) {
        const remainingOnAdvance = adv.amount - adv.repaid_amount;
        if (remainingOnAdvance <= 0) continue;

        const deductNow = Math.min(remainingOnAdvance, remainingToDeduct);
        const newRepaid = adv.repaid_amount + deductNow;
        const newStatus = newRepaid >= adv.amount ? 'recovered' : 'approved';

        db.prepare('UPDATE salary_advances SET repaid_amount = ?, status = ? WHERE id = ?')
          .run(newRepaid, newStatus, adv.id);

        remainingToDeduct -= deductNow;
        if (remainingToDeduct <= 0) break;
      }
    } catch (e) {
      console.error('Failed to update advances on salary payment:', e);
    }
  }

  return payrollRepo.getPayrollItemById(itemId);
}

function approvePayrollPeriod(periodId) {
  payrollRepo.updatePayrollPeriodStatus(periodId, 'approved');
  return getPayrollDetails(periodId);
}

function deletePayrollPeriod(periodId) {
  const period = payrollRepo.getPayrollPeriodById(periodId);
  if (!period) throw new Error('مسير الرواتب غير موجود');
  if (period.status === 'paid') {
    throw new Error('لا يمكن حذف مسير رواتب تم صرفه بالكامل');
  }
  return payrollRepo.deletePayrollPeriod(periodId);
}

// السلف
function getAllAdvances(userId) {
  return payrollRepo.getAllAdvances(userId);
}

function createAdvance(data) {
  if (!data.user_id) throw new Error('الموظف مطلوب');
  if (!data.amount || Number(data.amount) <= 0) throw new Error('مبلغ السلفة يجب أن يكون أكبر من صفر');
  const reqDate = data.request_date || new Date().toISOString().split('T')[0];
  payrollRepo.createAdvance({
    user_id: data.user_id,
    amount: Number(data.amount),
    request_date: reqDate,
    reason: data.reason || '',
  });
  return getAllAdvances(data.user_id);
}

module.exports = {
  generatePayrollPeriod,
  getAllPayrollPeriods,
  getPayrollDetails,
  payEmployeeSalary,
  approvePayrollPeriod,
  deletePayrollPeriod,
  getAllAdvances,
  createAdvance,
};
