const express = require('express');
const router = express.Router();
const shiftsService = require('../electron/services/shifts.service');

router.get('/shifts/current', (req, res, next) => {
  try {
    const shift = shiftsService.getCurrentShift();
    res.json(shift || { message: 'No open shift currently' });
  } catch (err) {
    next(err);
  }
});

router.post('/shifts/open', (req, res, next) => {
  try {
    const result = shiftsService.openShift(req.body);
    res.status(201).json({ success: true, shift: result });
  } catch (err) {
    next(err);
  }
});

router.post('/shifts/close', (req, res, next) => {
  try {
    const result = shiftsService.closeShift(req.body);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

router.post('/shifts/expenses', (req, res, next) => {
  try {
    const result = shiftsService.addShiftExpense(req.body);
    res.status(201).json({ success: true, expenseId: result });
  } catch (err) {
    next(err);
  }
});

router.get('/shifts/kpis', (req, res, next) => {
  try {
    res.json(shiftsService.getShiftsKPIs());
  } catch (err) {
    next(err);
  }
});

router.get('/shifts', (req, res, next) => {
  try {
    res.json(shiftsService.getAllShifts(req.query));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
