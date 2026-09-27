const returnsService = require('../services/returns.service');
const { safeHandle } = require('./safeHandle');
const { processReturnSchema } = require('../validators/schema');

function registerReturnsHandlers() {
  safeHandle('returns:findSale', (event, saleId) => {
    return returnsService.findSale(saleId);
  });

  safeHandle('returns:process', processReturnSchema, (event, data) => {
    return returnsService.processReturn(data);
  });

  safeHandle('returns:getRecent', () => {
    return returnsService.getRecentReturns();
  });
}

module.exports = { registerReturnsHandlers };