// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Attendance & leave
import { bridgeMethod } from './bridge.js';

export const getAttendanceByDate = bridgeMethod('getAttendanceByDate');
export const getMyAttendanceStatus = bridgeMethod('getMyAttendanceStatus');
export const getAttendanceSummary30Days = bridgeMethod('getAttendanceSummary30Days');
export const updateAttendanceSchedule = bridgeMethod('updateAttendanceSchedule');
export const checkInEmployee = bridgeMethod('checkInEmployee');
export const checkOutEmployee = bridgeMethod('checkOutEmployee');
export const getLeaveRequests = bridgeMethod('getLeaveRequests');
export const createLeaveRequest = bridgeMethod('createLeaveRequest');
export const decideLeaveRequest = bridgeMethod('decideLeaveRequest');
