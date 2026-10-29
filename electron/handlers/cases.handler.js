const { safeHandle } = require('./safeHandle');
const casesService = require('../services/cases.service');

/**
 * Register Legal Cases IPC Handlers
 */
function registerCasesHandlers() {
  // القضايا
  safeHandle('cases:getAllCases', (event, filters) => {
    return casesService.getAllCases(filters || {});
  });

  safeHandle('cases:getCaseById', (event, id) => {
    return casesService.getCaseById(id);
  });

  safeHandle('cases:createCase', (event, data) => {
    return casesService.createCase(data || {});
  });

  safeHandle('cases:updateCase', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateCase(id, data || {});
  });

  safeHandle('cases:deleteCase', (event, id) => {
    return casesService.deleteCase(id);
  });

  safeHandle('cases:getCasesSummaryStats', () => {
    return casesService.getCasesSummaryStats();
  });

  // الجلسات
  safeHandle('cases:getSessionsByCaseId', (event, caseId) => {
    return casesService.getSessionsByCaseId(caseId);
  });

  safeHandle('cases:getAllUpcomingSessions', (event, filters) => {
    return casesService.getAllUpcomingSessions(filters || {});
  });

  safeHandle('cases:getSessionById', (event, id) => {
    return casesService.getSessionById(id);
  });

  safeHandle('cases:createSession', (event, data) => {
    return casesService.createSession(data || {});
  });

  safeHandle('cases:updateSession', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateSession(id, data || {});
  });

  safeHandle('cases:deleteSession', (event, id) => {
    return casesService.deleteSession(id);
  });

  safeHandle('cases:getDailyDocket', (event, date) => {
    return casesService.getDailyDocket(date);
  });

  safeHandle('cases:checkDueCourtSessionReminders', (event, hoursAhead) => {
    return casesService.checkDueCourtSessionReminders(hoursAhead);
  });

  safeHandle('cases:getCaseFinancialBreakdown', (event, caseId) => {
    return casesService.getCaseFinancialBreakdown(caseId);
  });

  // المستندات
  safeHandle('cases:getDocumentsByCaseId', (event, caseId) => {
    return casesService.getDocumentsByCaseId(caseId);
  });

  safeHandle('cases:createDocument', (event, data) => {
    return casesService.createDocument(data || {});
  });

  safeHandle('cases:deleteDocument', (event, id) => {
    return casesService.deleteDocument(id);
  });

  // الماليات والأمانات
  safeHandle('cases:getFinancialsByCaseId', (event, caseId) => {
    return casesService.getFinancialsByCaseId(caseId);
  });

  safeHandle('cases:createFinancial', (event, data) => {
    return casesService.createFinancial(data || {});
  });

  safeHandle('cases:deleteFinancial', (event, id) => {
    return casesService.deleteFinancial(id);
  });

  // الساعات
  safeHandle('cases:getTimeLogsByCaseId', (event, caseId) => {
    return casesService.getTimeLogsByCaseId(caseId);
  });

  safeHandle('cases:createTimeLog', (event, data) => {
    return casesService.createTimeLog(data || {});
  });

  safeHandle('cases:deleteTimeLog', (event, id) => {
    return casesService.deleteTimeLog(id);
  });
}

module.exports = { registerCasesHandlers };
