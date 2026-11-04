const kitchenRepo = require('../repositories/kitchen.repository');
const { requireAuth } = require('./auth.service');

const KITCHEN_STATUSES = new Set(['new', 'preparing', 'ready', 'served']);

function getKitchenOrders() {
  requireAuth();
  return kitchenRepo.getOrders();
}

function updateKitchenOrderStatus({ saleId, status } = {}) {
  requireAuth();
  const parsedSaleId = Number(saleId);
  if (!Number.isSafeInteger(parsedSaleId) || parsedSaleId <= 0) {
    throw new Error('رقم الطلب غير صالح');
  }
  if (!KITCHEN_STATUSES.has(status)) {
    throw new Error('حالة طلب المطبخ غير صالحة');
  }
  return kitchenRepo.updateOrderStatus(parsedSaleId, status);
}

module.exports = { getKitchenOrders, updateKitchenOrderStatus };
