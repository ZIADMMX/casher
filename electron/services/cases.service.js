const casesRepo = require('../repositories/cases.repository');
const caseDocumentsService = require('./caseDocuments.service');
const NotificationsService = require('./notifications.service');
const { isCourtId } = require('../validators/courts');
const customersRepo = require('../repositories/customers.repository');
const legalClientInteractionsRepo = require('../repositories/legalClientInteractions.repository');

/**
 * Legal Cases Service
 * خدمة منطق الأعمال لقطاع مكاتب المحاماة
 */

// ==========================================
// 1. القضايا
// ==========================================

function getAllCases(filters) {
  return casesRepo.getAllCases(filters);
}

function getCaseLawyers() {
  return casesRepo.getCaseLawyers();
}

function getCaseById(id) {
  if (!id) throw new Error('معرف القضية مطلوب');
  const legalCase = casesRepo.getCaseById(id);
  if (!legalCase) throw new Error('ملف القضية غير موجود');
  return legalCase;
}

function createCase(data) {
  if (!data.case_number?.trim()) {
    throw new Error('رقم القضية مطلوب');
  }
  if (!data.court_name?.trim()) {
    throw new Error('اسم المحكمة مطلوب');
  }
  if (!data.client_id) {
    throw new Error('الموكّل مطلوب');
  }
  if (!data.opponent_name?.trim()) {
    throw new Error('اسم الخصم مطلوب');
  }
  if (!data.subject?.trim()) {
    throw new Error('موضوع القضية مطلوب');
  }
  if (data.court_id && !isCourtId(data.court_id)) {
    throw new Error('معرّف المحكمة غير صالح');
  }
  if (data.paid_amount != null && (!Number.isFinite(Number(data.paid_amount)) || Number(data.paid_amount) < 0)) {
    throw new Error('المبلغ المسدد مقدمًا غير صالح');
  }
  const contractAmount = Number(data.contract_amount || 0);
  if (!Number.isFinite(contractAmount) || contractAmount < 0) {
    throw new Error('إجمالي أتعاب العقد غير صالح');
  }
  if (contractAmount > 0 && Number(data.paid_amount || 0) > contractAmount) {
    throw new Error('الدفعة المقدمة أكبر من إجمالي أتعاب العقد');
  }

  return casesRepo.createCase(data);
}

function updateCase(id, data) {
  if (Object.hasOwn(data, 'paid_amount')) {
    throw new Error('يتم تعديل المسدد من الأتعاب عبر سجل الحركات المالية');
  }
  if (!id) throw new Error('معرف القضية مطلوب');
  if (Object.hasOwn(data, 'contract_amount')
    && (!Number.isFinite(Number(data.contract_amount || 0)) || Number(data.contract_amount || 0) < 0)) {
    throw new Error('إجمالي أتعاب العقد غير صالح');
  }
  if (Object.hasOwn(data, 'case_number') && !data.case_number?.trim()) {
    throw new Error('رقم القضية مطلوب');
  }
  if (Object.hasOwn(data, 'court_name') && !data.court_name?.trim()) {
    throw new Error('اسم المحكمة مطلوب');
  }
  if (Object.hasOwn(data, 'client_id') && !data.client_id) {
    throw new Error('الموكّل مطلوب');
  }
  if (Object.hasOwn(data, 'opponent_name') && !data.opponent_name?.trim()) {
    throw new Error('اسم الخصم مطلوب');
  }
  if (Object.hasOwn(data, 'subject') && !data.subject?.trim()) {
    throw new Error('موضوع القضية مطلوب');
  }
  if (Object.hasOwn(data, 'court_id') && data.court_id && !isCourtId(data.court_id)) {
    throw new Error('معرّف المحكمة غير صالح');
  }
  const updated = casesRepo.updateCase(id, data);
  if (!updated) throw new Error('ملف القضية غير موجود');
  return updated;
}

function deleteCase(id) {
  if (!id) throw new Error('معرف القضية مطلوب');
  return casesRepo.deleteCase(id);
}

function getCaseStatusCounts(filters) {
  return casesRepo.getCaseStatusCounts(filters || {});
}

function getCasesSummaryStats() {
  return casesRepo.getCasesSummaryStats();
}

function getCasesByClientId(clientId) {
  if (!Number.isSafeInteger(Number(clientId)) || Number(clientId) <= 0) {
    throw new Error('معرف الموكل غير صالح');
  }
  return casesRepo.getCasesByClientId(Number(clientId));
}

function getLegalClientInteractions(customerId) {
  if (!Number.isSafeInteger(Number(customerId)) || Number(customerId) <= 0) {
    throw new Error('معرف الموكل غير صالح');
  }
  if (!customersRepo.getById(Number(customerId))) throw new Error('الموكل غير موجود');
  return legalClientInteractionsRepo.getByCustomerId(Number(customerId));
}

function addLegalClientInteraction(data, userSession = {}) {
  const customerId = Number(data?.customer_id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    throw new Error('معرف الموكل غير صالح');
  }
  if (!customersRepo.getById(customerId)) throw new Error('الموكل غير موجود');
  if (!['call', 'message', 'note', 'complaint'].includes(data.type)) {
    throw new Error('نوع التواصل غير صحيح');
  }
  if (typeof data.subject !== 'string' || !data.subject.trim()) {
    throw new Error('موضوع التواصل مطلوب');
  }
  if (data.follow_up_date && !isValidDate(data.follow_up_date)) {
    throw new Error('تاريخ المتابعة غير صالح');
  }

  legalClientInteractionsRepo.create({
    customer_id: customerId,
    created_by: userSession?.id || null,
    type: data.type,
    subject: data.subject.trim(),
    details: typeof data.details === 'string' ? data.details.trim() || null : null,
    follow_up_date: data.follow_up_date || null,
  });
  return legalClientInteractionsRepo.getByCustomerId(customerId);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime())
    && [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')]
      .join('-') === value;
}

function validatePowerOfAttorney(data) {
  if (Object.hasOwn(data, 'number') && !data.number?.trim()) {
    throw new Error('رقم التوكيل مطلوب');
  }
  if (Object.hasOwn(data, 'scope') && !data.scope?.trim()) {
    throw new Error('نطاق التوكيل مطلوب');
  }
  if (Object.hasOwn(data, 'issued_at') && !isValidDate(data.issued_at)) {
    throw new Error('تاريخ إصدار التوكيل غير صالح');
  }
  if (Object.hasOwn(data, 'expires_at') && data.expires_at && !isValidDate(data.expires_at)) {
    throw new Error('تاريخ انتهاء التوكيل غير صالح');
  }
  if (data.issued_at && data.expires_at && data.expires_at < data.issued_at) {
    throw new Error('تاريخ انتهاء التوكيل يجب أن يكون بعد تاريخ إصداره');
  }
}

function getCustomerPowerOfAttorneys(customerId) {
  if (!Number.isSafeInteger(Number(customerId)) || Number(customerId) <= 0) {
    throw new Error('معرف الموكل غير صالح');
  }
  if (!customersRepo.getById(Number(customerId))) throw new Error('الموكل غير موجود');
  return customersRepo.getPowerOfAttorneys(Number(customerId));
}

function createCustomerPowerOfAttorney(customerId, data, userId) {
  const normalizedCustomerId = Number(customerId);
  if (!Number.isSafeInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
    throw new Error('معرف الموكل غير صالح');
  }
  if (!customersRepo.getById(normalizedCustomerId)) throw new Error('الموكل غير موجود');
  const normalized = {
    number: typeof data.number === 'string' ? data.number.trim() : '',
    issued_at: data.issued_at,
    scope: typeof data.scope === 'string' ? data.scope.trim() : '',
    expires_at: data.expires_at || null,
    notes: typeof data.notes === 'string' ? data.notes.trim() || null : null,
  };
  validatePowerOfAttorney(normalized);
  return customersRepo.createPowerOfAttorney({
    ...normalized,
    customer_id: normalizedCustomerId,
    created_by: userId || null,
  });
}

function updateCustomerPowerOfAttorney(id, data) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error('معرف التوكيل غير صالح');
  }
  const existing = customersRepo.getPowerOfAttorneyById(Number(id));
  if (!existing) throw new Error('التوكيل غير موجود');
  const normalized = { ...data };
  if (typeof normalized.number === 'string') normalized.number = normalized.number.trim();
  if (typeof normalized.scope === 'string') normalized.scope = normalized.scope.trim();
  if (typeof normalized.notes === 'string') normalized.notes = normalized.notes.trim() || null;
  validatePowerOfAttorney({
    ...normalized,
    issued_at: normalized.issued_at ?? existing.issued_at,
    expires_at: Object.hasOwn(normalized, 'expires_at') ? normalized.expires_at : existing.expires_at,
  });
  const updated = customersRepo.updatePowerOfAttorney(Number(id), normalized);
  if (!updated) throw new Error('التوكيل غير موجود');
  return updated;
}

function deleteCustomerPowerOfAttorney(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error('معرف التوكيل غير صالح');
  }
  const result = customersRepo.deletePowerOfAttorney(Number(id));
  if (!result.changes) throw new Error('التوكيل غير موجود');
  return { success: true };
}

function getLawFirmDashboard(date) {
  const now = new Date();
  const targetDate = date || [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  if (typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('تاريخ لوحة المحامي غير صالح');
  }
  const end = new Date(`${targetDate}T00:00:00`);
  const parsedDate = [
    end.getFullYear(),
    String(end.getMonth() + 1).padStart(2, '0'),
    String(end.getDate()).padStart(2, '0'),
  ].join('-');
  if (Number.isNaN(end.getTime()) || parsedDate !== targetDate) {
    throw new Error('تاريخ لوحة المحامي غير صالح');
  }
  end.setDate(end.getDate() + 6);
  const nextWeekEndDate = [
    end.getFullYear(),
    String(end.getMonth() + 1).padStart(2, '0'),
    String(end.getDate()).padStart(2, '0'),
  ].join('-');
  return casesRepo.getLawFirmDashboard(targetDate, nextWeekEndDate);
}

// ==========================================
// 2. الجلسات
// ==========================================

function getSessionsByCaseId(caseId) {
  if (!caseId) throw new Error('معرف القضية مطلوب');
  return casesRepo.getSessionsByCaseId(caseId);
}

function getAllUpcomingSessions(filters) {
  return casesRepo.getAllUpcomingSessions(filters);
}

function getSessionById(id) {
  if (!id) throw new Error('معرف الجلسة مطلوب');
  return casesRepo.getSessionById(id);
}

function createSession(data) {
  if (!data.case_id) {
    throw new Error('معرف القضية مطلوب لتسجيل الجلسة');
  }
  if (!data.session_date) {
    throw new Error('تاريخ الجلسة مطلوب');
  }

  return casesRepo.createSession(data);
}

function updateSession(id, data) {
  if (!id) throw new Error('معرف الجلسة مطلوب');
  return casesRepo.updateSession(id, data);
}

function deleteSession(id) {
  if (!id) throw new Error('معرف الجلسة مطلوب');
  return casesRepo.deleteSession(id);
}

function getDailyDocket(date) {
  return casesRepo.getDailyDocket(date);
}

function checkDueCourtSessionReminders(hoursAhead = 48) {
  const due = casesRepo.getDueCourtSessionReminders(hoursAhead);
  if (due && due.length > 0) {
    for (const session of due) {
      if (!casesRepo.claimSessionReminder(session.id).changes) continue;
      const lawyerId = session.reminder_lawyer_id || session.assigned_lawyer_id || session.case_lawyer_id;
      const dateText = new Date(session.session_date).toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      try {
        const notification = NotificationsService.notify({
          userId: lawyerId,
          type: 'warning',
          title: 'تذكير بجلسة محكمة قادمة ⚖️',
          message: `قضية رقم (${session.case_number}) - محكمة ${session.court_name} (${session.circuit_name || 'الدائرة'}) | الموعد: ${dateText} | المطلوب: ${session.session_reason || 'حضور المرافعة'}`,
          linkPage: 'cases'
        });
        if (!notification) casesRepo.releaseSessionReminder(session.id);
      } catch (error) {
        casesRepo.releaseSessionReminder(session.id);
        throw error;
      }
    }
  }
  return due.length;
}

function isValidDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return false;
  }
  const [datePart, timePart] = value.replace(' ', 'T').split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute
    && date.getSeconds() === second;
}

function normalizeTaskData(data, existing = {}) {
  const task = { ...existing, ...data };
  if (typeof task.title !== 'string' || !task.title.trim()) {
    throw new Error('عنوان المهمة مطلوب');
  }
  if (!isValidDateTime(task.due_at)) {
    throw new Error('موعد استحقاق المهمة غير صالح');
  }
  if (task.reminder_at && !isValidDateTime(task.reminder_at)) {
    throw new Error('موعد التذكير غير صالح');
  }
  if (task.reminder_at && new Date(task.reminder_at) > new Date(task.due_at)) {
    throw new Error('موعد التذكير يجب أن يكون قبل موعد استحقاق المهمة');
  }
  if (!['low', 'normal', 'high'].includes(task.priority || 'normal')) {
    throw new Error('أولوية المهمة غير صالحة');
  }
  if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(task.status || 'pending')) {
    throw new Error('حالة المهمة غير صالحة');
  }
  for (const key of ['assigned_lawyer_id', 'session_id']) {
    if (task[key] != null && task[key] !== '') {
      const id = Number(task[key]);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(key === 'session_id' ? 'الجلسة المرتبطة غير صالحة' : 'المحامي المسؤول غير صالح');
      }
      task[key] = id;
    } else {
      task[key] = null;
    }
  }
  if (task.session_id) {
    const session = casesRepo.getSessionById(task.session_id);
    if (!session || Number(session.case_id) !== Number(task.case_id)) {
      throw new Error('الجلسة المرتبطة لا تنتمي إلى هذه القضية');
    }
  }
  return {
    ...task,
    title: task.title.trim(),
    description: typeof task.description === 'string' ? task.description.trim() || null : null,
    priority: task.priority || 'normal',
    status: task.status || 'pending',
    reminder_at: task.reminder_at || null,
  };
}

function getTasksByCaseId(caseId) {
  if (!Number.isSafeInteger(Number(caseId)) || Number(caseId) <= 0) {
    throw new Error('معرف القضية غير صالح');
  }
  return casesRepo.getTasksByCaseId(Number(caseId));
}

function createCaseTask(data, userId) {
  const caseId = Number(data?.case_id);
  if (!Number.isSafeInteger(caseId) || caseId <= 0) throw new Error('معرف القضية غير صالح');
  const legalCase = casesRepo.getCaseById(caseId);
  if (!legalCase) throw new Error('ملف القضية غير موجود');
  const normalized = normalizeTaskData({
    ...data,
    case_id: caseId,
    assigned_lawyer_id: data.assigned_lawyer_id || userId || legalCase.assigned_lawyer_id || null,
  });
  return casesRepo.createTask({ ...normalized, created_by: userId || null });
}

function updateCaseTask(id, data) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('معرف المهمة غير صالح');
  const existing = casesRepo.getTaskById(Number(id));
  if (!existing) throw new Error('المهمة غير موجودة');
  const normalized = normalizeTaskData({ ...data, case_id: existing.case_id }, existing);
  const updates = {};
  for (const key of [
    'session_id', 'title', 'description', 'due_at', 'reminder_at',
    'assigned_lawyer_id', 'priority', 'status',
  ]) {
    if (Object.hasOwn(data, key)) updates[key] = normalized[key];
  }
  return casesRepo.updateTask(Number(id), updates);
}

function deleteCaseTask(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('معرف المهمة غير صالح');
  const result = casesRepo.deleteTask(Number(id));
  if (!result.changes) throw new Error('المهمة غير موجودة');
  return { success: true };
}

function checkDueCaseTaskReminders() {
  const due = casesRepo.getDueCaseTaskReminders();
  for (const task of due) {
    if (!casesRepo.claimCaseTaskReminder(task.id).changes) continue;
    try {
      const notification = NotificationsService.notify({
        userId: task.reminder_lawyer_id,
        type: 'warning',
        title: 'تذكير بمتابعة قضية ⚖️',
        message: `القضية (${task.case_number}) - ${task.title} | موعد الاستحقاق: ${new Date(task.due_at).toLocaleString('ar-EG')}`,
        linkPage: 'cases',
      });
      if (!notification) casesRepo.releaseCaseTaskReminder(task.id);
    } catch (error) {
      casesRepo.releaseCaseTaskReminder(task.id);
      throw error;
    }
  }
  return due.length;
}

function getCaseFinancialBreakdown(caseId) {
  if (!caseId) throw new Error('معرف القضية مطلوب');
  return casesRepo.getCaseFinancialBreakdown(caseId);
}

// ==========================================
// 3. المستندات والأرشيف
// ==========================================

function getDocumentsByCaseId(caseId) {
  if (!caseId) throw new Error('معرف القضية مطلوب');
  return casesRepo.getDocumentsByCaseId(caseId);
}

function createDocument(data) {
  if (!data.case_id) throw new Error('معرف القضية مطلوب');
  if (!data.title?.trim()) throw new Error('عنوان المستند مطلوب');
  if (!data.source_path?.trim()) throw new Error('اختر ملفًا لإضافته إلى الأرشيف');

  return caseDocumentsService.createDocument(data);
}

function deleteDocument(id) {
  if (!id) throw new Error('معرف المستند مطلوب');
  return caseDocumentsService.deleteDocument(id);
}

function updateDocument(id, data) {
  if (!id) throw new Error('معرف المستند مطلوب');
  if (Object.hasOwn(data, 'title') && !data.title?.trim()) {
    throw new Error('عنوان المستند مطلوب');
  }
  const updated = caseDocumentsService.updateDocument(id, data);
  if (!updated) throw new Error('المستند غير موجود');
  return updated;
}

function getDocumentVersions(id) {
  if (!id) throw new Error('معرف المستند مطلوب');
  return caseDocumentsService.getVersions(id);
}

function openDocument(id, version) {
  if (!id) throw new Error('معرف المستند مطلوب');
  return caseDocumentsService.openDocument(id, version);
}

function downloadDocument(id, destinationPath, version) {
  if (!id) throw new Error('معرف المستند مطلوب');
  return caseDocumentsService.downloadDocument(id, destinationPath, version);
}

function restoreDocumentVersion(id, version, userId) {
  if (!id || !version) throw new Error('معرف المستند والنسخة مطلوبان');
  return caseDocumentsService.restoreVersion(id, version, userId);
}

// ==========================================
// 4. أمانات ومصاريف القضية
// ==========================================

function getFinancialsByCaseId(caseId) {
  if (!caseId) throw new Error('معرف القضية مطلوب');
  return casesRepo.getFinancialsByCaseId(caseId);
}

function createFinancial(data) {
  if (!data.case_id) throw new Error('معرف القضية مطلوب');
  if (!data.type) throw new Error('نوع الحركة المالية مطلوب');
  if (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0) {
    throw new Error('المبلغ يجب أن يكون أكبر من الصفر');
  }

  return casesRepo.createFinancial(data);
}

function deleteFinancial(id) {
  if (!id) throw new Error('معرف الحركة المالية مطلوب');
  return casesRepo.deleteFinancial(id);
}

function updateFinancial(id, data) {
  if (!id) throw new Error('معرف الحركة المالية مطلوب');
  if (Object.hasOwn(data, 'amount') && (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0)) {
    throw new Error('المبلغ يجب أن يكون أكبر من الصفر');
  }
  const updated = casesRepo.updateFinancial(id, data);
  if (!updated) throw new Error('الحركة المالية غير موجودة');
  return updated;
}

// ==========================================
// 5. سجل الساعات
// ==========================================

function getTimeLogsByCaseId(caseId) {
  if (!caseId) throw new Error('معرف القضية مطلوب');
  return casesRepo.getTimeLogsByCaseId(caseId);
}

function createTimeLog(data) {
  if (!data.case_id) throw new Error('معرف القضية مطلوب');
  if (!data.lawyer_id) throw new Error('المحامي مطلوب');
  if (!Number.isFinite(Number(data.hours)) || Number(data.hours) <= 0) {
    throw new Error('عدد الساعات يجب أن يكون أكبر من صفر');
  }
  if (data.hourly_rate != null && (!Number.isFinite(Number(data.hourly_rate)) || Number(data.hourly_rate) < 0)) {
    throw new Error('سعر الساعة غير صالح');
  }
  if (!data.activity_description?.trim()) throw new Error('وصف النشاط القانوني مطلوب');

  return casesRepo.createTimeLog(data);
}

function deleteTimeLog(id) {
  if (!id) throw new Error('معرف سجل الوقت مطلوب');
  return casesRepo.deleteTimeLog(id);
}

function updateTimeLog(id, data) {
  if (!id) throw new Error('معرف سجل الوقت مطلوب');
  if (Object.hasOwn(data, 'hours') && (!Number.isFinite(Number(data.hours)) || Number(data.hours) <= 0)) {
    throw new Error('عدد الساعات يجب أن يكون أكبر من صفر');
  }
  if (Object.hasOwn(data, 'hourly_rate') && (!Number.isFinite(Number(data.hourly_rate)) || Number(data.hourly_rate) < 0)) {
    throw new Error('سعر الساعة غير صالح');
  }
  if (Object.hasOwn(data, 'activity_description') && !data.activity_description?.trim()) {
    throw new Error('وصف النشاط القانوني مطلوب');
  }
  const updated = casesRepo.updateTimeLog(id, data);
  if (!updated) throw new Error('سجل الوقت غير موجود');
  return updated;
}

module.exports = {
  getAllCases,
  getCaseLawyers,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
  getCasesSummaryStats,
  getCaseStatusCounts,
  getCasesByClientId,
  getLegalClientInteractions,
  addLegalClientInteraction,
  getCustomerPowerOfAttorneys,
  createCustomerPowerOfAttorney,
  updateCustomerPowerOfAttorney,
  deleteCustomerPowerOfAttorney,
  getLawFirmDashboard,
  getSessionsByCaseId,
  getAllUpcomingSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  getDailyDocket,
  checkDueCourtSessionReminders,
  getTasksByCaseId,
  createCaseTask,
  updateCaseTask,
  deleteCaseTask,
  checkDueCaseTaskReminders,
  getCaseFinancialBreakdown,
  getDocumentsByCaseId,
  getDocumentVersions,
  openDocument,
  downloadDocument,
  restoreDocumentVersion,
  createDocument,
  updateDocument,
  deleteDocument,
  getFinancialsByCaseId,
  createFinancial,
  updateFinancial,
  deleteFinancial,
  getTimeLogsByCaseId,
  createTimeLog,
  updateTimeLog,
  deleteTimeLog,
};
