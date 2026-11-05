// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Shifts & Z-Report
import { bridgeMethod } from './bridge.js';

export const getCurrentShift = bridgeMethod('getCurrentShift');
export const getLastClosedShift = bridgeMethod('getLastClosedShift');
export const openShift = bridgeMethod('openShift');
export const closeShift = bridgeMethod('closeShift');
export const getShiftXReport = bridgeMethod('getShiftXReport');
export const addShiftExpense = bridgeMethod('addShiftExpense');
export const getShiftExpenses = bridgeMethod('getShiftExpenses');
export const getAllShifts = bridgeMethod('getAllShifts');
export const getShiftById = bridgeMethod('getShiftById');
export const getShiftsKPIs = bridgeMethod('getShiftsKPIs');
