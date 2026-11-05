// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Supermarket & Grocery APIs
import { bridgeMethod } from './bridge.js';

export const resolveGroceryBarcode = bridgeMethod('resolveGroceryBarcode');
export const parseGroceryScaleBarcode = bridgeMethod('parseGroceryScaleBarcode');
export const parseGroceryQuickMultiplier = bridgeMethod('parseGroceryQuickMultiplier');
export const getGroceryUnits = bridgeMethod('getGroceryUnits');
export const getGroceryUnitByBarcode = bridgeMethod('getGroceryUnitByBarcode');
export const createGroceryUnit = bridgeMethod('createGroceryUnit');
export const updateGroceryUnit = bridgeMethod('updateGroceryUnit');
export const deleteGroceryUnit = bridgeMethod('deleteGroceryUnit');
export const getGroceryBatches = bridgeMethod('getGroceryBatches');
export const createGroceryBatch = bridgeMethod('createGroceryBatch');
export const getGroceryExpiringBatches = bridgeMethod('getGroceryExpiringBatches');
export const getGroceryExpiredBatches = bridgeMethod('getGroceryExpiredBatches');
export const getGroceryExpirySummary = bridgeMethod('getGroceryExpirySummary');
export const getGroceryScaleConfig = bridgeMethod('getGroceryScaleConfig');
export const saveGroceryScaleConfig = bridgeMethod('saveGroceryScaleConfig');
export const getGrocerySpeedKeys = bridgeMethod('getGrocerySpeedKeys');
export const createGrocerySpeedKey = bridgeMethod('createGrocerySpeedKey');
export const deleteGrocerySpeedKey = bridgeMethod('deleteGrocerySpeedKey');
