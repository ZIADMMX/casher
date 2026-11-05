const { safeHandle } = require('./safeHandle');
const kitchenService = require('../services/kitchen.service');
const { kitchenStatusSchema } = require('../validators/schema');

function registerKitchenHandlers() {
  safeHandle('sales:getKitchenOrders', () => kitchenService.getKitchenOrders());
  safeHandle('sales:updateKitchenOrderStatus', kitchenStatusSchema, (_event, payload) => (
    kitchenService.updateKitchenOrderStatus(payload)
  ));
}

module.exports = { registerKitchenHandlers };
