/**
 * @file einvoice.migration.test.js
 * @description ترقية قاعدة بيانات فيها طابور الفاتورة القديم (بغير أعمدة
 * الإيصال الإلكتروني). غلطة هنا معناها إن البرنامج ما بيفتحش عند عميل شغّال.
 */

const Database = require('better-sqlite3');
const { ensureEInvoice } = require('../../electron/database/migrations/einvoice');

// شكل الجدول في الإصدار 29، قبل الإيصال الإلكتروني.
const V29_SCHEMA = `
  CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
  CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id)
  );
  CREATE TABLE sales (id INTEGER PRIMARY KEY AUTOINCREMENT);
  CREATE TABLE einvoice_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
    internal_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    document_json TEXT NOT NULL,
    submission_uuid TEXT,
    document_uuid TEXT,
    long_id TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

describe('ترقية طابور المستندات الإلكترونية', () => {
  test('تضيف أعمدة الإيصال لقاعدة قديمة وتحافظ على الصفوف', () => {
    const db = new Database(':memory:');
    db.exec(V29_SCHEMA);
    db.prepare('INSERT INTO sales (id) VALUES (1)').run();
    db.prepare("INSERT INTO einvoice_documents (sale_id, internal_id, document_json) VALUES (1, 'INV-1', '{}')").run();

    ensureEInvoice(db);

    expect(columnsOf(db, 'einvoice_documents')).toEqual(
      expect.arrayContaining(['document_kind', 'uuid', 'previous_uuid'])
    );
    expect(columnsOf(db, 'product_variants')).toContain('eta_item_code');

    // الصفوف القديمة تفضل فواتير، مش إيصالات.
    const row = db.prepare('SELECT * FROM einvoice_documents WHERE sale_id = 1').get();
    expect(row.document_kind).toBe('invoice');
    expect(row.internal_id).toBe('INV-1');
  });

  test('تتكرر بغير أثر (آمنة لو اتشغلت تاني)', () => {
    const db = new Database(':memory:');
    db.exec(V29_SCHEMA);

    ensureEInvoice(db);
    expect(() => ensureEInvoice(db)).not.toThrow();
    expect(columnsOf(db, 'einvoice_documents').filter((name) => name === 'uuid')).toHaveLength(1);
  });

  test('تمنع نوع مستند غير معروف', () => {
    const db = new Database(':memory:');
    db.exec(V29_SCHEMA);
    db.prepare('INSERT INTO sales (id) VALUES (1)').run();
    ensureEInvoice(db);

    expect(() => db.prepare(`
      INSERT INTO einvoice_documents (sale_id, internal_id, document_json, document_kind)
      VALUES (1, 'X', '{}', 'something')
    `).run()).toThrow();
  });
});
