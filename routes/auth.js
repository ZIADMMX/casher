const express = require('express');
const router = express.Router();
const authService = require('../electron/services/auth.service');

router.get('/auth/profile', (req, res, next) => {
  try {
    authService.requireAuth();
    res.json({ profile: authService.getMyProfile() });
  } catch (err) {
    next(err);
  }
});

router.put('/auth/profile', (req, res, next) => {
  try {
    authService.requireAuth();
    res.json({ profile: authService.saveMyProfile(req.body) });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', (req, res, next) => {
  try {
    const { username, password } = req.body;
    const session = authService.login(username, password);
    res.json({ success: true, session });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res, next) => {
  try {
    authService.logout();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/session', (req, res, next) => {
  try {
    res.json({ session: authService.getCurrentSession() });
  } catch (err) {
    next(err);
  }
});

router.get('/users', (req, res, next) => {
  try {
    res.json(authService.getAllUsers());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
