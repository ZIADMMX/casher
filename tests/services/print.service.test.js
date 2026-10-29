const mockExecFile = jest.fn();

jest.mock('node:child_process', () => ({ execFile: (...args) => mockExecFile(...args) }));
jest.mock('electron', () => ({ BrowserWindow: jest.fn() }));
jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));

const net = require('node:net');
const os = require('node:os');
const { BrowserWindow } = require('electron');
const fs = require('node:fs');
const {
  ESC_POS,
  generateEscPosReceiptBuffer,
  isValidPrinterName,
  openCashDrawer,
  printBarcodeLabel,
  printRawEscPos,
  printReceipt,
} = require('../../electron/services/print.service');

describe('print.service ESC/POS', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockExecFile.mockReset();
  });

  test('builds a receipt with drawer pulse and cutter commands', () => {
    const buffer = generateEscPosReceiptBuffer({
      saleId: 12,
      items: [{ productName: 'قميص', quantity: 2, unitPrice: 100 }],
      total: 200,
    });

    expect(buffer.includes(ESC_POS.CASH_DRAWER_PULSE_PIN2)).toBe(true);
    expect(buffer.includes(ESC_POS.CUT_FEED_AND_CUT)).toBe(true);
  });

  test('sends raw bytes to a network printer and reports success', async () => {
    const payload = Buffer.from([0x1b, 0x40, 0x1d, 0x56]);
    let received;
    const receivedPromise = new Promise((resolve) => {
      const server = net.createServer((socket) => {
        const chunks = [];
        socket.on('data', (chunk) => chunks.push(chunk));
        socket.on('end', () => {
          received = Buffer.concat(chunks);
          server.close(resolve);
        });
      });
      server.listen(0, '127.0.0.1', () => {
        printRawEscPos(payload, { ip: '127.0.0.1', port: server.address().port })
          .catch((error) => server.close(() => resolve(Promise.reject(error))));
      });
    });

    await receivedPromise;
    expect(received).toEqual(payload);
  });

  test('does not report success when no direct printer is configured', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    await expect(printRawEscPos(Buffer.from([0x1b, 0x40]))).rejects.toThrow('حدد عنوان IP للطابعة');
  });

  test('uses the Windows RAW spooler datatype for configured printer names', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    mockExecFile.mockImplementation((_command, _args, _options, callback) => callback(null, '', ''));

    await expect(printRawEscPos(Buffer.from([0x1b, 0x40]), {
      printerName: "Thermal 'Front' Printer",
    })).resolves.toBe(true);

    const printerName = "Thermal 'Front' Printer";
    const encodedName = Buffer.from(printerName, 'utf16le').toString('base64');
    const script = mockExecFile.mock.calls[0][1][3];
    expect(script).toContain('pDataType = "RAW"');
    expect(script).toContain(encodedName);
    expect(script).toContain('FromBase64String');
    expect(script).not.toContain("[RawPrinter]::Send('");
    expect(script).not.toContain(printerName);
  });

  test('rejects printer names with control characters, newlines, or injection tokens', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    const payload = Buffer.from([0x1b, 0x40]);
    await expect(printRawEscPos(payload, { printerName: "POS-80\ncalc.exe" })).rejects.toThrow('اسم الطابعة غير صالح');
    await expect(printRawEscPos(payload, { printerName: "POS-80; Get-Process" })).rejects.toThrow('اسم الطابعة غير صالح');
    await expect(printRawEscPos(payload, { printerName: "POS-80|notepad" })).rejects.toThrow('اسم الطابعة غير صالح');
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(isValidPrinterName('POS-80')).toBe(true);
    expect(isValidPrinterName("Thermal 'Front' Printer")).toBe(true);
  });

  test.each(['linux', 'darwin'])('sends raw bytes through CUPS lpr on %s', async (platform) => {
    jest.spyOn(os, 'platform').mockReturnValue(platform);
    const payload = Buffer.from([0x1b, 0x40, 0x1d, 0x56]);
    mockExecFile.mockImplementation((command, args, options, callback) => {
      expect(command).toBe('lpr');
      expect(args.slice(0, 3)).toEqual(['-P', "Thermal 'Front' Printer", '-l']);
      expect(fs.readFileSync(args[3])).toEqual(payload);
      expect(options).toEqual(expect.objectContaining({ timeout: 10000 }));
      callback(null, '', '');
    });

    await expect(printRawEscPos(payload, {
      printerName: "Thermal 'Front' Printer",
    })).resolves.toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  test('prints a price hang tag with an escaped product name and price barcode', async () => {
    const webContents = {
      on: jest.fn((event, callback) => {
        if (event === 'did-finish-load') callback();
      }),
      print: jest.fn((_options, callback) => callback(true)),
    };
    let printHtml = '';
    BrowserWindow.mockImplementation(() => ({
      webContents,
      loadURL: jest.fn((url) => {
        printHtml = decodeURIComponent(url.split(',')[1]);
      }),
      close: jest.fn(),
      isDestroyed: () => false,
    }));

    await expect(printBarcodeLabel({
      labelType: 'hangTag',
      productName: '<script>alert("x")</script>',
      size: 'M',
      color: 'أزرق',
      barcode: '123456',
      selling_price: 250,
    })).resolves.toBe(true);

    expect(printHtml).toContain('@page { size: 50mm 80mm');
    expect(printHtml).toContain('250 ج.م');
    expect(printHtml).toContain('data-value="123456"');
    expect(printHtml).toContain('&lt;script&gt;');
    expect(printHtml).not.toContain('<div class="p-name"><script>');
  });

  test('prints a configured receipt through the selected driver and sends drawer and cutter commands', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    mockExecFile.mockImplementation((_command, _args, _options, callback) => callback(null, '', ''));
    const webContents = {
      on: jest.fn((event, callback) => {
        if (event === 'did-finish-load') callback();
      }),
      print: jest.fn((_options, callback) => callback(true)),
    };
    const loadURL = jest.fn();
    BrowserWindow.mockImplementation(() => ({
      webContents,
      loadURL,
      close: jest.fn(),
      isDestroyed: () => false,
    }));

    await expect(printReceipt({
      saleId: 1,
      items: [{ productName: 'قميص', quantity: 1, unitPrice: 10 }],
      total: 10,
      paymentMethod: 'cash',
    }, {
      printerName: 'Thermal Printer',
      paperSize: '58mm',
      openCashDrawer: true,
      cutPaper: true,
    })).resolves.toBe(true);

    expect(webContents.print).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true, deviceName: 'Thermal Printer' }),
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const receiptHtml = decodeURIComponent(loadURL.mock.calls[0][0].split(',')[1]);
    expect(receiptHtml).toContain('width: 58mm');
  });

  test('prints through the system driver on Linux and sends drawer and cutter commands through CUPS', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    mockExecFile.mockImplementation((_command, _args, _options, callback) => callback(null, '', ''));
    const webContents = {
      on: jest.fn((event, callback) => {
        if (event === 'did-finish-load') callback();
      }),
      print: jest.fn((_options, callback) => callback(true)),
    };
    BrowserWindow.mockImplementation(() => ({
      webContents,
      loadURL: jest.fn(),
      close: jest.fn(),
      isDestroyed: () => false,
    }));

    await expect(printReceipt({
      saleId: 1,
      items: [],
      total: 10,
    }, {
      printerName: 'Thermal Printer',
      openCashDrawer: true,
      cutPaper: true,
    })).resolves.toBe(true);

    expect(webContents.print).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true, deviceName: 'Thermal Printer' }),
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockExecFile.mock.calls.map(([command]) => command)).toEqual(['lpr', 'lpr']);
  });

  test('reports cancellation instead of resolving success for a configured printer', async () => {
    const webContents = {
      on: jest.fn((event, callback) => {
        if (event === 'did-finish-load') callback();
      }),
      print: jest.fn((_options, callback) => callback(false, 'cancelled')),
    };
    BrowserWindow.mockImplementation(() => ({
      webContents,
      loadURL: jest.fn(),
      close: jest.fn(),
      isDestroyed: () => false,
    }));

    await expect(printReceipt({
      saleId: 1,
      items: [],
      total: 0,
    }, {
      printerName: 'Thermal Printer',
      openCashDrawer: false,
    })).rejects.toThrow('لم تتم الطباعة على الطابعة المحددة');
  });

  test('reports a cutter failure after printing without hiding that the receipt was printed', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    mockExecFile.mockImplementation((_command, _args, _options, callback) => {
      callback(new Error('spooler unavailable'), '', '');
    });
    const webContents = {
      on: jest.fn((event, callback) => {
        if (event === 'did-finish-load') callback();
      }),
      print: jest.fn((_options, callback) => callback(true)),
    };
    BrowserWindow.mockImplementation(() => ({
      webContents,
      loadURL: jest.fn(),
      close: jest.fn(),
      isDestroyed: () => false,
    }));

    await expect(printReceipt({
      saleId: 1,
      items: [],
      total: 0,
    }, {
      printerName: 'Thermal Printer',
      openCashDrawer: false,
      cutPaper: true,
    })).rejects.toThrow('تمت طباعة الفاتورة لكن تعذر قص الورق');

    expect(webContents.print).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  test('uses only the configured drawer kick pin', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('linux');
    const payload = Buffer.concat([ESC_POS.INIT, ESC_POS.CASH_DRAWER_PULSE_PIN5]);
    let received = Buffer.alloc(0);
    let finishReceiving;
    const receivedPromise = new Promise((resolve) => {
      finishReceiving = resolve;
    });
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
      });
      socket.on('end', finishReceiving);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    await expect(openCashDrawer({
      ip: '127.0.0.1',
      port: server.address().port,
      cashDrawerPin: 5,
    })).resolves.toBe(true);
    await receivedPromise;
    await new Promise((resolve) => server.close(resolve));

    expect(received).toEqual(payload);
  });

  test('opens cash drawer via Windows RAW spooler when printerName is passed', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    mockExecFile.mockImplementation((_command, _args, _options, callback) => callback(null, '', ''));

    await expect(openCashDrawer({
      printerName: 'POS-80',
      cashDrawerPin: 2,
    })).resolves.toBe(true);

    expect(mockExecFile).toHaveBeenCalled();
    const script = mockExecFile.mock.calls[0][1][3];
    expect(script).toContain(Buffer.from('POS-80', 'utf16le').toString('base64'));
    expect(script).not.toContain("[RawPrinter]::Send('POS-80'");
  });
});
