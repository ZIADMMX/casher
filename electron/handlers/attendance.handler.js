const attendanceService = require('../services/attendance.service');
const { safeHandle } = require('./safeHandle');
const {
  attendanceActionSchema,
  attendanceDateSchema,
  attendanceScheduleSchema,
} = require('../validators/schema');

function registerAttendanceHandlers() {
  safeHandle('attendance:getMyTodayStatus', () => attendanceService.getMyTodayStatus());

  safeHandle('attendance:getLast30DaysSummary', () => attendanceService.getLast30DaysSummary());

  safeHandle('attendance:getByDate', attendanceDateSchema, (event, date) => (
    attendanceService.getAttendanceForDate(date)
  ));

  safeHandle('attendance:updateSchedule', attendanceScheduleSchema, (event, data) => (
    attendanceService.updateSchedule(data)
  ));

  safeHandle('attendance:checkIn', attendanceActionSchema, (event, data) => (
    attendanceService.checkIn(data)
  ));

  safeHandle('attendance:checkOut', attendanceActionSchema, (event, data) => (
    attendanceService.checkOut(data)
  ));
}

module.exports = { registerAttendanceHandlers };
