const { printReceipt, printBarcodeLabel } = require('../services/print.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

function registerPrintHandlers() {
  safeHandle('print:receipt', (event, sale) => {
    authService.requireAuth();
    return printReceipt(sale);
  });

  safeHandle('print:barcodeLabel', (event, labelData) => {
    authService.requireAdmin();
    return printBarcodeLabel(labelData);
  });
}

module.exports = { registerPrintHandlers };