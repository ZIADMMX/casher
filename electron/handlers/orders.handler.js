const { safeHandle } = require('./safeHandle');
const ordersService = require('../services/orders.service');

function registerOrdersHandlers() {
  safeHandle('orders:getAll', (event, filters) => {
    return ordersService.getOrders(filters);
  });

  safeHandle('orders:getById', (event, orderId) => {
    return ordersService.getOrderById(orderId);
  });

  safeHandle('orders:addItem', (event, payload) => {
    const { orderId, item } = payload || {};
    return ordersService.addOrderItem(orderId, item);
  });

  safeHandle('orders:create', (event, payload) => {
    const { orderData, items } = payload || {};
    return ordersService.createOrder(orderData, items);
  });

  safeHandle('orders:updateStatus', (event, payload) => {
    const { orderId, status, description } = payload || {};
    return ordersService.updateOrderStatus(orderId, status, {}, description);
  });

  safeHandle('orders:assign', (event, payload) => {
    const { orderId, assignedUserId } = payload || {};
    return ordersService.assignOrder(orderId, assignedUserId, {});
  });

  safeHandle('orders:addComment', (event, payload) => {
    const { orderId, comment } = payload || {};
    return ordersService.addOrderComment(orderId, comment, {});
  });

  safeHandle('orders:addAttachment', (event, payload) => {
    const { orderId, attachmentData } = payload || {};
    return ordersService.addOrderAttachment(orderId, attachmentData, {});
  });

  safeHandle('orders:getStats', () => {
    return ordersService.getOrderStats();
  });
}

module.exports = { registerOrdersHandlers };
