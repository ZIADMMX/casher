const { safeHandle } = require('./safeHandle');
const delivery = require('../services/delivery.service');

function registerDeliveryHandlers() {
  safeHandle('delivery:getOrders', (event, status) => delivery.getOrders(status));
  safeHandle('delivery:getInboxInfo', () => delivery.getInboxInfo());
  safeHandle('delivery:addOrder', (event, payload) => delivery.receive(payload, 'manual'));
  safeHandle('delivery:updateOrderDetails', (event, payload) => delivery.updateDetails(payload?.id, payload?.data));
  safeHandle('delivery:acceptOrder', (event, payload) => delivery.accept(payload?.id, payload?.mappings));
  safeHandle('delivery:rejectOrder', (event, payload) => delivery.reject(payload?.id, payload?.reason));
}

module.exports = { registerDeliveryHandlers };
