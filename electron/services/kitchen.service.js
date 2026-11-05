const kitchenRepo = require('../repositories/kitchen.repository');
const { requireAuth, getCurrentSession } = require('./auth.service');
const { checkTransition } = require('./kitchenFlow');

function getKitchenOrders() {
  requireAuth();
  return kitchenRepo.getOrders();
}

// One step forward, or undo the last step within two minutes. Anything else is refused.
function updateKitchenOrderStatus({ saleId, status } = {}) {
  requireAuth();
  const parsedSaleId = Number(saleId);
  if (!Number.isSafeInteger(parsedSaleId) || parsedSaleId <= 0) {
    throw new Error('رقم الطلب غير صالح');
  }
  const order = kitchenRepo.getOrderState(parsedSaleId);
  if (!order) throw new Error('طلب المطبخ غير موجود أو ليس من طلبات اليوم');

  const lastChange = kitchenRepo.getLastChange(parsedSaleId);
  checkTransition(order.kitchen_status, status, lastChange);
  const session = getCurrentSession();
  return kitchenRepo.moveOrder(parsedSaleId, order.kitchen_status, status, session?.id);
}

module.exports = { getKitchenOrders, updateKitchenOrderStatus };
