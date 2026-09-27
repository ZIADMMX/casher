// print.service.js - Added centralized error logging for printer operations
const { BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { logError } = require('../services/logger.service');

function buildReceiptHtml(sale) {
  const rowsHtml = sale.items
    .map((item) => `
      <tr>
        <td>${item.productName}${item.size ? ` (${item.size})` : ''}${item.color ? ` - ${item.color}` : ''}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:left">${item.unitPrice * item.quantity} ج.م</td>
      </tr>`)
    .join('');

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Tahoma, sans-serif; width: 280px; margin: 0; padding: 10px; font-size: 13px; }
      h2 { text-align: center; margin: 0 0 4px; }
      .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      td, th { padding: 4px 0; border-bottom: 1px dashed #ccc; font-size: 12px; }
      .totals td { border: none; font-size: 13px; }
      .totals .grand { font-weight: bold; font-size: 15px; border-top: 1px solid #000; }
      .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #555; }
    </style>
  </head>
  <body>
    <h2>kashiear</h2>
    <div class="sub">فاتورة مبيعات — رقم ${sale.saleId}</div>
    <div class="sub">${sale.customerName || 'عميل نقدي سريع'} · ${new Date().toLocaleString('ar-EG')}</div>

    <table>
      <thead>
        <tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <table class="totals">
      <tr><td>الإجمالي الفرعي</td><td style="text-align:left">${sale.subtotal} ج.م</td></tr>
      <tr><td>الخصم</td><td style="text-align:left">- ${sale.discount} ج.م</td></tr>
      <tr class="grand"><td>الإجمالي المستحق</td><td style="text-align:left">${sale.total} ج.م</td></tr>
    </table>

    <div class="footer">شكرًا لتعامكم معنا 🙏</div>
  </body>
</html>`;
}

function buildBarcodeLabelHtml(variant) {
  const jsbarcodePath = path.join(__dirname, 'JsBarcode.all.min.js');
  const jsbarcodeCode = fs.readFileSync(jsbarcodePath, 'utf-8');
  const code = variant.barcode || variant.sku || '';

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Tahoma, sans-serif; margin: 0; padding: 8px; width: 250px; text-align: center; }
      .p-name { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
      .p-meta { font-size: 10px; color: #333; margin-bottom: 4px; }
      .p-price { font-size: 13px; font-weight: bold; margin-top: 2px; }
      svg { width: 100%; }
    </style>
    <script>${jsbarcodeCode}</script>
  </head>
  <body>
    <div class="p-name">${variant.productName || ''}</div>
    <div class="p-meta">${variant.size || ''} ${variant.color ? '- ' + variant.color : ''}</div>
    <svg id="barcode"></svg>
    <div class="p-price">${variant.selling_price || variant.sellingPrice || ''} ج.م</div>
    <script>
      try {
        JsBarcode("#barcode", "${code}", { format: "CODE128", displayValue: true, fontSize: 12, height: 40 });
      } catch (err) {
        // logError runs in Node context only; inside the renderer we only have console.
        console.error('[BarcodeGeneration]', err);
      }
      window.onload = () => window.print();
    </script>
  </body>
</html>`;
}

function printReceipt(sale) {
  return new Promise((resolve, reject) => {
    let printWindow = null;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (printWindow) {
        try {
          if (typeof printWindow.isDestroyed !== 'function' || !printWindow.isDestroyed()) {
            printWindow.close();
          }
        } catch {}
      }
      printWindow = null;
    };

    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Safety timeout to prevent app hanging if printer driver freezes
      timeoutId = setTimeout(() => {
        cleanup();
        const err = new Error('الطابعة غير متصلة أو استغرقت وقتاً أطول من المتوقع للاستجابة');
        logError('PrintReceiptTimeout', err);
        reject(err);
      }, 20000);

      const html = buildReceiptHtml(sale);
      printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

      printWindow.webContents.on('did-finish-load', () => {
        try {
          printWindow.webContents.print({ silent: false }, (success, errorType) => {
            cleanup();
            if (success) {
              resolve(true);
            } else {
              if (errorType === 'cancelled') {
                resolve(false);
              } else {
                const err = new Error('الطابعة مش متصلة أو لا تستجيب. يرجى التأكد من توصيل الطابعة وتشغيلها');
                logError('PrintReceiptError', err);
                reject(err);
              }
            }
          });
        } catch (err) {
          cleanup();
          const wrapped = new Error('الطابعة مش متصلة أو حدث خطأ أثناء إرسال أمر الطباعة');
          logError('PrintReceiptException', err);
          reject(wrapped);
        }
      });

      printWindow.webContents.on('did-fail-load', () => {
        cleanup();
        const err = new Error('فشل تحميل قالب الفاتورة للطباعة');
        logError('PrintReceiptLoadFail', err);
        reject(err);
      });
    } catch (err) {
      cleanup();
      const wrapped = new Error('تعذر تشغيل نافذة الطباعة: ' + (err.message || 'خطأ غير معروف'));
      logError('PrintReceiptWindow', err);
      reject(wrapped);
    }
  });
}

function printBarcodeLabel(variant) {
  return new Promise((resolve, reject) => {
    let printWindow = null;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (printWindow) {
        try {
          if (typeof printWindow.isDestroyed !== 'function' || !printWindow.isDestroyed()) {
            printWindow.close();
          }
        } catch {}
      }
      printWindow = null;
    };

    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      timeoutId = setTimeout(() => {
        cleanup();
        const err = new Error('طابعة الباركود غير متصلة أو استغرقت وقتاً أطول من المتوقع');
        logError('PrintBarcodeTimeout', err);
        reject(err);
      }, 20000);

      const html = buildBarcodeLabelHtml(variant);
      printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

      printWindow.webContents.on('did-finish-load', () => {
        try {
          printWindow.webContents.print({ silent: false }, (success, errorType) => {
            cleanup();
            if (success) {
              resolve(true);
            } else {
              if (errorType === 'cancelled') {
                resolve(false);
              } else {
                const err = new Error('طابعة الباركود مش متصلة أو لا تستجيب. يرجى التأكد من التوصيل');
                logError('PrintBarcodeError', err);
                reject(err);
              }
            }
          });
        } catch (err) {
          cleanup();
          const wrapped = new Error('طابعة الباركود مش متصلة أو حدث خطأ أثناء إرسال أمر الطباعة');
          logError('PrintBarcodeException', err);
          reject(wrapped);
        }
      });

      printWindow.webContents.on('did-fail-load', () => {
        cleanup();
        const err = new Error('فشل تحميل ملصق الباركود للطباعة');
        logError('PrintBarcodeLoadFail', err);
        reject(err);
      });
    } catch (err) {
      cleanup();
      const wrapped = new Error('تعذر تشغيل نافذة طباعة الباركود: ' + (err.message || 'خطأ غير معروف'));
      logError('PrintBarcodeWindow', err);
      reject(wrapped);
    }
  });
}

module.exports = { printReceipt, printBarcodeLabel, buildReceiptHtml, buildBarcodeLabelHtml };