/**
 * @file einvoice.receipt.test.js
 * @description الإيصال الإلكتروني (e-Receipt): شكل المستند، الضريبة، وسلسلة
 * البصمات. كسر السلسلة أو خطأ في الإجمالي = إيصال مرفوض من المصلحة.
 */

const { buildReceiptDocument, computeReceiptUuid, PAYMENT_METHODS } = require('../../electron/services/einvoice/receipt');

const CONFIG = {
  vatRate: 14,
  itemCodeType: 'EGS',
  defaultItemCode: 'EG-000000000-001',
  taxNumber: '123456789',
  issuerName: 'متجر الاختبار',
  branchId: '0',
  activityCode: '4711',
  deviceSerial: 'POS-0001',
  documentKind: 'receipt',
  address: {
    country: 'EG',
    governate: 'القاهرة',
    regionCity: 'مدينة نصر',
    street: 'شارع الطيران',
    buildingNumber: '12',
  },
};

function makeSale(overrides = {}) {
  return {
    id: 7,
    invoice_number: 'RCP-7',
    created_at: '2026-11-12 10:30:00',
    total_amount: 120,
    discount: 5,
    service_charge: 0,
    payment_method: 'cash',
    customer_name: null,
    customer_phone: null,
    items: [
      { quantity: 2, unit_price: 50, productName: 'قميص', sku: 'SH-1', variant_id: 1 },
      { quantity: 1, unit_price: 25, productName: 'جورب', sku: 'SK-9', variant_id: 2 },
    ],
    ...overrides,
  };
}

describe('الإيصال الإلكتروني (e-Receipt)', () => {
  test('يطلع بشكل منظومة الإيصال مش الفاتورة', () => {
    const receipt = buildReceiptDocument(makeSale(), CONFIG);

    expect(receipt.documentType).toEqual({ receiptType: 'S', typeVersion: '1.2' });
    expect(receipt.header.receiptNumber).toBe('RCP-7');
    expect(receipt.header.dateTimeIssued).toBe('2026-11-12T10:30:00Z');
    expect(receipt.seller.rin).toBe('123456789');
    expect(receipt.seller.deviceSerialNumber).toBe('POS-0001');
    expect(receipt.itemData).toHaveLength(2);
    expect(receipt.invoiceLines).toBeUndefined();
  });

  test('نفس حساب الضريبة بتاع الفاتورة: الإجمالي يطابق المدفوع بالقرش', () => {
    const receipt = buildReceiptDocument(makeSale(), CONFIG);

    expect(receipt.totalSales).toBe(109.65);
    expect(receipt.totalItemsDiscount).toBe(4.39);
    expect(receipt.netAmount).toBe(105.26);
    expect(receipt.taxTotals).toEqual([{ taxType: 'T1', amount: 14.74 }]);
    expect(receipt.totalAmount).toBe(120);
  });

  test('الخصم بيتسجل على البند في itemDiscountData', () => {
    const [first] = buildReceiptDocument(makeSale(), CONFIG).itemData;

    expect(first.itemDiscountData).toEqual([{ amount: 3.51, description: 'خصم الفاتورة', rate: 0 }]);
    expect(first.netSale).toBe(84.21);
    expect(first.total).toBe(96);
  });

  test('بغير خصم ما بيتسجلش خصم فاضي على البند', () => {
    const receipt = buildReceiptDocument(makeSale({ discount: 0, total_amount: 125 }), CONFIG);
    expect(receipt.itemData[0].itemDiscountData).toEqual([]);
    expect(receipt.totalItemsDiscount).toBe(0);
    expect(receipt.totalAmount).toBe(125);
  });

  test('طريقة الدفع بتتحول لكود المصلحة', () => {
    expect(buildReceiptDocument(makeSale({ payment_method: 'cash' }), CONFIG).paymentMethod).toBe(PAYMENT_METHODS.cash);
    expect(buildReceiptDocument(makeSale({ payment_method: 'card' }), CONFIG).paymentMethod).toBe('V');
    expect(buildReceiptDocument(makeSale({ payment_method: 'credit' }), CONFIG).paymentMethod).toBe('O');
  });

  test('بغير قيمة مضافة يخرج الإيصال بلا ضرائب', () => {
    const receipt = buildReceiptDocument(makeSale(), { ...CONFIG, vatRate: 0 });
    expect(receipt.taxTotals).toEqual([]);
    expect(receipt.itemData[0].taxableItems).toEqual([]);
    expect(receipt.totalAmount).toBe(120);
  });

  test('رسوم التوصيل بند مستقل زي الفاتورة', () => {
    const receipt = buildReceiptDocument(
      makeSale({ discount: 0, service_charge: 10, total_amount: 135, order_mode: 'delivery' }),
      CONFIG
    );
    expect(receipt.itemData).toHaveLength(3);
    expect(receipt.itemData[2].description).toBe('رسوم التوصيل');
    expect(receipt.totalAmount).toBe(135);
  });
});

describe('سلسلة بصمات الإيصالات', () => {
  test('البصمة SHA-256 ومحسوبة على المستند وهو بغير uuid', () => {
    const receipt = buildReceiptDocument(makeSale(), CONFIG);

    expect(receipt.header.uuid).toMatch(/^[0-9a-f]{64}$/);
    expect(computeReceiptUuid(receipt)).toBe(receipt.header.uuid);
  });

  test('الإيصال الجديد بيشاور على اللي قبله، والأول بيفضل بغير سابق', () => {
    const first = buildReceiptDocument(makeSale({ id: 1, invoice_number: 'RCP-1' }), CONFIG);
    const second = buildReceiptDocument(makeSale({ id: 2, invoice_number: 'RCP-2' }), CONFIG, first.header.uuid);

    expect(first.header.previousUUID).toBe('');
    expect(second.header.previousUUID).toBe(first.header.uuid);
    expect(second.header.uuid).not.toBe(first.header.uuid);
  });

  test('أي تغيير في المحتوى بيغيّر البصمة', () => {
    const base = buildReceiptDocument(makeSale(), CONFIG);
    const changed = buildReceiptDocument(makeSale({ total_amount: 121 }), CONFIG);
    expect(changed.header.uuid).not.toBe(base.header.uuid);
  });

  test('نفس المبيعة بنفس السابق بتدي نفس البصمة (الحساب ثابت)', () => {
    const previous = 'a'.repeat(64);
    const one = buildReceiptDocument(makeSale(), CONFIG, previous);
    const two = buildReceiptDocument(makeSale(), CONFIG, previous);
    expect(one.header.uuid).toBe(two.header.uuid);
  });
});
