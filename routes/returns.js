const express = require('express');
const router = express.Router();
const returnsService = require('../electron/services/returns.service');

router.get('/returns/find-sale/:saleId', (req, res, next) => {
  try {
    const saleId = Number(req.params.saleId);
    if (isNaN(saleId)) {
      return res.status(400).json({ error: 'معرف البيع غير صالح' });
    }
    const data = returnsService.findSale(saleId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/returns/process', (req, res, next) => {
  try {
    const result = returnsService.processReturn(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/returns/recent', (req, res, next) => {
  try {
    res.json(returnsService.getRecentReturns());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
