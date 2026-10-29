const express = require('express');
const router = express.Router();
const subscriptionsService = require('../electron/services/subscriptions.service');

router.get('/packages', (req, res, next) => {
  try {
    res.json(subscriptionsService.getAllPackages());
  } catch (err) {
    next(err);
  }
});

router.post('/packages', (req, res, next) => {
  try {
    const newPackage = subscriptionsService.createPackage(req.body);
    res.status(201).json({ success: true, package: newPackage });
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions', (req, res, next) => {
  try {
    res.json(subscriptionsService.getAllSubscriptions(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions/stats', (req, res, next) => {
  try {
    res.json(subscriptionsService.getSubscriptionStats());
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions', (req, res, next) => {
  try {
    const sub = subscriptionsService.subscribeCustomer(req.body);
    res.status(201).json({ success: true, subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/freeze', (req, res, next) => {
  try {
    const { subscriptionId, reason } = req.body;
    const result = subscriptionsService.freezeSubscription(subscriptionId, reason);
    res.json({ success: true, subscription: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
