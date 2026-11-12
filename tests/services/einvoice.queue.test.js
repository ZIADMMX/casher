/**
 * @file einvoice.queue.test.js
 * @description طابور الفاتورة الإلكترونية: التسجيل وقت البيع، وضع offline،
 * وإعادة إرسال المرفوض. البيع ما ينفعش يقف لو المنظومة وقعت.
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: ':memory:' }));

const SettingsRepository = require('../../electron/repositories/settings.repository');
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

function seedSale({ id = 1, total = 114, discount = 0 } = {}) {
  mockDb.prepare(`
    INSERT INTO sales (id, total_amount, discount, payment_method, invoice_number, created_at)
    VALUES (?, ?, ?, 'cash', ?, '2026-11-12 10:00:00')
  `).run(id, total, discount, `INV-${id}`);
  mockDb.prepare('INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price) VALUES (?, 1, 1, ?)')
    .run(id, total);
  return id;
}

describe('طابور الفاتورة الإلكترونية', () => {
  beforeAll(() => {
    const schema = fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf-8');
    mockDb.exec(schema);
    mockDb.prepare("INSERT INTO products (id, name) VALUES (1, 'صنف')").run();
    mockDb.prepare(`
      INSERT INTO product_variants (id, product_id, sku, purchase_price, selling_price, stock_quantity)
      VALUES (1, 1, 'SKU-1', 50, 114, 100)
    `).run();
  });

  beforeEach(() => {
    mockDb.exec('DELETE FROM einvoice_documents; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM settings;');
    mockDb.prepare('UPDATE product_variants SET eta_item_code = NULL').run();
  });

  function enableSystem(overrides = {}) {
    einvoice.saveConfig({ ...VALID_CONFIG, ...overrides });
  }

  test('ما يسجلش حاجة والمنظومة مقفولة', () => {
    seedSale();
    expect(einvoice.enqueueSale(1)).toBeNull();
    expect(einvoiceRepo.countsByStatus().pending).toBe(0);
  });

  test('يرفض تفعيل المنظومة ببيانات ناقصة ويفضل مقفول', () => {
    expect(() => einvoice.saveConfig({ enabled: true, taxNumber: '123' })).toThrow(/استكمال/);
    expect(einvoice.getConfig().enabled).toBe(false);
  });

  test('كل بيعة بتدخل الطابور مرة واحدة بس', () => {
    enableSystem();
    seedSale();

    const row = einvoice.enqueueSale(1);
    expect(row.status).toBe('pending');
    expect(row.internal_id).toBe('INV-1');
    expect(einvoice.enqueueSale(1)).toBeNull();
    expect(einvoiceRepo.countsByStatus().pending).toBe(1);
  });

  test('فشل بناء المستند ما يرميش استثناء للبيع', () => {
    enableSystem();
    expect(einvoice.enqueueSale(999)).toBeNull();
  });

  test('من غير أداة توقيع الفواتير بتتسجل ولا بتتبعت', async () => {
    enableSystem({ clientId: 'abc', clientSecret: 'secret' });
    seedSale();
    einvoice.enqueueSale(1);

    await expect(einvoice.flush()).resolves.toMatchObject({ skipped: 'signer', sent: 0 });
    expect(einvoiceRepo.getBySaleId(1).status).toBe('pending');
  });

  test('من غير بيانات دخول البوابة ما بيحاولش يبعت', async () => {
    enableSystem({ signerPath: 'C:/eta/sign.exe' });
    seedSale();
    einvoice.enqueueSale(1);

    await expect(einvoice.flush()).resolves.toMatchObject({ skipped: 'credentials' });
  });

  test('المرفوض يرجع للطابور بمستند متبني من جديد', async () => {
    enableSystem();
    seedSale();
    const row = einvoice.enqueueSale(1);
    einvoiceRepo.markStatus(row.id, 'rejected', { errorMessage: 'كود الصنف غير صحيح' });

    mockDb.prepare("UPDATE product_variants SET eta_item_code = 'EG-123456789-777' WHERE id = 1").run();
    await einvoice.resubmit(row.id);

    const updated = einvoiceRepo.getById(row.id);
    expect(updated.status).toBe('pending');
    expect(updated.error_message).toBeNull();
    expect(JSON.parse(updated.document_json).invoiceLines[0].itemCode).toBe('EG-123456789-777');
  });

  test('الجاهز للإرسال هو المعلّق والمتعثر فقط، والمرفوض بيستنى المستخدم', () => {
    enableSystem();
    const pending = einvoice.enqueueSale(seedSale({ id: 1 }));
    const failed = einvoice.enqueueSale(seedSale({ id: 2 }));
    const rejected = einvoice.enqueueSale(seedSale({ id: 3 }));
    einvoiceRepo.markFailed(failed.id, 'النت فاصل');
    einvoiceRepo.markStatus(rejected.id, 'rejected', { errorMessage: 'مرفوض' });

    expect(einvoiceRepo.listSendable().map((r) => r.id).sort()).toEqual([pending.id, failed.id].sort());
    expect(einvoiceRepo.getById(failed.id).attempts).toBe(1);
  });

  test('المستندات المرسلة بتستنى حالة المصلحة لما يكون ليها uuid', () => {
    enableSystem();
    const row = einvoice.enqueueSale(seedSale());
    einvoiceRepo.markSubmitted(row.id, { submissionUuid: 'S1', documentUuid: 'D1', longId: null });

    expect(einvoiceRepo.listAwaitingStatus().map((r) => r.document_uuid)).toEqual(['D1']);
    expect(einvoiceRepo.getById(row.id).status).toBe('submitted');
  });

  test('الفاتورة اللي مالهاش معرّف عند المصلحة ما بتتسألش عن حالتها', () => {
    enableSystem();
    const row = einvoice.enqueueSale(seedSale());
    // المصلحة قبلت الدفعة بس ما رجّعتش uuid للمستند: الاستعلام بـ null بيفضل
    // يفشل كل مرة من غير فايدة، فالصف ده بيتستنى بدل ما يتسأل عنه.
    einvoiceRepo.markSubmitted(row.id, { submissionUuid: 'S1', documentUuid: null, longId: null });

    expect(einvoiceRepo.listAwaitingStatus('invoice')).toEqual([]);
    expect(einvoiceRepo.getById(row.id).status).toBe('submitted');
  });

  test('سر البوابة ما بيخرجش للواجهة', () => {
    enableSystem({ clientId: 'abc', clientSecret: 'super-secret' });
    const config = einvoice.getConfig();

    expect(config.hasClientSecret).toBe(true);
    expect(JSON.stringify(config)).not.toContain('super-secret');
    expect(SettingsRepository.getAll().eta_client_secret).toBeUndefined();
  });

  test('السر الفاضي ما بيمسحش السر المحفوظ', () => {
    enableSystem({ clientSecret: 'secret-1' });
    enableSystem({ clientSecret: '' });
    expect(einvoice.getConfig().hasClientSecret).toBe(true);
  });

  test('تكويد الأصناف: القائمة الناقصة بتقل بعد الحفظ', () => {
    expect(einvoice.listItemCodes({ onlyMissing: true })).toHaveLength(1);
    einvoice.setItemCode(1, ' EG-123456789-777 ');
    expect(einvoice.listItemCodes({ onlyMissing: true })).toHaveLength(0);
    expect(einvoice.listItemCodes()[0].etaItemCode).toBe('EG-123456789-777');
  });

  test('كود لصنف غير موجود بيترفض', () => {
    expect(() => einvoice.setItemCode(404, 'X')).toThrow(/غير موجود/);
    expect(() => einvoice.setItemCode(0, 'X')).toThrow(/غير صالح/);
  });

  describe('وضع الإيصال الإلكتروني', () => {
    const RECEIPT_CONFIG = { documentKind: 'receipt', deviceSerial: 'POS-0001' };

    test('ما ينفعش يتفعّل بغير الرقم المسلسل لنقطة البيع', () => {
      expect(() => einvoice.saveConfig({ ...VALID_CONFIG, documentKind: 'receipt' }))
        .toThrow(/الرقم المسلسل/);
      expect(einvoice.getConfig().enabled).toBe(false);
    });

    test('المبيعة بتتسجل كإيصال ببصمته', () => {
      enableSystem(RECEIPT_CONFIG);
      const row = einvoice.enqueueSale(seedSale());

      expect(row.document_kind).toBe('receipt');
      expect(row.uuid).toMatch(/^[0-9a-f]{64}$/);
      expect(row.previous_uuid).toBeNull();
      expect(JSON.parse(row.document_json).documentType.receiptType).toBe('S');
    });

    test('كل إيصال بيتربط بالبصمة اللي قبله', () => {
      enableSystem(RECEIPT_CONFIG);
      const first = einvoice.enqueueSale(seedSale({ id: 1 }));
      const second = einvoice.enqueueSale(seedSale({ id: 2 }));

      expect(second.previous_uuid).toBe(first.uuid);
      expect(JSON.parse(second.document_json).header.previousUUID).toBe(first.uuid);
      expect(einvoiceRepo.getLastReceiptUuid()).toBe(second.uuid);
    });

    test('السلسلة بتكمل من آخر إيصال حتى لو اللي قبله اترفض', () => {
      enableSystem(RECEIPT_CONFIG);
      const first = einvoice.enqueueSale(seedSale({ id: 1 }));
      einvoiceRepo.markStatus(first.id, 'rejected', { errorMessage: 'مرفوض' });
      const second = einvoice.enqueueSale(seedSale({ id: 2 }));

      expect(second.previous_uuid).toBe(first.uuid);
    });

    test('إعادة إرسال الإيصال ما بتغيّرش بصمته ولا محتواه', async () => {
      enableSystem(RECEIPT_CONFIG);
      const row = einvoice.enqueueSale(seedSale());
      einvoiceRepo.markStatus(row.id, 'rejected', { errorMessage: 'مرفوض' });

      mockDb.prepare("UPDATE product_variants SET eta_item_code = 'EG-123456789-777' WHERE id = 1").run();
      await einvoice.resubmit(row.id);

      const updated = einvoiceRepo.getById(row.id);
      expect(updated.status).toBe('pending');
      expect(updated.uuid).toBe(row.uuid);
      expect(updated.document_json).toBe(row.document_json);
    });

    test('الطابور بيفصل الإيصالات عن الفواتير', () => {
      enableSystem();
      const invoice = einvoice.enqueueSale(seedSale({ id: 1 }));
      enableSystem(RECEIPT_CONFIG);
      const receipt = einvoice.enqueueSale(seedSale({ id: 2 }));

      expect(einvoiceRepo.listSendable('invoice').map((r) => r.id)).toEqual([invoice.id]);
      expect(einvoiceRepo.listSendable('receipt').map((r) => r.id)).toEqual([receipt.id]);
      expect(einvoice.getQueue().documents.map((d) => d.document_kind).sort())
        .toEqual(['invoice', 'receipt']);
    });

    test('الإيصالات بتتبعت بترتيب سلسلتها', () => {
      enableSystem(RECEIPT_CONFIG);
      const ids = [1, 2, 3].map((id) => einvoice.enqueueSale(seedSale({ id })).id);
      expect(einvoiceRepo.listSendable('receipt').map((r) => r.id)).toEqual(ids);
    });
  });
});
