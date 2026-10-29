const express = require('express');
const router = express.Router();
const commissionsService = require('../electron/services/commissions.service');

router.get('/commissions/rules', (req, res, next) => {
  try {
    res.json(commissionsService.getAllRules());
  } catch (err) {
    next(err);
  }
});

router.post('/commissions/rules', (req, res, next) => {
  try {
    const rule = commissionsService.createRule(req.body);
    res.status(201).json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.get('/commissions/earnings', (req, res, next) => {
  try {
    res.json(commissionsService.getAllEarnings(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/commissions/summary', (req, res, next) => {
  try {
    res.json(commissionsService.getSummaryKPIs());
  } catch (err) {
    next(err);
  }
});

router.post('/commissions/payout', (req, res, next) => {
  try {
    const { userId, amount, paymentMethod, notes } = req.body;
    const payoutId = commissionsService.payoutEarnings(userId, amount, paymentMethod, notes);
    res.json({ success: true, payoutId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
