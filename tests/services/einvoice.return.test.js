/**
 * @file einvoice.return.test.js
 * @description مستند المرتجع: إشعار خصم في منظومة الفاتورة، وإيصال استرداد في
 * منظومة الإيصال. الإشعار ما ينفعش يتبعت قبل ما المصلحة تقبل الفاتورة الأصلية.
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: ':memory:' }));

const einvoiceRepo = require('../../electron/repositories/einvoice.repository');
const einvoice = require('../../electron/services/einvoice');

const VALID_CONFIG = {
  enabled: true,
  taxNumber: '123456789',
  issuerName: 'متجر الاختبار',
  activityCode: '4711',
  governate: 'القاهرة',
  regionCity: 'مدينة نصر',
  street: 'شارع الطيران',
  buildingNumber: '12',
  defaultItemCode: 'EG-000000000-001',
};

// بيعة: صنفين بسعر 114 شامل الضريبة (100 صافي + 14 ضريبة) للواحد.
function seedSale({ id = 1, quantity = 2, unitPrice = 114, discount = 0 } = {}) {
  const total = quantity * unitPrice - discount;
  mockDb.prepare(`
    INSERT INTO sales (id, total_amount, discount, payment_method, invoice_number, created_at)
    VALUES (?, ?, ?, 'cash', ?, '2026-11-12 10:00:00')
  `).run(id, total, discount, `INV-${id}`);
  mockDb.prepare('INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price) VALUES (?, 1, ?, ?)')
    .run(id, quantity, unitPrice);
  return id;
}

function seedReturn({ saleId = 1, quantity = 1, refundAmount = 114 } = {}) {
  const result = mockDb.prepare(`
    INSERT INTO returns (sale_id, variant_id, quantity, reason, refund_amount, created_at)
    VALUES (?, 1, ?, 'الصنف تالف', ?, '2026-11-12 12:00:00')
  `).run(saleId, quantity, refundAmount);
  return Number(result.lastInsertRowid);
}

describe('مستند المرتجع عند المصلحة', () => {
  beforeAll(() => {
    mockDb.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf-8'));
    // الفهارس والقيود اللي بتتعمل في الترحيل مش في schema.sql.
    require('../../electron/database/migrations/einvoice').ensureEInvoice(mockDb);
    mockDb.prepare("INSERT INTO products (id, name) VALUES (1, 'صنف')").run();
    mockDb.prepare(`
      INSERT INTO product_variants (id, product_id, sku, purchase_price, selling_price, stock_quantity)
      VALUES (1, 1, 'SKU-1', 50, 114, 100)
    `).run();
  });

  beforeEach(() => {
    mockDb.exec('DELETE FROM einvoice_documents; DELETE FROM returns; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM settings;');
  });

  function enableSystem(overrides = {}) {
    einvoice.saveConfig({ ...VALID_CONFIG, ...overrides });
  }

  test('المرتجع بيطلّع إشعار خصم بقيمة المبلغ المسترد لوحده', () => {
    enableSystem();
    einvoice.enqueueSale(seedSale());
    const row = einvoice.enqueueReturn(seedReturn({ quantity: 1, refundAmount: 114 }));

    expect(row).not.toBeNull();
    expect(row.return_id).toBeGreaterThan(0);
    const document = JSON.parse(row.document_json);
    expect(document.documentType).toBe('C');
    expect(document.internalID).toBe(`INV-1-R${row.return_id}`);
    expect(document.invoiceLines).toHaveLength(1);
    expect(document.invoiceLines[0].quantity).toBe(1);
    // 114 شامل الضريبة = 100 صافي + 14 ضريبة، والإجمالي يساوي المسترد بالقرش.
    expect(document.netAmount).toBe(100);
    expect(document.taxTotals[0].amount).toBe(14);
    expect(document.totalAmount).toBe(114);
  });

  test('الاسترداد الجزئي بعد خصم الفاتورة بيطابق المبلغ المسترد', () => {
    enableSystem();
    // 2 × 114 = 228، خصم 28، فالمسترد عن صنف واحد 100.
    einvoice.enqueueSale(seedSale({ quantity: 2, discount: 28 }));
    const row = einvoice.enqueueReturn(seedReturn({ quantity: 1, refundAmount: 100 }));

    const document = JSON.parse(row.document_json);
    expect(document.totalAmount).toBe(100);
    expect(document.totalDiscountAmount).toBeCloseTo(12.28, 2);
  });

  test('إشعار الخصم ما بيتبعتش قبل ما المصلحة تقبل الفاتورة الأصلية', () => {
    enableSystem();
    const sale = einvoice.enqueueSale(seedSale());
    const credit = einvoice.enqueueReturn(seedReturn());

    expect(einvoice.documentForRow(einvoiceRepo.getById(credit.id))).toBeNull();

    einvoiceRepo.markSubmitted(sale.id, { submissionUuid: 'S1', documentUuid: 'D1', longId: null });
    const ready = einvoice.documentForRow(einvoiceRepo.getById(credit.id));
    expect(ready.references).toEqual(['D1']);
  });

  test('الفاتورة نفسها ما بتستناش حاجة', () => {
    enableSystem();
    const sale = einvoice.enqueueSale(seedSale());
    const document = einvoice.documentForRow(einvoiceRepo.getById(sale.id));
    expect(document.documentType).toBe('I');
    expect(document.references).toBeUndefined();
  });

  test('المرتجع بيدخل الطابور مرة واحدة بس، والمبيعة ومرتجعها مستندين منفصلين', () => {
    enableSystem();
    einvoice.enqueueSale(seedSale());
    const returnId = seedReturn();

    expect(einvoice.enqueueReturn(returnId)).not.toBeNull();
    expect(einvoice.enqueueReturn(returnId)).toBeNull();
    expect(einvoiceRepo.countsByStatus().pending).toBe(2);
  });

  test('بيعة ما اتبعتتش للمصلحة أصلاً مالهاش إشعار خصم', () => {
    enableSystem();
    seedSale(); // من غير enqueueSale: البيع كان قبل تشغيل المنظومة
    expect(einvoice.enqueueReturn(seedReturn())).toBeNull();
  });

  test('استبدال بغير مبلغ مسترد مالوش مستند', () => {
    enableSystem();
    einvoice.enqueueSale(seedSale());
    expect(einvoice.enqueueReturn(seedReturn({ refundAmount: 0 }))).toBeNull();
  });

  test('المنظومة المقفولة ما بتسجلش مرتجع، والمرتجع المش موجود ما بيرميش استثناء', () => {
    seedSale();
    expect(einvoice.enqueueReturn(1)).toBeNull();
    enableSystem();
    expect(einvoice.enqueueReturn(99999)).toBeNull();
  });

  test('في منظومة الإيصال المرتجع بيطلع إيصال استرداد مربوط بالإيصال الأصلي', () => {
    enableSystem({ documentKind: 'receipt', deviceSerial: 'POS-001' });
    const original = einvoice.enqueueSale(seedSale());
    const refund = einvoice.enqueueReturn(seedReturn());

    const document = JSON.parse(refund.document_json);
    expect(document.documentType.receiptType).toBe('R');
    expect(document.header.referenceOldUUID).toBe(original.uuid);
    // حلقة جديدة في نفس السلسلة ببصمة مستقلة.
    expect(refund.previous_uuid).toBe(original.uuid);
    expect(refund.uuid).toMatch(/^[0-9a-f]{64}$/);
    expect(refund.uuid).not.toBe(original.uuid);
    expect(document.totalAmount).toBe(114);
  });

  test('إعادة إرسال إشعار خصم مرفوض بتبنيه من جديد كإشعار خصم', async () => {
    enableSystem();
    einvoice.enqueueSale(seedSale());
    const credit = einvoice.enqueueReturn(seedReturn());
    einvoiceRepo.markStatus(credit.id, 'rejected', { errorMessage: 'كود الصنف غير صحيح' });

    await einvoice.resubmit(credit.id);

    const updated = einvoiceRepo.getById(credit.id);
    expect(updated.status).toBe('pending');
    expect(JSON.parse(updated.document_json).documentType).toBe('C');
  });

  test('قائمة الطابور بتعرض قيمة المرتجع مش إجمالي الفاتورة', () => {
    enableSystem();
    einvoice.enqueueSale(seedSale({ quantity: 2 })); // 228
    einvoice.enqueueReturn(seedReturn({ quantity: 1, refundAmount: 114 }));

    const amounts = einvoiceRepo.list({}).map((doc) => doc.total_amount).sort((a, b) => a - b);
    expect(amounts).toEqual([114, 228]);
  });
});
