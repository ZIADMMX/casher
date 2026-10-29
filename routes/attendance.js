const express = require('express');
const router = express.Router();
const attendanceService = require('../electron/services/attendance.service');
const {
  attendanceActionSchema,
  attendanceDateSchema,
  attendanceScheduleSchema,
} = require('../electron/validators/schema');

router.get('/attendance', (req, res, next) => {
  try {
    const date = attendanceDateSchema.validate(req.query.date);
    res.json(attendanceService.getAttendanceForDate(date));
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/me/today', (req, res, next) => {
  try {
    res.json(attendanceService.getMyTodayStatus());
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/summary-30-days', (req, res, next) => {
  try {
    res.json(attendanceService.getLast30DaysSummary());
  } catch (err) {
    next(err);
  }
});

router.post('/attendance/schedule', (req, res, next) => {
  try {
    const body = attendanceScheduleSchema.validate(req.body);
    res.json(attendanceService.updateSchedule(body));
  } catch (err) {
    next(err);
  }
});

router.post('/attendance/check-in', (req, res, next) => {
  try {
    const body = attendanceActionSchema.validate(req.body);
    res.json(attendanceService.checkIn(body));
  } catch (err) {
    next(err);
  }
});

router.post('/attendance/check-out', (req, res, next) => {
  try {
    const body = attendanceActionSchema.validate(req.body);
    res.json(attendanceService.checkOut(body));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
