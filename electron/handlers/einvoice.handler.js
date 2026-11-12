const { safeHandle } = require('./safeHandle');
const einvoiceService = require('../services/einvoice');

// الفاتورة الإلكترونية (مصلحة الضرائب المصرية) — قناة واحدة لكل القطاعات.
function registerEInvoiceHandlers() {
  safeHandle('einvoice:getConfig', () => einvoiceService.getConfig());
  safeHandle('einvoice:saveConfig', (event, data) => einvoiceService.saveConfig(data || {}));

  safeHandle('einvoice:getQueue', (event, filters) => einvoiceService.getQueue(filters || {}));
  safeHandle('einvoice:previewDocument', (event, saleId) => einvoiceService.previewSale(saleId));

  safeHandle('einvoice:submitPending', () => einvoiceService.flush());
  safeHandle('einvoice:resubmitDocument', (event, id) => einvoiceService.resubmit(id));

  safeHandle('einvoice:getItemCodes', (event, filters) => einvoiceService.listItemCodes(filters || {}));
  safeHandle('einvoice:setItemCode', (event, payload) => {
    const { variantId, code } = payload || {};
    return einvoiceService.setItemCode(variantId, code);
  });
}

module.exports = { registerEInvoiceHandlers };
