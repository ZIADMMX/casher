// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Suppliers & Purchases
import { bridgeMethod } from './bridge.js';

export const addSupplier = bridgeMethod('addSupplier');
export const updateSupplier = bridgeMethod('updateSupplier');
export const deleteSupplier = bridgeMethod('deleteSupplier');
export const getAllSuppliersWithStats = bridgeMethod('getAllSuppliersWithStats');
export const getSupplierLedger = bridgeMethod('getSupplierLedger');
export const createPurchase = bridgeMethod('createPurchase');
export const getAllPurchases = bridgeMethod('getAllPurchases');
export const getPurchaseById = bridgeMethod('getPurchaseById');
export const recordSupplierPayment = bridgeMethod('recordSupplierPayment');
export const getAllSupplierPayments = bridgeMethod('getAllSupplierPayments');
export const getPurchasesSummaryKPIs = bridgeMethod('getPurchasesSummaryKPIs');
