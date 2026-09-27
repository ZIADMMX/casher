const { safeHandle } = require('./safeHandle');
const { createSaleSchema } = require('../validators/schema');
const salesService = require('../services/sales.service');

function registerSalesHandlers() {
  safeHandle('sales:create', createSaleSchema, (event, saleData) => {
    return salesService.createSale(saleData);
  });

  safeHandle('sales:getById', (event, saleId) => {
    return salesService.getSaleById(saleId);
  });
}

module.exports = { registerSalesHandlers };
