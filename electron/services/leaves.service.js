const leavesRepo = require('../repositories/leaves.repository');
const { requireAdmin } = require('./auth.service');

function validateCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function getLeaveRequests() {
  requireAdmin();
  return leavesRepo.getAll();
}

function createLeaveRequest({ userId, startDate, endDate, reason, autoApprove }) {
  const reviewer = requireAdmin();
  if (!validateCalendarDate(startDate) || !validateCalendarDate(endDate)) {
    throw new Error('تاريخ الإجازة غير صالح');
  }
  if (endDate < startDate) {
    throw new Error('تاريخ نهاية الإجازة يجب أن يكون في نفس يوم البداية أو بعده');
  }

  const employee = leavesRepo.getEmployee(userId);
  if (!employee) throw new Error('الموظف غير موجود');
  if (!employee.is_active) throw new Error('لا يمكن إنشاء طلب إجازة لموظف حسابه معطل');

  const status = autoApprove ? 'approved' : 'pending';
  if (status === 'approved' && leavesRepo.hasApprovedOverlap(userId, startDate, endDate)) {
    throw new Error('تتداخل هذه الإجازة مع إجازة معتمدة أخرى للموظف');
  }

  leavesRepo.create({
    userId,
    startDate,
    endDate,
    reason: reason.trim(),
    status,
    requestedByUserId: reviewer.id,
  });
  return { success: true };
}

function decideLeaveRequest({ requestId, decision }) {
  const reviewer = requireAdmin();
  const request = leavesRepo.getRequest(requestId);
  if (!request) throw new Error('طلب الإجازة غير موجود');
  if (request.status !== 'pending') throw new Error('تمت مراجعة طلب الإجازة مسبقًا');

  if (decision === 'approved'
    && leavesRepo.hasApprovedOverlap(request.user_id, request.start_date, request.end_date, request.id)) {
    throw new Error('يتداخل الطلب مع إجازة معتمدة أخرى للموظف');
  }

  const result = leavesRepo.decide(requestId, decision, reviewer.id);
  if (!result.changes) throw new Error('تعذر تحديث طلب الإجازة؛ ربما تمت مراجعته بالفعل');
  return { success: true };
}

module.exports = {
  getLeaveRequests,
  createLeaveRequest,
  decideLeaveRequest,
};
