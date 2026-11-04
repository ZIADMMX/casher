const { safeHandle } = require('./safeHandle');
const casesService = require('../services/cases.service');
const authService = require('../services/auth.service');
const { dialog, BrowserWindow } = require('electron');
const path = require('node:path');
const {
  positiveIdSchema,
  createCustomerPowerOfAttorneySchema,
  updateCustomerPowerOfAttorneySchema,
} = require('../validators/schema');

/**
 * Register Legal Cases IPC Handlers
 */
function registerCasesHandlers() {
  // القضايا
  safeHandle('cases:getCaseLawyers', () => {
    return casesService.getCaseLawyers();
  });

  safeHandle('cases:getAllCases', (event, filters) => {
    return casesService.getAllCases(filters || {});
  });

  safeHandle('cases:getCaseById', (event, id) => {
    return casesService.getCaseById(id);
  });

  safeHandle('cases:createCase', (event, data) => {
    return casesService.createCase({ ...(data || {}), user_id: authService.getCurrentSession()?.id || null });
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

  safeHandle('cases:getCasesByClientId', positiveIdSchema, (event, clientId) => {
    return casesService.getCasesByClientId(clientId);
  });

  safeHandle('cases:getLegalClientInteractions', positiveIdSchema, (event, customerId) => {
    return casesService.getLegalClientInteractions(customerId);
  });

  safeHandle('cases:addLegalClientInteraction', (event, data) => {
    return casesService.addLegalClientInteraction(data || {}, {
      id: authService.getCurrentSession()?.id || null,
    });
  });

  safeHandle('cases:getCustomerPowerOfAttorneys', positiveIdSchema, (event, customerId) => {
    return casesService.getCustomerPowerOfAttorneys(customerId);
  });

  safeHandle('cases:createCustomerPowerOfAttorney', createCustomerPowerOfAttorneySchema, (event, payload) => {
    const { customerId, data } = payload || {};
    return casesService.createCustomerPowerOfAttorney(
      customerId,
      data || {},
      authService.getCurrentSession()?.id || null
    );
  });

  safeHandle('cases:updateCustomerPowerOfAttorney', updateCustomerPowerOfAttorneySchema, (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateCustomerPowerOfAttorney(id, data || {});
  });

  safeHandle('cases:deleteCustomerPowerOfAttorney', positiveIdSchema, (event, id) => {
    return casesService.deleteCustomerPowerOfAttorney(id);
  });

  safeHandle('cases:getLawFirmDashboard', (event, date) => {
    return casesService.getLawFirmDashboard(date);
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

  safeHandle('cases:getTasksByCaseId', positiveIdSchema, (event, caseId) => {
    return casesService.getTasksByCaseId(caseId);
  });

  safeHandle('cases:createTask', (event, data) => {
    return casesService.createCaseTask(data || {}, authService.getCurrentSession()?.id || null);
  });

  safeHandle('cases:updateTask', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateCaseTask(id, data || {});
  });

  safeHandle('cases:deleteTask', positiveIdSchema, (event, id) => {
    return casesService.deleteCaseTask(id);
  });

  safeHandle('cases:getCaseFinancialBreakdown', (event, caseId) => {
    return casesService.getCaseFinancialBreakdown(caseId);
  });

  safeHandle('cases:printFinancialReceipt', async (event, financialId) => {
    const receiptService = require('../services/caseReceipt.service');
    const html = receiptService.getReceiptHtml(financialId);
    const receiptWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    try {
      await receiptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return await new Promise((resolve, reject) => {
        receiptWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            if (!success && failureReason && failureReason !== 'cancelled') {
              reject(new Error(`تعذرت طباعة الإيصال: ${failureReason}`));
              return;
            }
            resolve({ printed: success });
          }
        );
      });
    } finally {
      if (!receiptWindow.isDestroyed()) receiptWindow.close();
    }
  });

  // المستندات
  safeHandle('cases:getDocumentsByCaseId', (event, caseId) => {
    return casesService.getDocumentsByCaseId(caseId);
  });

  safeHandle('cases:selectDocumentFile', async (event) => {
    const options = {
      title: 'اختيار مستند للقضية',
      properties: ['openFile'],
      filters: [{
        name: 'مستندات وملفات',
        extensions: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'rtf', 'txt'],
      }],
    };
    const parent = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const selectedPath = result.filePaths[0];
    return { canceled: false, source_path: selectedPath, file_name: path.basename(selectedPath) };
  });

  safeHandle('cases:createDocument', (event, data) => {
    return casesService.createDocument({ ...(data || {}), uploaded_by: authService.getCurrentSession()?.id || null });
  });

  safeHandle('cases:updateDocument', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateDocument(id, {
      ...(data || {}),
      uploaded_by: authService.getCurrentSession()?.id || null,
    });
  });

  safeHandle('cases:deleteDocument', (event, id) => {
    return casesService.deleteDocument(id);
  });

  safeHandle('cases:getDocumentVersions', (event, id) => casesService.getDocumentVersions(id));
  safeHandle('cases:openDocument', (event, payload) => {
    const { id, version } = payload || {};
    return casesService.openDocument(id, version);
  });
  safeHandle('cases:restoreDocumentVersion', (event, payload) => {
    const { id, version } = payload || {};
    return casesService.restoreDocumentVersion(id, version, authService.getCurrentSession()?.id || null);
  });
  safeHandle('cases:downloadDocument', async (event, payload) => {
    const { id, version, fileName } = payload || {};
    if (!id || typeof fileName !== 'string' || !fileName.trim()) {
      throw new Error('بيانات تنزيل المستند غير مكتملة');
    }
    const options = {
      title: 'تنزيل نسخة من مستند القضية',
      defaultPath: path.basename(fileName),
    };
    const parent = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    return casesService.downloadDocument(id, result.filePath, version);
  });

  // الماليات والأمانات
  safeHandle('cases:getFinancialsByCaseId', (event, caseId) => {
    return casesService.getFinancialsByCaseId(caseId);
  });

  safeHandle('cases:createFinancial', (event, data) => {
    return casesService.createFinancial(data || {});
  });

  safeHandle('cases:updateFinancial', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateFinancial(id, data || {});
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

  safeHandle('cases:updateTimeLog', (event, payload) => {
    const { id, data } = payload || {};
    return casesService.updateTimeLog(id, data || {});
  });

  safeHandle('cases:deleteTimeLog', (event, id) => {
    return casesService.deleteTimeLog(id);
  });
}

module.exports = { registerCasesHandlers };
