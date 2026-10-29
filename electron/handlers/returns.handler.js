const returnsService = require('../services/returns.service');
const { safeHandle } = require('./safeHandle');
const { processReturnSchema, positiveIdSchema } = require('../validators/schema');

function registerReturnsHandlers() {
  safeHandle('returns:findSale', positiveIdSchema, (_event, saleId) => {
    return returnsService.findSale(saleId);
  });

  safeHandle('returns:process', processReturnSchema, (_event, data) => {
    return returnsService.processReturn(data);
  });

  safeHandle('returns:getRecent', () => {
    return returnsService.getRecentReturns();
  });
}

module.exports = { registerReturnsHandlers };