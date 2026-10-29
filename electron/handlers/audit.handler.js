const auditService = require('../services/audit.service');
const { safeHandle } = require('./safeHandle');

function registerAuditHandlers() {
  safeHandle('audit:getLogs', (event, filters) => {
    return auditService.getAuditLogs(filters || {});
  });

  safeHandle('audit:getCashierSummary', (event, userId) => {
    return auditService.getCashierSummary(userId);
  });

  safeHandle('audit:logClientAction', (event, data) => {
    return auditService.logClientAction(data || {});
  });
}

module.exports = { registerAuditHandlers };
