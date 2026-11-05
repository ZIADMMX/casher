// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Customers
import { bridgeMethod } from './bridge.js';

export const getAllCustomersWithStats = bridgeMethod('getAllCustomersWithStats');
export const addCustomer = bridgeMethod('addCustomer');
export const addManualDebt = bridgeMethod('addManualDebt');
export const recordCustomerPayment = bridgeMethod('recordCustomerPayment');
export const getCustomerLedger = bridgeMethod('getCustomerLedger');
