const express = require('express');
const router = express.Router();
const authService = require('../electron/services/auth.service');
const reportsService = require('../electron/services/reports.service');
const notificationsService = require('../electron/services/notifications.service');
const settingsRepo = require('../electron/repositories/settings.repository');
const resilienceService = require('../electron/services/resilience.service');

router.get('/reports', (req, res, next) => {
  try {
    const period = req.query.period || 'today';
    if (!authService.getCurrentSession()) {
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }
    res.json(reportsService.getFullReport(period));
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 20;
    res.json(notificationsService.getAll({ limit }));
  } catch (err) {
    next(err);
  }
});

router.get('/settings', (req, res, next) => {
  try {
    res.json(settingsRepo.getAll());
  } catch (err) {
    next(err);
  }
});

router.get('/system/health', (req, res, next) => {
  try {
    res.json(resilienceService.getSystemBackboneHealth());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
