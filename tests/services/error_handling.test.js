const printService = require('../../electron/services/print.service');
const salesService = require('../../electron/services/sales.service');
const salesRepo = require('../../electron/repositories/sales.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');

// Mock Electron BrowserWindow
let mockPrintCallback = null;
let mockShouldFailLoad = false;
const mockClose = jest.fn();
const mockLoadURL = jest.fn();

jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => {
    const listeners = {};
    return {
      loadURL: mockLoadURL.mockImplementation(() => {
        setImmediate(() => {
          if (mockShouldFailLoad && listeners['did-fail-load']) {
            listeners['did-fail-load']();
          } else if (listeners['did-finish-load']) {
            listeners['did-finish-load']();
          }
        });
      }),
      isDestroyed: jest.fn(() => false),
      close: mockClose,
      webContents: {
        on: jest.fn((event, cb) => {
          listeners[event] = cb;
        }),
        print: jest.fn((options, cb) => {
          if (mockPrintCallback) {
            mockPrintCallback(cb);
          } else {
            cb(true);
          }
        }),
      },
    };
  }),
}));

jest.mock('../../electron/database/db', () => ({
  db: {
    transaction: (fn) => () => fn(),
    prepare: jest.fn(),
  },
}));

jest.mock('../../electron/repositories/sales.repository', () => ({
  createSale: jest.fn(),
  createSaleItem: jest.fn(),
  getById: jest.fn(),
}));

jest.mock('../../electron/repositories/productVariants.repository', () => ({
  getById: jest.fn(),
  decreaseStock: jest.fn(),
}));

jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => ({ id: 1 })),
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
}));

jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 1, username: 'cashier', role: 'cashier' })),
}));

describe('Week 3: Error Handling & System Stability (معالجة الأخطاء والاستقرار)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrintCallback = null;
    mockShouldFailLoad = false;
  });

  describe('1. معالجة أخطاء حفظ الفواتير (Sale Save Error Handling)', () => {
    test('فشل حفظ الفاتورة في قاعدة البيانات يرجع رسالة خطأ واضحة بدون crash أو تعليق', () => {
      variantsRepo.getById.mockReturnValue({
        id: 1,
        selling_price: 50,
        stock_quantity: 10,
      });

      // Simulate unexpected database failure
      salesRepo.createSale.mockImplementation(() => {
        throw new Error('فشل الوصول إلى القرص الصلب: قاعدة البيانات مغلقة أو مشغولة');
      });

      expect(() => {
        salesService.createSale({
          items: [{ variantId: 1, quantity: 2 }],
          paymentMethod: 'cash',
        });
      }).toThrow('فشل الوصول إلى القرص الصلب: قاعدة البيانات مغلقة أو مشغولة');

      // Verify no stock was decreased after failure
      expect(variantsRepo.decreaseStock).not.toHaveBeenCalled();
    });
  });

  describe('2. معالجة أخطاء الطباعة (Printer Error Handling)', () => {
    const sampleSale = {
      saleId: 101,
      customerName: 'عميل نقدي',
      items: [{ productName: 'قميص', quantity: 1, unitPrice: 100 }],
      subtotal: 100,
      discount: 0,
      total: 100,
    };

    test('فشل اتصال الطابعة يرجع رسالة واضحة "الطابعة مش متصلة" ويغلق النافذة بدون تجميد التطبيق', async () => {
      // Simulate printer hardware offline/disconnected error
      mockPrintCallback = (cb) => cb(false, 'printer-unavailable');

      await expect(printService.printReceipt(sampleSale)).rejects.toThrow(
        'الطابعة مش متصلة أو لا تستجيب. يرجى التأكد من توصيل الطابعة وتشغيلها'
      );

      // Verify printer window was safely closed
      expect(mockClose).toHaveBeenCalled();
    });

    test('فشل تحميل قالب الفاتورة يرجع رسالة خطأ صريحة ويغلق النافذة بأمان', async () => {
      mockShouldFailLoad = true;

      await expect(printService.printReceipt(sampleSale)).rejects.toThrow(
        'فشل تحميل قالب الفاتورة للطباعة'
      );

      expect(mockClose).toHaveBeenCalled();
    });

    test('فشل طابعة الباركود يرجع رسالة واضحة "طابعة الباركود مش متصلة"', async () => {
      mockPrintCallback = (cb) => cb(false, 'device-offline');

      await expect(
        printService.printBarcodeLabel({
          productName: 'تيشيرت',
          barcode: '622000',
          sellingPrice: 150,
        })
      ).rejects.toThrow('طابعة الباركود مش متصلة أو لا تستجيب. يرجى التأكد من التوصيل');

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
