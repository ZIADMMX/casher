const { safeHandle } = require('./safeHandle');
const webhooks = require('../services/webhooks.service');
const { createSaleSchema } = require('../validators/schema');
const salesService = require('../services/sales.service');
const bundlePromotionsService = require('../services/bundlePromotions.service');
const authService = require('../services/auth.service');

function registerSalesHandlers() {
  safeHandle('sales:create', createSaleSchema, async (event, saleData) => {
    const sale = await salesService.createSale(saleData);
    webhooks.dispatch('sale.created', sale);
    return sale;
  });

  safeHandle('sales:getById', (event, saleId) => {
    return salesService.getSaleById(saleId);
  });

  safeHandle('sales:previewBundlePromotion', (_event, items) => {
    authService.requireAuth();
    return bundlePromotionsService.previewBundlePromotions(items);
  });
}

module.exports = { registerSalesHandlers };
