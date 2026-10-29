const mockExecFile = jest.fn((_command, _args, _options, callback) => callback(null, '', ''));

jest.mock('node:child_process', () => ({ execFile: (...args) => mockExecFile(...args) }));
jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));

const printService = require('../../electron/services/print.service');
const os = require('node:os');

describe('🖨️ ESC/POS RAW Printing, Cash Drawer & Auto-Cutter Engine', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockExecFile.mockClear();
  });

  const sampleSale = {
    saleId: 501,
    customerName: 'أحمد محمود',
    items: [
      { productName: 'تيشيرت قطن XL', quantity: 2, unitPrice: 150 },
      { productName: 'بنطلون جينز', quantity: 1, unitPrice: 350 }
    ],
    subtotal: 650,
    discount: 50,
    total: 600,
    paymentMethod: 'cash'
  };

  test('1. generateEscPosReceiptBuffer يُنشئ Buffer يحتوي على أوامر ESC/POS وتجهيز درج النقدية والقطع التلقائي', () => {
    const buffer = printService.generateEscPosReceiptBuffer(sampleSale, { openCashDrawer: true, cutPaper: true });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(50);

    // Verify ESC @ printer init command exists (0x1B, 0x40)
    expect(buffer.includes(printService.ESC_POS.INIT)).toBe(true);

    // Verify RJ11 Cash Drawer Pulse signal exists (0x1B, 0x70)
    expect(buffer.includes(printService.ESC_POS.CASH_DRAWER_PULSE_PIN2)).toBe(true);

    // Verify Auto-Cutter command exists (0x1D, 0x56)
    expect(buffer.includes(printService.ESC_POS.CUT_FEED_AND_CUT)).toBe(true);

    // Verify content text exists in buffer
    const textContent = buffer.toString('utf-8');
    expect(textContent).toContain('501');
    expect(textContent).toContain('600 EGP');
  });

  test('2. openCashDrawer يُرسل إشارة الكهرباء RJ11 Pulse بنجاح عند تحديد طابعة', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    const result = await printService.openCashDrawer({ printerName: 'POS-80' });
    expect(result).toBe(true);
  });

  test('3. cutPaper يُرسل أمر قطع الورق التلقائي بنجاح عند تحديد طابعة', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    const result = await printService.cutPaper({ printerName: 'POS-80' });
    expect(result).toBe(true);
  });

  test('4. printReceipt النمط المباشر useRawMode ينفذ طباعة RAW ESC/POS بنجاح', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    const result = await printService.printReceipt(sampleSale, { useRawMode: true, printerName: 'POS-80' });
    expect(result).toBe(true);
  });
});
