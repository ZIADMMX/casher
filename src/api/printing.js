// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Printing & cash drawer
import { bridgeMethod } from './bridge.js';

export const printReceipt = bridgeMethod('printReceipt');
export const openCashDrawer = bridgeMethod('openCashDrawer');
export const getPrinters = bridgeMethod('getPrinters');
export const printRaw = bridgeMethod('printRaw');
export const cutPaper = bridgeMethod('cutPaper');
export const printBarcodeLabel = bridgeMethod('printBarcodeLabel');
