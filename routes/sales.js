const express = require('express');
const router = express.Router();
const salesService = require('../electron/services/sales.service');

router.post('/sales', (req, res, next) => {
  try {
    const result = salesService.createSale(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/sales/:id', (req, res, next) => {
  try {
    const saleId = Number(req.params.id);
    if (isNaN(saleId)) {
      return res.status(400).json({ error: 'معرف البيع غير صالح' });
    }
    const sale = salesService.getSaleById(saleId);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
