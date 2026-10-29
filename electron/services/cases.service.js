const casesRepo = require('../repositories/cases.repository');
const NotificationsService = require('./notifications.service');

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

  return casesRepo.createCase(data);
}

function updateCase(id, data) {
  if (!id) throw new Error('معرف القضية مطلوب');
  return casesRepo.updateCase(id, data);
}

function deleteCase(id) {
  if (!id) throw new Error('معرف القضية مطلوب');
  return casesRepo.deleteCase(id);
}

function getCasesSummaryStats() {
  return casesRepo.getCasesSummaryStats();
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
      const lawyerId = session.assigned_lawyer_id || session.case_lawyer_id;
      const dateText = new Date(session.session_date).toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const notification = NotificationsService.notify({
        userId: lawyerId || null,
        type: 'warning',
        title: 'تذكير بجلسة محكمة قادمة ⚖️',
        message: `قضية رقم (${session.case_number}) - محكمة ${session.court_name} (${session.circuit_name || 'الدائرة'}) | الموعد: ${dateText} | المطلوب: ${session.session_reason || 'حضور المرافعة'}`,
        linkPage: 'cases'
      });

      if (notification) {
        casesRepo.markSessionReminderSent(session.id);
      }
    }
  }
  return due;
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
  if (!data.file_path?.trim()) throw new Error('مسار المستند مطلوب');

  return casesRepo.createDocument(data);
}

function deleteDocument(id) {
  if (!id) throw new Error('معرف المستند مطلوب');
  return casesRepo.deleteDocument(id);
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
  if (!data.amount || Number(data.amount) <= 0) {
    throw new Error('المبلغ يجب أن يكون أكبر من الصفر');
  }

  return casesRepo.createFinancial(data);
}

function deleteFinancial(id) {
  if (!id) throw new Error('معرف الحركة المالية مطلوب');
  return casesRepo.deleteFinancial(id);
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
  if (!data.hours || Number(data.hours) <= 0) throw new Error('عدد الساعات يجب أن يكون أكبر من صفر');
  if (!data.activity_description?.trim()) throw new Error('وصف النشاط القانوني مطلوب');

  return casesRepo.createTimeLog(data);
}

function deleteTimeLog(id) {
  if (!id) throw new Error('معرف سجل الوقت مطلوب');
  return casesRepo.deleteTimeLog(id);
}

module.exports = {
  getAllCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
  getCasesSummaryStats,
  getSessionsByCaseId,
  getAllUpcomingSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  getDailyDocket,
  checkDueCourtSessionReminders,
  getCaseFinancialBreakdown,
  getDocumentsByCaseId,
  createDocument,
  deleteDocument,
  getFinancialsByCaseId,
  createFinancial,
  deleteFinancial,
  getTimeLogsByCaseId,
  createTimeLog,
  deleteTimeLog,
};
