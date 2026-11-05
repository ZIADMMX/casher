/**
 * Standalone thermal printer + cash drawer test (Windows & Linux).
 *
 * Runs the SAME print service the POS uses, but without logging in or opening the app,
 * so you can check the hardware before testing a real sale.
 *
 * Usage (from the project root):
 *   npx electron scripts/printer-test.js --list
 *   npx electron scripts/printer-test.js --printer "XP-80C"
 *   npx electron scripts/printer-test.js --printer "XP-80C" --pin 5 --only drawer
 *   npx electron scripts/printer-test.js --ip 192.168.1.100            (network printer, port 9100)
 *
 * Options:
 *   --list              Only list the printers the OS can see, then exit.
 *   --printer <name>    Exact printer/queue name (Windows: Devices & Printers, Linux: `lpstat -p`).
 *   --ip <address>      Network printer IP instead of a printer name.
 *   --port <n>          Network printer port (default 9100).
 *   --pin <2|5>         Drawer pin (default 2). Try 5 if the drawer does not open.
 *   --paper <58mm|80mm> Paper width for the Arabic receipt (default 80mm).
 *   --only <step>       Run one step only: raw | drawer | receipt
 */
const { app, BrowserWindow } = require('electron');
const printService = require('../electron/services/print.service');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

// Electron puts its own binary + the script path first; real options start after the script.
const scriptIndex = process.argv.findIndex((value) => value.endsWith('printer-test.js'));
const args = parseArgs(process.argv.slice(scriptIndex + 1));

const target = {
  printerName: typeof args.printer === 'string' ? args.printer : undefined,
  ip: typeof args.ip === 'string' ? args.ip : undefined,
  port: args.port ? Number(args.port) : undefined,
};
const pin = Number(args.pin) === 5 ? 5 : 2;
const paperSize = args.paper === '58mm' ? '58mm' : '80mm';

const sampleSale = {
  saleId: 'TEST-001',
  customerName: 'عميل تجربة',
  items: [
    { productName: 'شاي ليبتون', quantity: 2, unitPrice: 15 },
    { productName: 'سكر 1 كيلو', quantity: 1, unitPrice: 35 },
  ],
  subtotal: 65,
  discount: 5,
  total: 60,
};

async function listPrinters() {
  const win = new BrowserWindow({ show: false });
  const printers = await win.webContents.getPrintersAsync();
  win.destroy();
  console.log('\n=== Printers the OS can see ===');
  if (printers.length === 0) console.log('  (none) — install the printer driver / add it to CUPS first');
  printers.forEach((p) => console.log(`  - "${p.name}"${p.isDefault ? '   <- default' : ''}`));
  console.log('');
}

// Step 1: pure ESC/POS bytes, ASCII only. Proves the RAW channel works (no Arabic involved).
async function testRaw() {
  const { ESC_POS } = printService;
  const bytes = Buffer.concat([
    ESC_POS.INIT,
    ESC_POS.ALIGN_CENTER,
    ESC_POS.TXT_LARGE,
    Buffer.from('RAW TEST OK\n', 'ascii'),
    ESC_POS.TXT_NORMAL,
    Buffer.from(`${new Date().toISOString()}\n`, 'ascii'),
    Buffer.from('If you can read this, ESC/POS RAW works.\n', 'ascii'),
    ESC_POS.FEED_3_LINES,
    ESC_POS.CUT_FEED_AND_CUT,
  ]);
  await printService.printRawEscPos(bytes, target);
}

// Step 2: the drawer pulse (ESC p). Exactly what the POS sends after a cash sale.
async function testDrawer() {
  await printService.openCashDrawer({ ...target, cashDrawerPin: pin });
}

// Step 3: the real Arabic receipt (HTML through the printer driver) + auto-cut.
async function testReceipt() {
  if (!target.printerName) {
    console.log('  skipped: the Arabic receipt needs --printer (driver-based printing).');
    return;
  }
  await printService.printReceipt(sampleSale, {
    printerName: target.printerName,
    paperSize,
    openCashDrawer: false, // drawer is tested separately in step 2
    cutPaper: true,
  });
}

async function run(name, fn) {
  process.stdout.write(`[${name}] ... `);
  try {
    await fn();
    console.log('OK (sent to printer)');
    return true;
  } catch (err) {
    console.log(`FAILED\n    -> ${err.message}`);
    return false;
  }
}

app.whenReady().then(async () => {
  try {
    await listPrinters();
    if (args.list) return;

    if (!target.printerName && !target.ip) {
      console.log('Pass --printer "<name from the list above>" or --ip <address>.');
      process.exitCode = 1;
      return;
    }

    console.log(`Target: ${target.ip ? `${target.ip}:${target.port || 9100}` : `"${target.printerName}"`} | drawer pin ${pin} | paper ${paperSize}\n`);

    const steps = { raw: testRaw, drawer: testDrawer, receipt: testReceipt };
    const selected = typeof args.only === 'string' ? [args.only] : Object.keys(steps);
    let allOk = true;
    for (const key of selected) {
      if (!steps[key]) {
        console.log(`Unknown step "${key}" (use raw | drawer | receipt)`);
        allOk = false;
        continue;
      }
      allOk = (await run(key, steps[key])) && allOk;
    }
    console.log(allOk ? '\nAll steps sent. Now check the paper and the drawer with your own eyes.' : '\nSome steps failed — see the troubleshooting list.');
    process.exitCode = allOk ? 0 : 1;
  } finally {
    app.quit();
  }
});

// Keep the process alive while hidden print windows open/close.
app.on('window-all-closed', () => {});
