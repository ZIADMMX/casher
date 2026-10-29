const auditRepo = require('../repositories/audit.repository');
const { getCurrentSession, requireAdmin } = require('./auth.service');
const shiftsRepo = require('../repositories/shifts.repository');

/**
 * تسجيل حركة في السجل (مباشرة أو تلقائياً من الجلسة الحالية)
 */
function logAction({
  actionType,
  title,
  details = null,
  amount = 0,
  severity = 'info',
  userId = null,
  username = null,
  shiftId = null,
}) {
  let resolvedUserId = userId;
  let resolvedUsername = username;
  let resolvedShiftId = shiftId;

  if (!resolvedUserId) {
    const session = getCurrentSession();
    if (session) {
      resolvedUserId = session.id;
      resolvedUsername = session.username;
    }
  }

  if (!resolvedShiftId) {
    try {
      const activeShift = shiftsRepo.getCurrentOpenShift();
      if (activeShift) {
        resolvedShiftId = activeShift.id;
      }
    } catch {
      // Ignored if DB unavailable
    }
  }

  if (!resolvedUserId) {
    // If no user is identified, don't crash
    resolvedUserId = 0;
    resolvedUsername = resolvedUsername || 'النظام';
  }

  return auditRepo.log({
    userId: resolvedUserId,
    username: resolvedUsername,
    shiftId: resolvedShiftId,
    actionType,
    title,
    details,
    amount,
    severity,
  });
}

/**
 * جلب سجل الحركات للمدير مع الفلترة
 */
function getAuditLogs(filters = {}) {
  requireAdmin();

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const items = auditRepo.getLogs({
    userId: filters.userId ? Number(filters.userId) : null,
    shiftId: filters.shiftId ? Number(filters.shiftId) : null,
    actionType: filters.actionType || null,
    startDate: filters.startDate || null,
    endDate: filters.endDate || null,
    limit: limit + 1,
    offset,
  });

  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;
  const total = auditRepo.countLogs({
    userId: filters.userId ? Number(filters.userId) : null,
    shiftId: filters.shiftId ? Number(filters.shiftId) : null,
    actionType: filters.actionType || null,
    startDate: filters.startDate || null,
    endDate: filters.endDate || null,
  });

  return {
    items: resultItems,
    total,
    hasMore,
    nextOffset: offset + resultItems.length,
  };
}

/**
 * جلب ملخص وإحصائيات نشاط الكاشير للمدير
 */
function getCashierSummary(userId) {
  requireAdmin();
  if (!userId) throw new Error('معرف المستخدم مطلوب');
  return auditRepo.getCashierSummary(Number(userId));
}

/**
 * تسجيل حركة واجهة المستخدم (حذف صنف، تفريغ سلة، تعليق فاتورة)
 */
function logClientAction(data = {}) {
  const session = getCurrentSession();
  if (!session) return { success: false, message: 'غير مسجل' };

  logAction({
    actionType: data.actionType || 'ui_action',
    title: data.title || 'حركة على شاشة الكاشير',
    details: data.details || null,
    amount: data.amount || 0,
    severity: data.severity || 'info',
    userId: session.id,
    username: session.username,
  });

  return { success: true };
}

module.exports = {
  logAction,
  getAuditLogs,
  getCashierSummary,
  logClientAction,
};
