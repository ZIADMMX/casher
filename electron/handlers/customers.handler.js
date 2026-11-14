const customersService = require('../services/customers.service');
const { safeHandle } = require('./safeHandle');
const webhooks = require('../services/webhooks.service');
const { addCustomerSchema, addManualDebtSchema, customerPaymentSchema, positiveIdSchema } = require('../validators/schema');

function registerCustomersHandlers() {
  safeHandle('customers:add', addCustomerSchema, async (event, data) => {
    const customer = await customersService.addCustomer(data);
    webhooks.dispatch('customer.created', customer);
    return customer;
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

  safeHandle('customers:getRecentSales', positiveIdSchema, (event, customerId) => {
    return customersService.getCustomerRecentSales(customerId);
  });
}

module.exports = { registerCustomersHandlers };