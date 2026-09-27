const reportsService = require('../services/reports.service');
const { safeHandle } = require('./safeHandle');
const { reportPeriodSchema } = require('../validators/schema');

function registerReportsHandlers() {
  safeHandle('reports:get', reportPeriodSchema, (event, period) => {
    return reportsService.getFullReport(period);
  });
}

module.exports = { registerReportsHandlers };