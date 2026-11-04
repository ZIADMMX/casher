const { safeHandle } = require('./safeHandle');
const kitchenService = require('../services/kitchen.service');

function registerKitchenHandlers() {
  safeHandle('sales:getKitchenOrders', () => kitchenService.getKitchenOrders());
  safeHandle('sales:updateKitchenOrderStatus', (_event, payload) => (
    kitchenService.updateKitchenOrderStatus(payload)
  ));
}

module.exports = { registerKitchenHandlers };
