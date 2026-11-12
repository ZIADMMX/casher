const { db } = require('../database/db');
const payrollRepo = require('../repositories/payroll.repository');

/**
 * Payroll Service
 * المنطق المالي وحساب مسيرات الرواتب، العمولات، الخصومات والسلف
 */

const MONTH_NAMES_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'wallet', 'cheque'];
const DEFAULT_RULES = { advances: true, attendance: true, transport: true, overtime: false };
const EXPECTED_WORK_DAYS = 26;   // working days a monthly employee is expected to attend
const MONTH_DAYS = 30;           // day rate = basic / 30
const DAY_HOURS = 8;             // hour rate = day rate / 8
const OVERTIME_RATE = 1.5;
const ADVANCE_CAP = 0.5;         // never take more than half the basic salary for advances
const MAX_AMOUNT = 10_000_000;

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

function amountOrZero(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) throw new Error(`${label} غير صالح`);
  return round(number);
}

function periodBounds(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('الشهر غير صحيح (1 - 12)');
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('السنة غير صحيحة');
  const mm = String(m).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();
  return {
    month: m,
    year: y,
    periodName: `مسير رواتب ${MONTH_NAMES_AR[m]} ${y}`,
    startDate: `${y}-${mm}-01`,
    endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function normalizeInput(input = {}) {
  const bounds = periodBounds(input.month, input.year);
  const rules = { ...DEFAULT_RULES };
  for (const key of Object.keys(DEFAULT_RULES)) {
    if (input.rules && Object.hasOwn(input.rules, key)) rules[key] = input.rules[key] === true;
  }

  let userIds = null;
  if (input.user_ids != null) {
    if (!Array.isArray(input.user_ids) || input.user_ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error('قائمة الموظفين غير صالحة');
    }
    userIds = new Set(input.user_ids);
  }

  const adjustments = {};
  for (const [userId, adj] of Object.entries(input.adjustments || {})) {
    if (!adj || typeof adj !== 'object') continue;
    adjustments[userId] = {
      transport_allowance: adj.transport_allowance === undefined || adj.transport_allowance === ''
        ? undefined
        : amountOrZero(adj.transport_allowance, 'بدل المواصلات'),
      bonus: amountOrZero(adj.bonus, 'الحافز'),
      allowance: amountOrZero(adj.allowance, 'البدل الإضافي'),
      deduction: amountOrZero(adj.deduction, 'الخصم اليدوي'),
    };
  }

  const paymentDate = input.payment_date || null;
  if (paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error('تاريخ الصرف غير صالح');
  const paymentMethod = input.payment_method || 'cash';
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error('طريقة الصرف غير صالحة');

  return { ...bounds, rules, userIds, adjustments, paymentDate, paymentMethod, notes: String(input.notes || '').slice(0, 500) };
}

// "YYYY-MM-DD HH:MM:SS" (or ISO) -> minutes after midnight; "HH:MM" works too.
function clockMinutes(value) {
  const match = /(?:^|[T ])(\d{2}):(\d{2})/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function leaveDaysInPeriod(leaves, startDate, endDate) {
  const days = new Set();
  for (const leave of leaves) {
    const from = leave.start_date > startDate ? leave.start_date : startDate;
    const to = leave.end_date < endDate ? leave.end_date : endDate;
    for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      days.add(day.toISOString().slice(0, 10));
    }
  }
  return days.size;
}

/** One employee's payroll line under the chosen rules. Pure apart from reads. */
function computeItem(user, ctx) {
  const adj = ctx.adjustments[user.id] || {};
  const rate = Number(user.pay_amount) || 0;
  const hourly = user.pay_type === 'hourly';
  const { rules, startDate, endDate } = ctx;
  const records = (rules.attendance || rules.overtime || hourly)
    ? payrollRepo.getAttendanceRecords(user.id, startDate, endDate)
    : [];

  let workedMinutes = 0;
  for (const record of records) {
    const inAt = clockMinutes(record.check_in);
    const outAt = clockMinutes(record.check_out);
    if (inAt != null && outAt != null && outAt > inAt) workedMinutes += outAt - inAt;
  }

  // Hourly employees are paid for the hours they worked, so absence and lateness do not apply.
  const basic = hourly ? round((workedMinutes / 60) * rate) : rate;
  const hourRate = hourly ? rate : rate / MONTH_DAYS / DAY_HOURS;

  let absentDays = 0;
  let lateMinutes = 0;
  let absentDeduction = 0;
  // Only employees who use attendance at all get absence deducted (no records = not tracked).
  if (rules.attendance && !hourly && basic > 0 && records.length > 0) {
    const leaveDays = leaveDaysInPeriod(payrollRepo.getApprovedLeaves(user.id, startDate, endDate), startDate, endDate);
    absentDays = Math.max(0, EXPECTED_WORK_DAYS - records.length - leaveDays);
    const shiftStart = clockMinutes(user.scheduled_start);
    if (shiftStart != null) {
      for (const record of records) {
        const inAt = clockMinutes(record.check_in);
        if (inAt != null && inAt > shiftStart) lateMinutes += inAt - shiftStart;
      }
    }
    absentDeduction = round(absentDays * (basic / MONTH_DAYS) + (lateMinutes / 60) * hourRate);
  }

  let overtimeMinutes = 0;
  const shiftEnd = clockMinutes(user.scheduled_end);
  if (rules.overtime && !hourly && shiftEnd != null) {
    for (const record of records) {
      const outAt = clockMinutes(record.check_out);
      if (outAt != null && outAt > shiftEnd) overtimeMinutes += outAt - shiftEnd;
    }
  }
  const overtimeAmount = round((overtimeMinutes / 60) * hourRate * OVERTIME_RATE);

  const transport = rules.transport
    ? (adj.transport_allowance ?? round(user.transport_allowance))
    : 0;
  // Commissions are paid from the commissions screen (commission_payouts); adding them here would pay them twice.
  const commissions = 0;
  const bonus = adj.bonus || 0;
  const otherAllowances = adj.allowance || 0;
  const manualDeduction = adj.deduction || 0;

  const gross = basic + transport + otherAllowances + overtimeAmount + bonus + commissions;
  const afterDeductions = Math.max(0, round(gross - absentDeduction - manualDeduction));

  let advanceDue = 0;
  let advanceRemaining = 0;
  for (const advance of payrollRepo.getApprovedAdvances(user.id)) {
    const remaining = round(advance.amount - advance.repaid_amount);
    if (remaining <= 0) continue;
    advanceRemaining += remaining;
    advanceDue += Math.min(remaining, round(advance.amount / Math.max(1, advance.installments || 1)));
  }
  let advancesDeducted = 0;
  if (rules.advances) {
    advancesDeducted = basic > 0 ? Math.min(advanceDue, round(basic * ADVANCE_CAP)) : advanceDue;
    advancesDeducted = round(Math.min(advancesDeducted, afterDeductions));
  }

  return {
    user_id: user.id,
    full_name: user.full_name || user.username,
    job_title: user.job_title || null,
    pay_type: user.pay_type || 'monthly',
    basic_salary: basic,
    housing_allowance: 0,
    transport_allowance: transport,
    other_allowances: otherAllowances,
    commissions_amount: commissions,
    overtime_amount: overtimeAmount,
    bonus_amount: bonus,
    deductions_amount: manualDeduction,
    absent_days: absentDays,
    absent_deduction: absentDeduction,
    advances_deducted: advancesDeducted,
    net_salary: round(afterDeductions - advancesDeducted),
    // shown in the wizard, not stored
    late_minutes: lateMinutes,
    overtime_minutes: overtimeMinutes,
    worked_hours: round(workedMinutes / 60),
    advance_installment: round(advanceDue),
    advance_remaining: round(advanceRemaining),
  };
}

function totalsOf(items) {
  const sum = (pick) => round(items.reduce((total, item) => total + pick(item), 0));
  return {
    employees: items.length,
    basic: sum((i) => i.basic_salary),
    allowances: sum((i) => i.transport_allowance + i.other_allowances + i.overtime_amount + i.bonus_amount + i.commissions_amount + i.housing_allowance),
    attendance_deductions: sum((i) => i.absent_deduction + i.deductions_amount),
    advances: sum((i) => i.advances_deducted),
    net: sum((i) => i.net_salary),
  };
}

function buildPayroll(input) {
  const ctx = normalizeInput(input);
  const items = payrollRepo.getActiveEmployeesForPayroll().map((user) => ({
    ...computeItem(user, ctx),
    included: !ctx.userIds || ctx.userIds.has(user.id),
  }));
  return { ctx, items, totals: totalsOf(items.filter((item) => item.included)) };
}

/** What the payroll would be with these choices; saves nothing. */
function previewPayrollPeriod(input) {
  const { ctx, items, totals } = buildPayroll(input);
  return {
    period_name: ctx.periodName,
    month: ctx.month,
    year: ctx.year,
    start_date: ctx.startDate,
    end_date: ctx.endDate,
    period_exists: Boolean(payrollRepo.findPayrollPeriodByMonth(ctx.month, ctx.year)),
    items,
    totals,
  };
}

/** Saves the payroll as a draft, or approved when input.approve is true. */
function generatePayrollPeriod(input = {}) {
  const { ctx, items } = buildPayroll(input);
  if (payrollRepo.findPayrollPeriodByMonth(ctx.month, ctx.year)) {
    throw new Error(`يوجد مسير رواتب مسجل مسبقاً لشهر ${ctx.month}/${ctx.year}`);
  }
  const included = items.filter((item) => item.included);
  if (!included.length) throw new Error('اختر موظفًا واحدًا على الأقل');

  const periodId = db.transaction(() => {
    const id = payrollRepo.createPayrollPeriod({
      period_name: ctx.periodName,
      month: ctx.month,
      year: ctx.year,
      start_date: ctx.startDate,
      end_date: ctx.endDate,
      created_by: input.createdBy,
      notes: ctx.notes,
      status: input.approve === true ? 'approved' : 'draft',
      payment_date: ctx.paymentDate,
      payment_method: ctx.paymentMethod,
    });
    for (const item of included) {
      payrollRepo.insertPayrollItem({ ...item, payroll_period_id: id });
      // A transport allowance typed here becomes the employee's default for next month.
      const typed = ctx.adjustments[item.user_id]?.transport_allowance;
      if (ctx.rules.transport && typed !== undefined) payrollRepo.setTransportAllowance(item.user_id, typed);
    }
    payrollRepo.updatePayrollPeriodTotals(id);
    return id;
  })();

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

function payItem(item, { payment_method, paid_amount, payment_notes }) {
  if (item.period_status === 'draft') throw new Error('اعتمد المسير أولًا قبل صرف الرواتب');
  if (item.payment_status === 'paid') throw new Error(`راتب ${item.full_name || item.username} مصروف بالفعل`);
  const method = payment_method || item.period_payment_method || 'cash';
  if (!PAYMENT_METHODS.includes(method)) throw new Error('طريقة الصرف غير صالحة');

  payrollRepo.updatePayrollItemPayment(item.id, {
    payment_status: 'paid',
    payment_method: method,
    paid_amount: Number(paid_amount) || item.net_salary,
    payment_notes,
  });

  // The installment taken from this salary is recorded against the open advances, oldest first.
  let remainingToDeduct = Number(item.advances_deducted) || 0;
  for (const adv of payrollRepo.getApprovedAdvances(item.user_id)) {
    if (remainingToDeduct <= 0) break;
    const remainingOnAdvance = adv.amount - adv.repaid_amount;
    if (remainingOnAdvance <= 0) continue;
    const deductNow = Math.min(remainingOnAdvance, remainingToDeduct);
    const newRepaid = round(adv.repaid_amount + deductNow);
    payrollRepo.recordAdvanceRepayment(adv.id, newRepaid, newRepaid >= adv.amount ? 'recovered' : 'approved');
    remainingToDeduct = round(remainingToDeduct - deductNow);
  }
}

function payEmployeeSalary(itemId, paymentData = {}) {
  const item = payrollRepo.getPayrollItemById(itemId);
  if (!item) throw new Error('بند الراتب غير موجود');
  db.transaction(() => payItem(item, paymentData))();
  return payrollRepo.getPayrollItemById(itemId);
}

/** Pays every employee still unpaid in an approved payroll. */
function payPayrollPeriod(periodId, { payment_method } = {}) {
  const period = payrollRepo.getPayrollPeriodById(periodId);
  if (!period) throw new Error('مسير الرواتب غير موجود');
  if (period.status === 'draft') throw new Error('اعتمد المسير أولًا قبل صرف الرواتب');
  const unpaid = payrollRepo.getPayrollItems(periodId).filter((item) => item.payment_status !== 'paid');
  if (!unpaid.length) throw new Error('كل رواتب هذا المسير مصروفة بالفعل');
  db.transaction(() => {
    for (const row of unpaid) payItem(payrollRepo.getPayrollItemById(row.id), { payment_method });
  })();
  return getPayrollDetails(periodId);
}

function approvePayrollPeriod(periodId) {
  const period = payrollRepo.getPayrollPeriodById(periodId);
  if (!period) throw new Error('مسير الرواتب غير موجود');
  if (period.status !== 'draft') throw new Error('هذا المسير معتمد بالفعل');
  payrollRepo.updatePayrollPeriodStatus(periodId, 'approved');
  return getPayrollDetails(periodId);
}

function deletePayrollPeriod(periodId) {
  const period = payrollRepo.getPayrollPeriodById(periodId);
  if (!period) throw new Error('مسير الرواتب غير موجود');
  if (period.status === 'paid' || payrollRepo.getPayrollItems(periodId).some((item) => item.payment_status === 'paid')) {
    throw new Error('لا يمكن حذف مسير رواتب صُرف منه رواتب');
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
  const installments = data.installments == null || data.installments === '' ? 1 : Number(data.installments);
  if (!Number.isInteger(installments) || installments < 1 || installments > 60) {
    throw new Error('عدد الأقساط يجب أن يكون بين 1 و60');
  }
  const reqDate = data.request_date || new Date().toISOString().split('T')[0];
  payrollRepo.createAdvance({
    user_id: data.user_id,
    amount: Number(data.amount),
    request_date: reqDate,
    reason: data.reason || '',
    installments,
  });
  return getAllAdvances(data.user_id);
}

module.exports = {
  previewPayrollPeriod,
  generatePayrollPeriod,
  getAllPayrollPeriods,
  getPayrollDetails,
  payEmployeeSalary,
  payPayrollPeriod,
  approvePayrollPeriod,
  deletePayrollPeriod,
  getAllAdvances,
  createAdvance,
};
