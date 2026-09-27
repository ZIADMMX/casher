const customersService = require('../services/customers.service');
const { safeHandle } = require('./safeHandle');
const { addCustomerSchema, addManualDebtSchema, customerPaymentSchema, positiveIdSchema } = require('../validators/schema');

function registerCustomersHandlers() {
  safeHandle('customers:add', addCustomerSchema, (event, data) => {
    return customersService.addCustomer(data);
  });

  safeHandle('customers:addManualDebt', addManualDebtSchema, (event, data) => {
    return customersService.addManualDebt(data);
  });

  safeHandle('customers:getAllWithStats', () => {
    return customersService.getAllCustomersWithStats();
  });

  safeHandle('customers:recordPayment', customerPaymentSchema, (event, data) => {
    return customersService.recordCustomerPayment(data);
  });

  safeHandle('customers:getLedger', positiveIdSchema, (event, customerId) => {
    return customersService.getCustomerLedger(customerId);
  });
}

module.exports = { registerCustomersHandlers };