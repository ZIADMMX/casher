const reportsService = require('../services/reports.service');
const { safeHandle } = require('./safeHandle');
const { reportPeriodSchema, reportLedgerQuerySchema } = require('../validators/schema');

// Read-only: reports never write. The numbers come from the sales ledger,
// which the database itself keeps append-only (see migrations/salesLedger.js).
function registerReportsHandlers() {
  safeHandle('reports:get', reportPeriodSchema, (event, period) => {
    return reportsService.getFullReport(period);
  });

  safeHandle('reports:getInvoices', reportLedgerQuerySchema, (event, query) => {
    return reportsService.getInvoicesPage(query);
  });

  safeHandle('reports:getLegalCases', reportPeriodSchema, (event, period) => {
    return reportsService.getLegalCaseReport(period);
  });
}

module.exports = { registerReportsHandlers };