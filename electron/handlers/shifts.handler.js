const shiftsService = require('../services/shifts.service');
const { safeHandle } = require('./safeHandle');
const {
  shiftOpenSchema,
  shiftCloseSchema,
  shiftExpenseSchema,
  shiftFiltersSchema,
  positiveIdSchema,
} = require('../validators/schema');

function registerShiftsHandlers() {
  safeHandle('shifts:getCurrent', () => {
    return shiftsService.getCurrentShift();
  });

  safeHandle('shifts:getLastClosed', () => {
    return shiftsService.getLastClosedShift();
  });

  safeHandle('shifts:open', shiftOpenSchema, (event, data) => {
    return shiftsService.openShift(data);
  });

  safeHandle('shifts:close', shiftCloseSchema, (event, data) => {
    return shiftsService.closeShift(data);
  });

  safeHandle('shifts:getXReport', positiveIdSchema.optional(), (event, shiftId) => {
    return shiftsService.getShiftXReport(shiftId);
  });

  safeHandle('shifts:addExpense', shiftExpenseSchema, (event, data) => {
    return shiftsService.addShiftExpense(data);
  });

  safeHandle('shifts:getExpenses', positiveIdSchema.optional(), (event, shiftId) => {
    return shiftsService.getShiftExpenses(shiftId);
  });

  safeHandle('shifts:getAll', shiftFiltersSchema, (event, filters) => {
    return shiftsService.getAllShifts(filters);
  });

  safeHandle('shifts:getById', positiveIdSchema, (event, shiftId) => {
    return shiftsService.getShiftById(shiftId);
  });

  safeHandle('shifts:getKPIs', () => {
    return shiftsService.getShiftsKPIs();
  });
}

module.exports = { registerShiftsHandlers };
