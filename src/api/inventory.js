// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Branches, warehouses, stock transfers and inventory control
import { bridgeMethod } from './bridge.js';

export const getInventoryBranches = bridgeMethod('getInventoryBranches');
export const createInventoryBranch = bridgeMethod('createInventoryBranch');
export const updateInventoryBranch = bridgeMethod('updateInventoryBranch');
export const getInventoryWarehouses = bridgeMethod('getInventoryWarehouses');
export const createInventoryWarehouse = bridgeMethod('createInventoryWarehouse');
export const updateInventoryWarehouse = bridgeMethod('updateInventoryWarehouse');
export const getInventoryStock = bridgeMethod('getInventoryStock');
export const getInventoryMovements = bridgeMethod('getInventoryMovements');
export const getInventoryTransfers = bridgeMethod('getInventoryTransfers');
export const transferInventoryStock = bridgeMethod('transferInventoryStock');
export const adjustInventoryStock = bridgeMethod('adjustInventoryStock');
export const setInventoryReorderLevel = bridgeMethod('setInventoryReorderLevel');
export const countInventoryStock = bridgeMethod('countInventoryStock');
export const getAppointmentResources = bridgeMethod('getAppointmentResources');
export const getAppointmentResource = bridgeMethod('getAppointmentResource');
export const saveAppointmentResource = bridgeMethod('saveAppointmentResource');
export const getAppointmentServices = bridgeMethod('getAppointmentServices');
export const saveAppointmentService = bridgeMethod('saveAppointmentService');
export const getAppointmentHolidays = bridgeMethod('getAppointmentHolidays');
export const saveAppointmentHoliday = bridgeMethod('saveAppointmentHoliday');
export const removeAppointmentHoliday = bridgeMethod('removeAppointmentHoliday');
export const getAppointments = bridgeMethod('getAppointments');
export const createAppointment = bridgeMethod('createAppointment');
export const updateAppointmentStatus = bridgeMethod('updateAppointmentStatus');
export const rescheduleAppointment = bridgeMethod('rescheduleAppointment');
export const getCentralServerConfig = bridgeMethod('getCentralServerConfig');
export const configureCentralServer = bridgeMethod('configureCentralServer');
export const setCentralWarehouse = bridgeMethod('setCentralWarehouse');
export const testCentralServerConnection = bridgeMethod('testCentralServerConnection');
export const getCentralServerFingerprint = bridgeMethod('getCentralServerFingerprint');
export const getReviewPromptStatus = bridgeMethod('getReviewPromptStatus');
export const getMyReview = bridgeMethod('getMyReview');
export const saveMyReview = bridgeMethod('saveMyReview');
export const syncReviews = bridgeMethod('syncReviews');
