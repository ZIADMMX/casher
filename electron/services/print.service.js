const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { BrowserWindow } = require('electron');
const { logError } = require('./logger.service');

// Receipt header when the shop has not set its own name in settings.
const DEFAULT_RECEIPT_TITLE = 'foxcloud POS';

function resolveStoreName(options = {}) {
  if (options.storeName && String(options.storeName).trim()) return String(options.storeName).trim();
  try {
    const configured = require('../repositories/settings.repository').get('store_name');
    if (configured && String(configured).trim()) return String(configured).trim();
  } catch (error) {
    logError('ResolveStoreName', error);
  }
  return DEFAULT_RECEIPT_TITLE;
}

// ESC/POS Commands Set (RAW Thermal Printer Command Protocol)
const ESC_POS = {
  INIT: Buffer.from([0x1B, 0x40]),                        // ESC @ (Initialize printer)
  ALIGN_LEFT: Buffer.from([0x1B, 0x61, 0x00]),          // ESC a 0 (Left align)
  ALIGN_CENTER: Buffer.from([0x1B, 0x61, 0x01]),        // ESC a 1 (Center align)
  ALIGN_RIGHT: Buffer.from([0x1B, 0x61, 0x02]),         // ESC a 2 (Right align)
  BOLD_ON: Buffer.from([0x1B, 0x45, 0x01]),             // ESC E 1 (Bold ON)
  BOLD_OFF: Buffer.from([0x1B, 0x45, 0x00]),            // ESC E 0 (Bold OFF)
  TXT_NORMAL: Buffer.from([0x1D, 0x21, 0x00]),          // GS ! 0 (Normal text)
  TXT_LARGE: Buffer.from([0x1D, 0x21, 0x11]),           // GS ! 0x11 (Double height & width)
  FEED_3_LINES: Buffer.from([0x1B, 0x64, 0x03]),       // ESC d 3 (Feed 3 lines)

  // RJ11 Pulse Signal for Opening Cash Drawer:
  CASH_DRAWER_PULSE_PIN2: Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]), // ESC p 0 25 250 (Pin 2)
  CASH_DRAWER_PULSE_PIN5: Buffer.from([0x1B, 0x70, 0x01, 0x19, 0xFA]), // ESC p 1 25 250 (Pin 5)

  // Auto-Cutter Commands:
  CUT_FULL: Buffer.from([0x1D, 0x56, 0x00]),            // GS V 0 (Full cut)
  CUT_FEED_AND_CUT: Buffer.from([0x1D, 0x56, 0x42, 0x03]), // GS V 66 3 (Feed 3 lines & cut)
};

/**
 * Helper to build RAW ESC/POS Binary Buffer for thermal receipt printing
 */
function generateEscPosReceiptBuffer(sale, options = {}) {
  const buffers = [];

  // 1. Initialize Printer
  buffers.push(ESC_POS.INIT);

  // 2. Open Cash Drawer (RJ11 Pulse Signal) if enabled or Cash payment
  if (options.openCashDrawer !== false) {
    // Honour the configured drawer pin (some drawers are wired to pin 5 instead of pin 2).
    buffers.push(Number(options.cashDrawerPin) === 5
      ? ESC_POS.CASH_DRAWER_PULSE_PIN5
      : ESC_POS.CASH_DRAWER_PULSE_PIN2);
  }

  // 3. Header Section (Centered & Large Bold)
  buffers.push(ESC_POS.ALIGN_CENTER);
  buffers.push(ESC_POS.TXT_LARGE);
  buffers.push(ESC_POS.BOLD_ON);
  buffers.push(Buffer.from(`${options.storeName || DEFAULT_RECEIPT_TITLE}\n`, 'utf-8'));
  buffers.push(ESC_POS.TXT_NORMAL);
  buffers.push(ESC_POS.BOLD_OFF);

  buffers.push(Buffer.from(`فاتورة مبيعات - رقم ${sale.saleId || sale.id || ''}\n`, 'utf-8'));
  buffers.push(Buffer.from(`${sale.customerName || 'عميل نقدي سريع'} · ${new Date().toLocaleString('ar-EG')}\n`, 'utf-8'));
  if (sale.tableName) buffers.push(Buffer.from(`الطاولة: ${sale.tableName}\n`, 'utf-8'));
  buffers.push(Buffer.from('------------------------------------------------\n', 'utf-8'));

  // 4. Line Items Table
  buffers.push(ESC_POS.ALIGN_RIGHT);
  if (sale.items && sale.items.length > 0) {
    sale.items.forEach(item => {
      const name = item.productName || item.name || '';
      const qty = item.quantity || 1;
      const total = (item.unitPrice || item.price || 0) * qty;
      buffers.push(Buffer.from(`${name}\n`, 'utf-8'));
      if (item.modifiers?.length) {
        buffers.push(Buffer.from(`   + ${item.modifiers.map((m) => m.name).join('، ')}\n`, 'utf-8'));
      }
      buffers.push(Buffer.from(`   ${qty} x ${item.unitPrice || 0} = ${total} EGP\n`, 'utf-8'));
    });
  }
  buffers.push(Buffer.from('------------------------------------------------\n', 'utf-8'));

  // 5. Totals Section
  buffers.push(ESC_POS.ALIGN_LEFT);
  buffers.push(Buffer.from(`Subtotal: ${sale.subtotal || sale.total || 0} EGP\n`, 'utf-8'));
  if (sale.discount) {
    buffers.push(Buffer.from(`Discount: -${sale.discount} EGP\n`, 'utf-8'));
  }
  buffers.push(ESC_POS.BOLD_ON);
  buffers.push(ESC_POS.TXT_LARGE);
  buffers.push(Buffer.from(`TOTAL: ${sale.total || 0} EGP\n`, 'utf-8'));
  buffers.push(ESC_POS.TXT_NORMAL);
  buffers.push(ESC_POS.BOLD_OFF);

  // 6. Footer & Line Feed
  buffers.push(ESC_POS.ALIGN_CENTER);
  buffers.push(Buffer.from('\nشكراً لتعاملكم معنا 🙏\n', 'utf-8'));
  buffers.push(ESC_POS.FEED_3_LINES);

  // 7. Auto-Cut Command
  if (options.cutPaper !== false) {
    buffers.push(ESC_POS.CUT_FEED_AND_CUT);
  }

  return Buffer.concat(buffers);
}

function isValidPrinterName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (trimmed.startsWith('-')) return false;
  // رفض أحرف التحكم والأسطر الجديدة، والسماح فقط بأسماء طابعات معتادة (حروف/أرقام/علامات آمنة)
  // eslint-disable-next-line no-control-regex
  const hasControlChars = /[\x00-\x1F\x7F\r\n]/.test(trimmed);
  const hasInjectionChars = /[;|&$`<>{}[\]\n\r]/.test(trimmed);
  const allowedPattern = /^[\p{L}\p{N} ._'\-()/#\\,+%]+$/u;
  const valid = !hasControlChars && !hasInjectionChars && allowedPattern.test(trimmed);

  return valid;
}

function encodeForPowerShell(value) {
  return Buffer.from(String(value), 'utf16le').toString('base64');
}

/**
 * Direct RAW Printer Sending Engine (Network Socket IP or Windows Spooler RAW)
 */
function printRawEscPos(rawBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    if (!(Buffer.isBuffer(rawBuffer) || rawBuffer instanceof Uint8Array) || rawBuffer.length === 0) {
      reject(new Error('بيانات الطباعة الحرارية غير صالحة'));
      return;
    }
    const rawBytes = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);

    // Mode A: Direct TCP Network Thermal Printer (Port 9100)
    if (options.ip) {
      const port = options.port || 9100;
      const client = new net.Socket();
      client.setTimeout(options.timeout || 5000);

      client.connect(port, options.ip, () => {
        client.write(rawBytes, () => {
          client.end();
          resolve(true);
        });
      });

      client.on('error', (err) => {
        client.destroy();
        logError('PrintRawSocketError', err);
        reject(new Error(`تعذر الاتصال بالطابعة الحرارية الشبكية (${options.ip}:${port})`));
      });

      client.on('timeout', () => {
        client.destroy();
        const err = new Error(`انتهت مهلة الاتصال بالطابعة الحرارية الشبكية (${options.ip})`);
        logError('PrintRawSocketTimeout', err);
        reject(err);
      });
      return;
    }

    if (options.printerName && !isValidPrinterName(options.printerName)) {
      reject(new Error('اسم الطابعة غير صالح أو يحتوي على أحرف غير مسموحة'));
      return;
    }

    // Mode B: Send unmodified bytes to the Windows spooler using its RAW datatype.
    if (os.platform() === 'win32' && options.printerName) {
      const rawFilePath = path.join(os.tmpdir(), `escpos_raw_${randomUUID()}.bin`);

      try {
        fs.writeFileSync(rawFilePath, rawBytes);
        const typeDefinition = `
          using System;
          using System.Runtime.InteropServices;
          [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
          public struct RawDocInfo {
            public string pDocName;
            public string pOutputFile;
            public string pDataType;
          }
          public static class RawPrinter {
            [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
            static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
            [DllImport("winspool.drv", SetLastError = true)]
            static extern bool ClosePrinter(IntPtr handle);
            [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
            static extern int StartDocPrinter(IntPtr handle, int level, ref RawDocInfo info);
            [DllImport("winspool.drv", SetLastError = true)]
            static extern bool EndDocPrinter(IntPtr handle);
            [DllImport("winspool.drv", SetLastError = true)]
            static extern bool StartPagePrinter(IntPtr handle);
            [DllImport("winspool.drv", SetLastError = true)]
            static extern bool EndPagePrinter(IntPtr handle);
            [DllImport("winspool.drv", SetLastError = true)]
            static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
            public static void Send(string name, byte[] bytes) {
              IntPtr handle;
              if (!OpenPrinter(name, out handle, IntPtr.Zero))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
              bool documentStarted = false;
              bool pageStarted = false;
              try {
                RawDocInfo info = new RawDocInfo { pDocName = "ESC/POS Receipt", pDataType = "RAW" };
                if (StartDocPrinter(handle, 1, ref info) == 0)
                  throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                documentStarted = true;
                if (!StartPagePrinter(handle))
                  throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                pageStarted = true;
                int written;
                if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length)
                  throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
              } finally {
                if (pageStarted) EndPagePrinter(handle);
                if (documentStarted) EndDocPrinter(handle);
                ClosePrinter(handle);
              }
            }
          }`;
        const encodedPrinterName = encodeForPowerShell(options.printerName);
        const encodedFilePath = encodeForPowerShell(rawFilePath);
        const psCommand = `
          $ErrorActionPreference = 'Stop'
          Add-Type -TypeDefinition @'
${typeDefinition}
'@
          $printerName = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedPrinterName}'))
          $rawFilePath = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedFilePath}'))
          $bytes = [System.IO.File]::ReadAllBytes($rawFilePath)
          [RawPrinter]::Send($printerName, $bytes)
        `;

        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
          timeout: 10000,
          windowsHide: true,
        }, (error) => {
          try {
            fs.unlinkSync(rawFilePath);
          } catch (cleanupError) {
            logError('PrintRawTempFileCleanup', cleanupError);
          }
          if (error) {
            logError('PrintRawWin32Error', error);
            reject(new Error(`فشل إرسال أوامر ESC/POS المباشرة إلى الطابعة (${options.printerName})`));
          } else {
            resolve(true);
          }
        });
      } catch (err) {
        logError('PrintRawBufferException', err);
        reject(err);
      }
      return;
    }

    // Mode C: Send unmodified bytes via CUPS (lpr) for macOS and Linux
    if ((os.platform() === 'linux' || os.platform() === 'darwin') && options.printerName) {
      const rawFilePath = path.join(os.tmpdir(), `escpos_raw_${randomUUID()}.bin`);

      try {
        fs.writeFileSync(rawFilePath, rawBytes);

        execFile('lpr', ['-P', options.printerName, '-l', rawFilePath], { timeout: 10000 }, (error) => {
          try {
            fs.unlinkSync(rawFilePath);
          } catch (cleanupError) {
            logError('PrintRawTempFileCleanup', cleanupError);
          }
          if (error) {
            logError('PrintRawUnixError', error);
            reject(new Error(`فشل إرسال الأوامر المباشرة للطابعة عبر CUPS (${options.printerName})`));
          } else {
            resolve(true);
          }
        });
      } catch (err) {
        logError('PrintRawBufferExceptionUnix', err);
        reject(err);
      }
      return;
    }

    reject(new Error('حدد عنوان IP للطابعة الشبكية؛ إرسال RAW إلى اسم طابعة يتطلب Windows أو Mac أو Linux.'));
  });
}

let cachedDefaultPrinter = null;
let lastDefaultPrinterCheck = 0;

async function getDefaultWindowsPrinter() {
  const now = Date.now();
  if (cachedDefaultPrinter && (now - lastDefaultPrinterCheck < 60000)) {
    return cachedDefaultPrinter;
  }
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows').Device.Split(',')[0]"
    ], { timeout: 2500, windowsHide: true }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        cachedDefaultPrinter = stdout.trim();
        lastDefaultPrinterCheck = Date.now();
        resolve(cachedDefaultPrinter);
      } else {
        resolve(null);
      }
    });
  });
}

let cachedUnixDefaultPrinter = null;
let lastUnixDefaultPrinterCheck = 0;

// Linux/macOS: ask CUPS for the system default queue ("system default destination: NAME").
async function getDefaultUnixPrinter() {
  const now = Date.now();
  if (cachedUnixDefaultPrinter && (now - lastUnixDefaultPrinterCheck < 60000)) {
    return cachedUnixDefaultPrinter;
  }
  return new Promise((resolve) => {
    execFile('lpstat', ['-d'], { timeout: 2500, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout) => {
      const match = !err && stdout ? /destination:\s*(\S+)/.exec(stdout) : null;
      if (match) {
        cachedUnixDefaultPrinter = match[1];
        lastUnixDefaultPrinterCheck = Date.now();
        resolve(cachedUnixDefaultPrinter);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Helper to resolve printer name from options, DB settings, or the OS default printer
 */
async function resolvePrinterName(explicitName) {
  let candidate = null;
  if (explicitName && String(explicitName).trim()) {
    candidate = String(explicitName).trim();
  } else {
    try {
      const settingsRepo = require('../repositories/settings.repository');
      const configured = settingsRepo.get('thermal_printer_name');
      if (configured && String(configured).trim()) {
        candidate = String(configured).trim();
      }
    } catch {}

    if (!candidate && os.platform() === 'win32') {
      candidate = await getDefaultWindowsPrinter();
    } else if (!candidate && (os.platform() === 'linux' || os.platform() === 'darwin')) {
      candidate = await getDefaultUnixPrinter();
    }
  }

  if (!candidate) return null;
  if (!isValidPrinterName(candidate)) {
    throw new Error('اسم الطابعة غير صالح أو يحتوي على أحرف غير مسموحة');
  }
  return candidate;
}

/**
 * Open Cash Drawer Standalone RJ11 Pulse Signal
 */
async function openCashDrawer(options = {}) {
  let pin = options.cashDrawerPin;
  if (!pin) {
    try {
      const settingsRepo = require('../repositories/settings.repository');
      const savedPin = settingsRepo.get('cash_drawer_pin');
      if (savedPin) pin = Number(savedPin);
    } catch {}
  }
  const pulse = Number(pin) === 5
    ? ESC_POS.CASH_DRAWER_PULSE_PIN5
    : ESC_POS.CASH_DRAWER_PULSE_PIN2;

  // Network printers (ip) are addressed directly — no OS printer lookup needed.
  const printerName = options.ip ? options.printerName : await resolvePrinterName(options.printerName);
  const resolvedOpts = { ...options, printerName };

  return printRawEscPos(Buffer.concat([ESC_POS.INIT, pulse]), resolvedOpts).catch((err) => {
    logError('OpenCashDrawerError', err);
    throw err;
  });
}

/**
 * Trigger Thermal Paper Auto-Cut Standalone Command
 */
async function cutPaper(options = {}) {
  // Network printers (ip) are addressed directly — no OS printer lookup needed.
  const printerName = options.ip ? options.printerName : await resolvePrinterName(options.printerName);
  const resolvedOpts = { ...options, printerName };
  const cutBuffer = Buffer.concat([
    ESC_POS.FEED_3_LINES,
    ESC_POS.CUT_FEED_AND_CUT
  ]);

  return printRawEscPos(cutBuffer, resolvedOpts).catch((err) => {
    logError('CutPaperError', err);
    throw err;
  });
}

function buildReceiptHtml(sale, options = {}) {
  const paperWidth = options.paperSize === '58mm'
    ? '58mm'
    : options.paperSize === '80mm'
      ? '80mm'
      : '280px';
  const paperBoxSizing = options.paperSize ? ' box-sizing: border-box;' : '';
  const rowsHtml = sale.items
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.productName)}${item.size ? ` (${escapeHtml(item.size)})` : ''}${item.color ? ` - ${escapeHtml(item.color)}` : ''}${item.modifiers?.length ? `<br><small>+ ${escapeHtml(item.modifiers.map((m) => m.name).join('، '))}</small>` : ''}</td>
        <td style="text-align:center">${escapeHtml(item.quantity)}</td>
        <td style="text-align:left">${escapeHtml(item.unitPrice * item.quantity)} ج.م</td>
      </tr>`)
    .join('');

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Tahoma, sans-serif; width: ${paperWidth};${paperBoxSizing} margin: 0; padding: 10px; font-size: 13px; }
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
    <h2>${escapeHtml(options.storeName || DEFAULT_RECEIPT_TITLE)}</h2>
    <div class="sub">فاتورة مبيعات — رقم ${escapeHtml(sale.saleId)}</div>
    <div class="sub">${escapeHtml(sale.customerName || 'عميل نقدي سريع')} · ${new Date().toLocaleString('ar-EG')}</div>${sale.tableName ? `
    <div class="sub">الطاولة: ${escapeHtml(sale.tableName)}</div>` : ''}

    <table>
      <thead>
        <tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <table class="totals">
      <tr><td>الإجمالي الفرعي</td><td style="text-align:left">${escapeHtml(sale.subtotal)} ج.م</td></tr>
      <tr><td>الخصم</td><td style="text-align:left">- ${escapeHtml(sale.discount)} ج.م</td></tr>
      <tr class="grand"><td>الإجمالي المستحق</td><td style="text-align:left">${escapeHtml(sale.total)} ج.م</td></tr>
    </table>

    <div class="footer">شكرًا لتعامكم معنا 🙏</div>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function buildBarcodeLabelHtml(variant) {
  const jsbarcodePath = path.join(__dirname, 'JsBarcode.all.min.js');
  const jsbarcodeCode = fs.readFileSync(jsbarcodePath, 'utf-8');
  const code = String(variant.barcode || variant.sku || '');
  const isHangTag = variant.labelType === 'hangTag';
  const labelWidth = isHangTag ? '50mm' : '250px';
  const labelHeight = isHangTag ? '80mm' : 'auto';
  const pageSize = isHangTag ? '50mm 80mm' : 'auto';
  const productName = escapeHtml(variant.productName || '');
  const size = escapeHtml(variant.size || '');
  const color = escapeHtml(variant.color || '');
  const price = escapeHtml(variant.selling_price ?? variant.sellingPrice ?? '');
  const safeBarcode = escapeHtml(code);

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      @page { size: ${pageSize}; margin: 0; }
      body { box-sizing: border-box; font-family: Tahoma, sans-serif; margin: 0; padding: ${isHangTag ? '7mm 4mm' : '8px'}; width: ${labelWidth}; height: ${labelHeight}; text-align: center; }
      .p-name { font-size: ${isHangTag ? '17px' : '12px'}; font-weight: bold; margin-bottom: 5px; }
      .p-meta { font-size: ${isHangTag ? '13px' : '10px'}; color: #333; margin-bottom: 6px; }
      .p-price { font-size: ${isHangTag ? '24px' : '13px'}; font-weight: bold; margin-top: 6px; }
      svg { width: 100%; }
      .hang-tag { border: 1px solid #111; height: 100%; padding: 4mm 2mm; }
      .tag-title { font-size: 10px; margin-top: 7px; }
    </style>
    <script>${jsbarcodeCode}</script>
  </head>
  <body>
    <div class="${isHangTag ? 'hang-tag' : ''}">
      <div class="p-name">${productName}</div>
      <div class="p-meta">${size}${size && color ? ' · ' : ''}${color}</div>
      <svg id="barcode" data-value="${safeBarcode}"></svg>
      ${isHangTag ? '<div class="tag-title">السعر</div>' : ''}
      <div class="p-price">${price} ج.م</div>
    </div>
    <script>
      try {
        const barcodeValue = document.getElementById('barcode').dataset.value;
        JsBarcode("#barcode", barcodeValue, { format: "CODE128", displayValue: true, fontSize: ${isHangTag ? '16' : '12'}, height: ${isHangTag ? '55' : '40'} });
      } catch (err) {
        // logError runs in Node context only; inside the renderer we only have console.
        console.error('[BarcodeGeneration]', err);
      }
      window.onload = () => window.print();
    </script>
  </body>
</html>`;
}

async function printReceipt(sale, receiptOptions = {}) {
  const options = { ...receiptOptions, storeName: resolveStoreName(receiptOptions) };
  // RAW mode remains available for printers that need the application-generated ESC/POS receipt.
  if (options.useRawMode || options.ip) {
    const rawBuffer = generateEscPosReceiptBuffer(sale, options);
    return printRawEscPos(rawBuffer, options);
  }

  // Resolve printer name if provided or configured
  let printerName = options.printerName;
  if (!printerName) {
    try {
      const settingsRepo = require('../repositories/settings.repository');
      const configured = settingsRepo.get('thermal_printer_name');
      if (configured && String(configured).trim()) {
        printerName = String(configured).trim();
      }
    } catch {}
  }
  if (printerName && !isValidPrinterName(printerName)) {
    throw new Error('اسم الطابعة غير صالح أو يحتوي على أحرف غير مسموحة');
  }

  // If cash drawer is requested, open it
  if (options.openCashDrawer) {
    const supportsRawCommands = Boolean(options.ip) || ['win32', 'linux', 'darwin'].includes(os.platform());
    if (supportsRawCommands) {
      try {
        await openCashDrawer({ ...options, printerName });
      } catch (drawerErr) {
        logError('ReceiptDrawerOpenFailure', drawerErr);
      }
    }
  }

  if (printerName) {
    const supportsRawCommands = Boolean(options.ip) || ['win32', 'linux', 'darwin'].includes(os.platform());
    return printReceiptWithDialog(sale, {
      printerName,
      paperSize: options.paperSize,
      storeName: options.storeName,
    }).then(async (printed) => {
      if (printed && options.cutPaper !== false && supportsRawCommands) {
        try {
          await cutPaper({ ...options, printerName });
        } catch (err) {
          const cutError = new Error(`تمت طباعة الفاتورة لكن تعذر قص الورق: ${err.message}`);
          logError('ReceiptCutFailure', err);
          throw cutError;
        }
      }
      return printed;
    });
  }

  return printReceiptWithDialog(sale, options);
}

function printReceiptWithDialog(sale, options = {}) {
  return printHtml(buildReceiptHtml(sale, options), options);
}

const ORDER_MODE_LABELS = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'توصيل' };

// The cook's copy of an order: big text, no prices. One ticket per prep station.
function buildKitchenTicketHtml(ticket, options = {}) {
  const paperWidth = options.paperSize === '58mm' ? '58mm' : '80mm';
  const title = ticket.table_name
    ? `${ticket.table_name} · دفعة ${ticket.round_no}`
    : `طلب #${ticket.id}`;
  const rows = ticket.items.map((item) => {
    const variant = [item.size, item.color].filter(Boolean).join(' / ');
    return `
      <div class="item">
        <div><b>${escapeHtml(item.quantity)} ×</b> ${escapeHtml(item.product_name || 'صنف محذوف')}${variant ? ` (${escapeHtml(variant)})` : ''}</div>${item.modifiers?.length ? `
        <div class="sub-line">+ ${escapeHtml(item.modifiers.map((m) => m.name).join('، '))}</div>` : ''}${item.note ? `
        <div class="sub-line note">⚠ ${escapeHtml(item.note)}</div>` : ''}
      </div>`;
  }).join('');
  const customer = [ticket.customer_name, ticket.customer_phone].filter(Boolean).join(' · ');

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Tahoma, sans-serif; width: ${paperWidth}; box-sizing: border-box; margin: 0; padding: 8px; font-size: 16px; }
      h2 { text-align: center; margin: 0; font-size: 22px; }
      .sub { text-align: center; font-size: 13px; margin: 2px 0; }
      .station { text-align: center; font-size: 15px; font-weight: bold; border: 2px solid #000; margin: 6px 0; padding: 2px; }
      .item { border-bottom: 1px dashed #000; padding: 6px 0; font-size: 18px; }
      .sub-line { font-size: 14px; padding-right: 12px; }
      .note { font-weight: bold; }
    </style>
  </head>
  <body>
    <h2>${escapeHtml(title)}</h2>
    <div class="sub">${escapeHtml(ORDER_MODE_LABELS[ticket.order_mode] || 'طلب')} · ${new Date().toLocaleTimeString('ar-EG')}${ticket.cashier_name ? ` · ${escapeHtml(ticket.cashier_name)}` : ''}</div>${customer ? `
    <div class="sub">${escapeHtml(customer)}</div>` : ''}${ticket.delivery_address ? `
    <div class="sub">${escapeHtml(ticket.delivery_address)}</div>` : ''}${options.stationName ? `
    <div class="station">${escapeHtml(options.stationName)}</div>` : ''}
    ${rows}${ticket.notes ? `
    <div class="sub-line note">📝 ${escapeHtml(ticket.notes)}</div>` : ''}
  </body>
</html>`;
}

// Prints one HTML page: silently on `options.printerName`, or through the print dialog.
function printHtml(html, options = {}) {
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

      printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);

      printWindow.webContents.on('did-finish-load', () => {
        try {
          printWindow.webContents.print({
            silent: Boolean(options.printerName),
            ...(options.printerName ? { deviceName: options.printerName } : {}),
          }, (success, errorType) => {
            cleanup();
            if (success) {
              resolve(true);
            } else {
              if (errorType === 'cancelled' && !options.printerName) {
                resolve(false);
              } else {
                const err = errorType === 'cancelled'
                  ? new Error(`لم تتم الطباعة على الطابعة المحددة (${options.printerName})`)
                  : new Error('الطابعة مش متصلة أو لا تستجيب. يرجى التأكد من توصيل الطابعة وتشغيلها');
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

      if (!variant || typeof variant !== 'object') {
        throw new Error('بيانات بطاقة السعر أو الباركود غير صالحة');
      }
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

module.exports = {
  printReceipt,
  printHtml,
  buildKitchenTicketHtml,
  printBarcodeLabel,
  buildReceiptHtml,
  buildBarcodeLabelHtml,
  generateEscPosReceiptBuffer,
  printRawEscPos,
  openCashDrawer,
  cutPaper,
  isValidPrinterName,
  ESC_POS
};