const purchasesService = require('../services/purchases.service');
const { safeHandle } = require('./safeHandle');
const {
  createPurchaseSchema,
  recordSupplierPaymentSchema,
  purchaseFiltersSchema,
  positiveIdSchema,
  positiveLimitSchema,
} = require('../validators/schema');

function registerPurchasesHandlers() {
  safeHandle('purchases:create', createPurchaseSchema, (event, data) => {
    return purchasesService.createPurchase(data);
  });

  safeHandle('purchases:getAll', purchaseFiltersSchema, (event, filters) => {
    return purchasesService.getAllPurchases(filters);
  });

  safeHandle('purchases:getById', positiveIdSchema, (event, id) => {
    return purchasesService.getPurchaseById(id);
  });

  safeHandle('purchases:recordPayment', recordSupplierPaymentSchema, (event, data) => {
    return purchasesService.recordSupplierPayment(data);
  });

  safeHandle('purchases:getAllPayments', positiveLimitSchema.optional(), (event, limit) => {
    return purchasesService.getAllPayments(limit);
  });

  safeHandle('purchases:getSummaryKPIs', () => {
    return purchasesService.getPurchasesSummaryKPIs();
  });
}

module.exports = { registerPurchasesHandlers };
