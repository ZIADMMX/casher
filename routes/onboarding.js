const express = require('express');
const router = express.Router();
const onboardingService = require('../electron/services/onboarding.service');

router.get('/onboarding/state', (req, res, next) => {
  try {
    res.json({ success: true, data: onboardingService.getOnboardingState() });
  } catch (err) {
    next(err);
  }
});

router.get('/onboarding/presets', (req, res, next) => {
  try {
    res.json({ success: true, data: onboardingService.getPresets() });
  } catch (err) {
    next(err);
  }
});

router.get('/onboarding/presets/:sectorKey', (req, res, next) => {
  try {
    const { sectorKey } = req.params;
    res.json({ success: true, data: onboardingService.getPresetByKey(sectorKey) });
  } catch (err) {
    next(err);
  }
});

router.post('/onboarding/preview', (req, res, next) => {
  try {
    const preview = onboardingService.previewCustomizedCatalog(req.body);
    res.json({ success: true, data: preview });
  } catch (err) {
    next(err);
  }
});

router.post('/onboarding/provision', (req, res, next) => {
  try {
    const summary = onboardingService.provisionSectorData(req.body, { username: 'api_admin' });
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

router.post('/onboarding/reset', (req, res, next) => {
  try {
    const result = onboardingService.resetOnboarding({ username: 'api_admin' });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
