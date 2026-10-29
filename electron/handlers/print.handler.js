const { printReceipt, printBarcodeLabel, printRawEscPos, openCashDrawer, cutPaper } = require('../services/print.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

function registerPrintHandlers() {
  safeHandle('print:receipt', (event, payload) => {
    authService.requireAuth();
    if (payload && payload.sale) {
      return printReceipt(payload.sale, payload.options || {});
    }
    return printReceipt(payload);
  });

  safeHandle('print:raw', (event, payload) => {
    authService.requireAuth();
    const { rawBuffer, options } = payload || {};
    return printRawEscPos(rawBuffer, options);
  });

  safeHandle('print:openCashDrawer', (event, options) => {
    authService.requireAuth();
    return openCashDrawer(options);
  });

  safeHandle('print:getPrinters', async (event) => {
    authService.requireAuth();
    if (event.sender && typeof event.sender.getPrintersAsync === 'function') {
      return await event.sender.getPrintersAsync();
    }
    return [];
  });

  safeHandle('print:cutPaper', (event, options) => {
    authService.requireAuth();
    return cutPaper(options);
  });

  safeHandle('print:barcodeLabel', (event, labelData) => {
    authService.requireAdmin();
    return printBarcodeLabel(labelData);
  });
}

module.exports = { registerPrintHandlers };