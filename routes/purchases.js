const express = require('express');
const router = express.Router();
const purchasesService = require('../electron/services/purchases.service');

router.get('/purchases', (req, res, next) => {
  try {
    res.json(purchasesService.getAllPurchases(req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/purchases', (req, res, next) => {
  try {
    const result = purchasesService.createPurchase(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/purchases/payment', (req, res, next) => {
  try {
    const result = purchasesService.recordPayment(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
