const returnsService = require('../services/returns.service');
const { safeHandle } = require('./safeHandle');
const webhooks = require('../services/webhooks.service');
const { processReturnSchema, positiveIdSchema } = require('../validators/schema');

function registerReturnsHandlers() {
  safeHandle('returns:findSale', positiveIdSchema, (_event, saleId) => {
    return returnsService.findSale(saleId);
  });

  safeHandle('returns:process', processReturnSchema, async (_event, data) => {
    const result = await returnsService.processReturn(data);
    webhooks.dispatch('return.processed', result);
    return result;
  });

  safeHandle('returns:getRecent', () => {
    return returnsService.getRecentReturns();
  });
}

module.exports = { registerReturnsHandlers };