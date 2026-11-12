/**
 * @file einvoice.document.test.js
 * @description بناء مستند الفاتورة الإلكترونية وتسلسله قبل التوقيع.
 * فلوس: أي خطأ هنا يعني فاتورة مرفوضة من المصلحة أو ضريبة غلط.
 */

const { buildInvoiceDocument, serialize } = require('../../electron/services/einvoice/document');

const CONFIG = {
  vatRate: 14,
  itemCodeType: 'EGS',
  defaultItemCode: 'EG-000000000-001',
  taxNumber: '123456789',
  issuerName: 'متجر الاختبار',
  branchId: '0',
  activityCode: '4711',
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
    invoice_number: 'INV-7',
    created_at: '2026-11-12 10:30:00',
    total_amount: 120,
    discount: 5,
    service_charge: 0,
    customer_name: null,
    items: [
      { quantity: 2, unit_price: 50, productName: 'قميص', sku: 'SH-1', variant_id: 1 },
      { quantity: 1, unit_price: 25, productName: 'جورب', sku: 'SK-9', variant_id: 2 },
    ],
    ...overrides,
  };
}

describe('مستند الفاتورة الإلكترونية (ETA)', () => {
  test('يفصل الضريبة من أسعار شاملة ويطابق إجمالي الفاتورة بالقرش', () => {
    const doc = buildInvoiceDocument(makeSale(), CONFIG);

    expect(doc.totalSalesAmount).toBe(109.65);
    expect(doc.totalDiscountAmount).toBe(4.39);
    expect(doc.netAmount).toBe(105.26);
    expect(doc.taxTotals).toEqual([{ taxType: 'T1', amount: 14.74 }]);
    expect(doc.totalAmount).toBe(120);
    // الإجمالي لازم يساوي اللي العميل دفعه فعلاً
    expect(doc.totalAmount).toBe(makeSale().total_amount);
  });

  test('يوزع خصم الفاتورة على البنود بالتناسب بغير ما يضيع قرش', () => {
    const doc = buildInvoiceDocument(makeSale(), CONFIG);
    const [first, second] = doc.invoiceLines;

    expect(first.discount.amount).toBe(3.51);
    expect(second.discount.amount).toBe(0.88);
    expect(first.netTotal + first.taxableItems[0].amount).toBeCloseTo(first.total, 2);
  });

  test('يضيف رسوم الخدمة أو التوصيل كبند مستقل', () => {
    const doc = buildInvoiceDocument(
      makeSale({ discount: 0, service_charge: 10, total_amount: 135, order_mode: 'delivery' }),
      CONFIG
    );

    expect(doc.invoiceLines).toHaveLength(3);
    expect(doc.invoiceLines[2].description).toBe('رسوم التوصيل');
    expect(doc.totalAmount).toBe(135);
  });

  test('بغير قيمة مضافة (منشأة غير مسجلة) يخرج المستند بلا ضرائب', () => {
    const doc = buildInvoiceDocument(makeSale(), { ...CONFIG, vatRate: 0 });

    expect(doc.taxTotals).toEqual([]);
    expect(doc.invoiceLines[0].taxableItems).toEqual([]);
    expect(doc.netAmount).toBe(120);
    expect(doc.totalAmount).toBe(120);
  });

  test('يستخدم كود الصنف المسجل للمصلحة ويقع على الافتراضي لو فاضي', () => {
    const sale = makeSale();
    sale.items[0].eta_item_code = 'EG-123456789-777';
    const doc = buildInvoiceDocument(sale, CONFIG);

    expect(doc.invoiceLines[0].itemCode).toBe('EG-123456789-777');
    expect(doc.invoiceLines[1].itemCode).toBe(CONFIG.defaultItemCode);
    expect(doc.invoiceLines[0].itemType).toBe('EGS');
  });

  test('بيانات المُصدِر والمستلم والتاريخ بصيغة المصلحة', () => {
    const doc = buildInvoiceDocument(makeSale({ customer_name: '  أحمد  ' }), CONFIG);

    expect(doc.issuer.id).toBe('123456789');
    expect(doc.issuer.address.branchID).toBe('0');
    expect(doc.receiver).toMatchObject({ type: 'P', name: 'أحمد' });
    expect(doc.documentType).toBe('I');
    expect(doc.documentTypeVersion).toBe('1.0');
    expect(doc.dateTimeIssued).toBe('2026-11-12T10:30:00Z');
    expect(doc.internalID).toBe('INV-7');
  });

  test('تاريخ معاه منطقة زمنية بيتحول لـ UTC مش بيتبهدل', () => {
    const doc = buildInvoiceDocument(makeSale({ created_at: '2026-11-12T12:30:00+02:00' }), CONFIG);
    expect(doc.dateTimeIssued).toBe('2026-11-12T10:30:00Z');
  });

  test('تاريخ غير صالح بيوقف المستند، ما بيتحطّش تاريخ النهارده مكانه', () => {
    expect(() => buildInvoiceDocument(makeSale({ created_at: 'مش تاريخ' }), CONFIG))
      .toThrow(/تاريخ الفاتورة غير صالح/);
  });

  test('عميل عابر بغير اسم يتسجل مستهلك نهائي', () => {
    expect(buildInvoiceDocument(makeSale(), CONFIG).receiver.name).toBe('مستهلك نهائي');
  });

  test('فاتورة بغير أصناف تُرفض قبل ما تروح للمصلحة', () => {
    expect(() => buildInvoiceDocument(makeSale({ items: [] }), CONFIG)).toThrow(/أصناف/);
  });
});

describe('تسلسل المستند قبل التوقيع (Serialization)', () => {
  test('اسم كل خاصية بحروف كبيرة ومقتبس، والقيمة بعده', () => {
    expect(serialize({ issuer: { id: '1', name: 'x' } })).toBe('"ISSUER""ID""1""NAME""x"');
  });

  test('المصفوفة تكرر اسم خاصيتها قبل كل عنصر', () => {
    expect(serialize({ invoiceLines: [{ a: '1' }, { a: '2' }] }))
      .toBe('"INVOICELINES""A""1""INVOICELINES""A""2"');
  });

  test('الأرقام تُسلسل كنصوص والقيم الفارغة تُتجاهل', () => {
    expect(serialize({ total: 12.5, note: null, flag: 0 })).toBe('"TOTAL""12.5""FLAG""0"');
  });

  test('المستند الحقيقي يُسلسل بغير ما يرمي استثناء ويبدأ بالمُصدِر', () => {
    const output = serialize(buildInvoiceDocument(makeSale(), CONFIG));
    expect(output.startsWith('"ISSUER"')).toBe(true);
    expect(output).toContain('"TAXTOTALS""TAXTYPE""T1"');
  });
});
