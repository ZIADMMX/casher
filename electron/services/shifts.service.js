const shiftsRepo = require('../repositories/shifts.repository');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession } = require('./auth.service');
const attendanceService = require('./attendance.service');

function getCurrentShift() {
  const session = requireAuth();
  const openShift = shiftsRepo.getCurrentOpenShift(session?.id) || (session?.role === 'admin' ? shiftsRepo.getCurrentOpenShift() : null);
  if (!openShift) return null;
  const liveTotals = shiftsRepo.getShiftLiveTotals(openShift.id);
  return {
    ...openShift,
    liveTotals,
  };
}

function getLastClosedShift() {
  const session = requireAuth();
  if (session.role === 'admin') {
    return shiftsRepo.getLastClosedShift();
  }
  // Return cashier's own last closed shift for non-admins
  const cashierShifts = shiftsRepo.getAllShifts({ userId: session.id, status: 'closed', limit: 1 });
  return cashierShifts[0] || null;
}

function getAuthorizedShift(shiftId) {
  const session = requireAuth();
  const shift = shiftsRepo.getShiftDetails(shiftId);
  if (!shift) throw new Error('الوردية غير موجودة');
  if (session.role !== 'admin' && shift.user_id !== session.id) {
    throw new Error('لا يمكنك الوصول إلى وردية مستخدم آخر');
  }
  return shift;
}

function openShift({ openingCash = 0, shiftType = 'morning', posStation = 'الدرج الرئيسي - POS 1', notes = '', openingCashBreakdown = null } = {}) {
  const session = getCurrentSession();
  if (!session) throw new Error('يجب تسجيل الدخول أولاً');

  const existing = shiftsRepo.getCurrentOpenShift(session.id);
  if (existing) {
    throw new Error(`لديك وردية مفتوحة بالفعل حالياً برقم #${existing.id}`);
  }

  if (session.role !== 'admin' && !attendanceService.isCheckedInToday(session.id)) {
    throw new Error('سجّل حضورك أولاً قبل فتح الوردية');
  }

  const initialAmount = Number(openingCash);
  if (isNaN(initialAmount) || initialAmount < 0) {
    throw new Error('العهدة الابتدائية يجب أن تكون رقم أكبر من أو يساوي الصفر');
  }

  const newShift = shiftsRepo.openShift({
    userId: session.id,
    openedByName: session.username,
    openingCash: initialAmount,
    shiftType,
    posStation,
    notes,
    openingCashBreakdown,
  });

  try {
    NotificationsService.notify({
      type: 'shift_opened',
      title: '🟢 بدء وردية جديدة',
      message: `قام ${session.username} بفتح وردية #${newShift.id} (${shiftType === 'evening' ? 'مسائية 🌙' : 'صباحية ☀️'}) بعهدة فكة ${initialAmount.toFixed(2)} ج.م`,
      linkPage: 'shifts',
    });
    require('./audit.service').logAction({
      actionType: 'shift_open',
      title: `فتح وردية #${newShift.id}`,
      details: `فتح وردية جديدة (${shiftType === 'evening' ? 'مسائية' : 'صباحية'}) بعهدة نقدية ${initialAmount.toFixed(2)} ج.م`,
      amount: initialAmount,
      shiftId: newShift.id,
      userId: session.id,
      username: session.username,
      severity: 'success',
    });
  } catch {}

  return newShift;
}

function closeShift({ shiftId, actualCash, cashBreakdown, notes } = {}) {
  const session = getCurrentSession();
  if (!session) throw new Error('يجب تسجيل الدخول أولاً');

  let targetShiftId = shiftId;
  if (!targetShiftId) {
    const current = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
    if (!current) throw new Error('لا توجد وردية مفتوحة لإغلاقها');
    targetShiftId = current.id;
  }

  const targetShift = shiftsRepo.getShiftDetails(targetShiftId);
  if (!targetShift) throw new Error('الوردية غير موجودة');
  if (targetShift.status !== 'open') {
    throw new Error('لا يمكن إغلاق وردية مغلقة بالفعل');
  }
  if (session.role !== 'admin' && targetShift.user_id !== session.id) {
    throw new Error('لا يمكنك إغلاق وردية مستخدم آخر');
  }

  const actual = Number(actualCash);
  if (isNaN(actual) || actual < 0) {
    throw new Error('يرجى إدخال المبلغ الفعلي الموجود في الدرج كرقم صحيح');
  }

  const closedShift = shiftsRepo.closeShift({
    shiftId: targetShiftId,
    actualCash: actual,
    cashBreakdown,
    notes,
    closedByUserId: session.id,
  });

  try {
    const diff = Number(closedShift.cash_difference || 0);
    const auditService = require('./audit.service');

    if (diff < 0) {
      NotificationsService.notify({
        type: 'shift_shortage',
        title: '🔴 تنبيه: عجز مالي في تقفيل الوردية!',
        message: `تم إغلاق الوردية #${targetShiftId} بعجز مالي قدره ${Math.abs(diff).toFixed(2)} ج.م (المتوقع: ${Number(closedShift.expected_cash || 0).toFixed(2)}، الفعلي: ${actual.toFixed(2)})`,
        linkPage: 'shifts',
      });
      auditService.logAction({
        actionType: 'shift_close',
        title: `إغلاق وردية #${targetShiftId} (عجز مالي: ${Math.abs(diff).toFixed(2)} ج.م)`,
        details: `تقفيل وردية #${targetShiftId} - الفعلي: ${actual.toFixed(2)} ج.م | المتوقع: ${Number(closedShift.expected_cash || 0).toFixed(2)} ج.م | العجز: ${Math.abs(diff).toFixed(2)} ج.م`,
        amount: diff,
        shiftId: targetShiftId,
        userId: session.id,
        username: session.username,
        severity: 'danger',
      });
    } else if (diff > 0) {
      NotificationsService.notify({
        type: 'shift_closed',
        title: '🟢 تقفيل وردية مع وجود فائض نقدية',
        message: `تم إغلاق الوردية #${targetShiftId} بفائض قدره +${diff.toFixed(2)} ج.م (الفعلي: ${actual.toFixed(2)} ج.م)`,
        linkPage: 'shifts',
      });
      auditService.logAction({
        actionType: 'shift_close',
        title: `إغلاق وردية #${targetShiftId} (فائض نقدية: +${diff.toFixed(2)} ج.م)`,
        details: `تقفيل وردية #${targetShiftId} - الفعلي: ${actual.toFixed(2)} ج.م | المتوقع: ${Number(closedShift.expected_cash || 0).toFixed(2)} ج.م | الزيادة: +${diff.toFixed(2)} ج.م`,
        amount: diff,
        shiftId: targetShiftId,
        userId: session.id,
        username: session.username,
        severity: 'warning',
      });
    } else {
      NotificationsService.notify({
        type: 'shift_closed',
        title: '🔒 تم تقفيل الوردية بمطابقة تامة',
        message: `تم تقفيل الوردية #${targetShiftId} بمطابقة تامة 100% للدرج (${actual.toFixed(2)} ج.م)`,
        linkPage: 'shifts',
      });
      auditService.logAction({
        actionType: 'shift_close',
        title: `إغلاق وردية #${targetShiftId} (مطابقة تامة)`,
        details: `تقفيل وردية #${targetShiftId} بمطابقة 100% - إجمالي النقدية: ${actual.toFixed(2)} ج.م`,
        amount: actual,
        shiftId: targetShiftId,
        userId: session.id,
        username: session.username,
        severity: 'success',
      });
    }
  } catch {}

  return closedShift;
}

function getShiftXReport(shiftId) {
  let targetShiftId = shiftId;
  if (!targetShiftId) {
    const session = getCurrentSession();
    const current = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
    if (!current) return null;
    targetShiftId = current.id;
  }
  return getAuthorizedShift(targetShiftId);
}

function addShiftExpense({ shiftId, amount, category, notes } = {}) {
  const session = getCurrentSession();
  if (!session) throw new Error('يجب تسجيل الدخول أولاً');

  let targetShiftId = shiftId;
  if (!targetShiftId) {
    const current = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
    if (!current) {
      throw new Error('لا يمكن تسجيل مصروف للدرج لعدم وجود وردية مفتوحة حالياً');
    }
    targetShiftId = current.id;
  }

  const targetShift = shiftsRepo.getShiftDetails(targetShiftId);
  if (!targetShift) throw new Error('الوردية غير موجودة');
  if (targetShift.status !== 'open') {
    throw new Error('لا يمكن إضافة مصروف إلى وردية مغلقة');
  }
  if (session.role !== 'admin' && targetShift.user_id !== session.id) {
    throw new Error('لا يمكنك إضافة مصروف إلى وردية مستخدم آخر');
  }

  const expenseAmount = Number(amount);
  if (isNaN(expenseAmount) || expenseAmount <= 0) {
    throw new Error('مبلغ المصروف يجب أن يكون أكبر من الصفر');
  }

  if (!category || !category.trim()) {
    throw new Error('يرجى تحديد بند أو تصنيف المصروف');
  }

  const id = shiftsRepo.addShiftExpense({
    shiftId: targetShiftId,
    userId: session.id,
    amount: expenseAmount,
    category: category.trim(),
    notes: notes?.trim() || null,
  });

  try {
    NotificationsService.notify({
      type: 'expense_created',
      title: '💸 سحب مصروف من الدرج',
      message: `قام ${session.username} بسحب ${expenseAmount.toFixed(2)} ج.م (${category.trim()}) من عهدة الوردية #${targetShiftId}`,
      linkPage: 'shifts',
    });
    require('./audit.service').logAction({
      actionType: 'expense_added',
      title: `سحب مصروف من الدرج (${expenseAmount.toFixed(2)} ج.م)`,
      details: `بند: ${category.trim()} | الملاحظات: ${notes?.trim() || 'بدون ملاحظات'}`,
      amount: expenseAmount,
      shiftId: targetShiftId,
      userId: session.id,
      username: session.username,
      severity: 'warning',
    });
  } catch {}

  return { id, success: true };
}

function getShiftExpenses(shiftId) {
  let targetShiftId = shiftId;
  if (!targetShiftId) {
    const session = getCurrentSession();
    const current = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
    if (!current) return [];
    targetShiftId = current.id;
  }
  getAuthorizedShift(targetShiftId);
  return shiftsRepo.getShiftExpenses(targetShiftId);
}

function getAllShifts(filters = {}) {
  const session = requireAuth();
  if (session.role === 'admin') {
    return shiftsRepo.getAllShifts(filters);
  }
  // Return only the cashier's own shifts for non-admins
  return shiftsRepo.getAllShifts({ ...filters, userId: session.id });
}

function getShiftById(shiftId) {
  return getAuthorizedShift(shiftId);
}

function getShiftsKPIs() {
  const session = requireAuth();
  if (session.role !== 'admin') {
    return {
      closedShiftsCount: 0,
      totalSalesVolume: 0,
      totalShortage: 0,
      totalOverage: 0,
      totalExpensesAmount: 0,
    };
  }
  return shiftsRepo.getShiftsKPIs();
}

module.exports = {
  getCurrentShift,
  getLastClosedShift,
  openShift,
  closeShift,
  getShiftXReport,
  addShiftExpense,
  getShiftExpenses,
  getAllShifts,
  getShiftById,
  getShiftsKPIs,
};
