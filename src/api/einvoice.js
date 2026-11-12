// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Egyptian e-invoice
import { bridgeMethod } from './bridge.js';

export const getEInvoiceConfig = bridgeMethod('getEInvoiceConfig');
export const saveEInvoiceConfig = bridgeMethod('saveEInvoiceConfig');
export const getEInvoiceQueue = bridgeMethod('getEInvoiceQueue');
export const previewEInvoiceDocument = bridgeMethod('previewEInvoiceDocument');
export const submitPendingEInvoices = bridgeMethod('submitPendingEInvoices');
export const resubmitEInvoiceDocument = bridgeMethod('resubmitEInvoiceDocument');
export const getEInvoiceItemCodes = bridgeMethod('getEInvoiceItemCodes');
export const setEInvoiceItemCode = bridgeMethod('setEInvoiceItemCode');
