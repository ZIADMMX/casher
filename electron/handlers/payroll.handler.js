const { safeHandle } = require('./safeHandle');
const payrollService = require('../services/payroll.service');

function registerPayrollHandlers() {
  safeHandle('payroll:getAllPeriods', () => {
    return payrollService.getAllPayrollPeriods();
  });

  safeHandle('payroll:getDetails', (event, periodId) => {
    return payrollService.getPayrollDetails(periodId);
  });

  safeHandle('payroll:generatePeriod', (event, payload) => {
    return payrollService.generatePayrollPeriod(payload || {});
  });

  safeHandle('payroll:previewPeriod', (event, payload) => {
    return payrollService.previewPayrollPeriod(payload || {});
  });

  safeHandle('payroll:payPeriod', (event, payload) => {
    const { periodId, paymentData } = payload || {};
    return payrollService.payPayrollPeriod(periodId, paymentData || {});
  });

  safeHandle('payroll:payEmployee', (event, payload) => {
    const { itemId, paymentData } = payload || {};
    return payrollService.payEmployeeSalary(itemId, paymentData || {});
  });

  safeHandle('payroll:approvePeriod', (event, periodId) => {
    return payrollService.approvePayrollPeriod(periodId);
  });

  safeHandle('payroll:deletePeriod', (event, periodId) => {
    return payrollService.deletePayrollPeriod(periodId);
  });

  safeHandle('payroll:getAllAdvances', (event, userId) => {
    return payrollService.getAllAdvances(userId);
  });

  safeHandle('payroll:createAdvance', (event, advanceData) => {
    return payrollService.createAdvance(advanceData || {});
  });
}

module.exports = { registerPayrollHandlers };
