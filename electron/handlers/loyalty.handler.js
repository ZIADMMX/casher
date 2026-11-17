const { safeHandle } = require('./safeHandle');
const loyalty = require('../services/loyalty.service');

function registerLoyaltyHandlers() {
  safeHandle('loyalty:getSettings', () => loyalty.getSettings());
  safeHandle('loyalty:getCustomerPoints', (event, customerId) => loyalty.getCustomerPoints(customerId));
  safeHandle('loyalty:getHistory', (event, customerId) => loyalty.getHistory(customerId));
  safeHandle('loyalty:adjust', (event, payload) => loyalty.adjust(payload?.customerId, payload?.delta, payload?.note));
}

module.exports = { registerLoyaltyHandlers };
