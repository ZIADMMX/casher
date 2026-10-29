const express = require('express');
const router = express.Router();
const ordersService = require('../electron/services/orders.service');

router.get('/orders', (req, res, next) => {
  try {
    res.json(ordersService.getOrders(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/orders/stats', (req, res, next) => {
  try {
    res.json(ordersService.getOrderStats());
  } catch (err) {
    next(err);
  }
});

router.post('/orders', (req, res, next) => {
  try {
    const { orderData, items } = req.body;
    const newOrder = ordersService.createOrder(orderData, items);
    res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    next(err);
  }
});

router.patch('/orders/status', (req, res, next) => {
  try {
    const { orderId, status, description } = req.body;
    const updatedOrder = ordersService.updateOrderStatus(orderId, status, {}, description);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
