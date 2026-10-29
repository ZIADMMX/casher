const express = require('express');
const router = express.Router();
const leavesService = require('../electron/services/leaves.service');
const {
  createLeaveRequestSchema,
  leaveRequestDecisionSchema,
} = require('../electron/validators/schema');

router.get('/leaves', (req, res, next) => {
  try {
    res.json(leavesService.getLeaveRequests());
  } catch (err) {
    next(err);
  }
});

router.post('/leaves', (req, res, next) => {
  try {
    const body = createLeaveRequestSchema.validate(req.body);
    res.status(201).json(leavesService.createLeaveRequest(body));
  } catch (err) {
    next(err);
  }
});

router.post('/leaves/decision', (req, res, next) => {
  try {
    const body = leaveRequestDecisionSchema.validate(req.body);
    res.json(leavesService.decideLeaveRequest(body));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
