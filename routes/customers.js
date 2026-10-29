const express = require('express');
const router = express.Router();
const customersService = require('../electron/services/customers.service');

router.get('/customers', (req, res, next) => {
  try {
    res.json(customersService.getAllCustomersWithStats());
  } catch (err) {
    next(err);
  }
});

router.post('/customers', (req, res, next) => {
  try {
    const id = customersService.addCustomer(req.body);
    res.status(201).json({ success: true, customerId: id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
