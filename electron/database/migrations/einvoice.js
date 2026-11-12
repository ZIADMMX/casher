const { addColumnIfMissing, assertNoNewForeignKeyViolations, foreignKeyViolationCounts } = require('./helpers');

/**
 * المرتجع بيطلّع مستند تاني على نفس المبيعة (إشعار خصم / إيصال استرداد)، والجدول
 * كان مقفول بـ `sale_id UNIQUE` فمستند المرتجع ما كانش ينفع يتسجّل أصلاً.
 * SQLite ما بتشيلش قيد UNIQUE من عمود، فالجدول بيتعاد بناؤه مرة واحدة والقيد
 * بيبقى على (sale_id, return_id) — و`return_id = 0` معناها مستند المبيعة نفسها.
 */
function upgradeForReturns(database) {
  const columns = database.prepare('PRAGMA table_info(einvoice_documents)').all();
  if (columns.some((column) => column.name === 'return_id')) return;

  const foreignKeysWereOn = database.pragma('foreign_keys', { simple: true }) === 1;
  const fkBefore = foreignKeyViolationCounts(database);
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE einvoice_documents_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            return_id INTEGER NOT NULL DEFAULT 0,
            internal_id TEXT NOT NULL,
            document_kind TEXT NOT NULL DEFAULT 'invoice' CHECK(document_kind IN ('invoice', 'receipt')),
            uuid TEXT,
            previous_uuid TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'submitted', 'valid', 'invalid', 'rejected', 'cancelled', 'failed')),
            document_json TEXT NOT NULL,
            submission_uuid TEXT,
            document_uuid TEXT,
            long_id TEXT,
            error_message TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            submitted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
        );
        INSERT INTO einvoice_documents_new
          (id, sale_id, return_id, internal_id, document_kind, uuid, previous_uuid, status,
           document_json, submission_uuid, document_uuid, long_id, error_message, attempts,
           submitted_at, created_at, updated_at)
        SELECT id, sale_id, 0, internal_id, document_kind, uuid, previous_uuid, status,
           document_json, submission_uuid, document_uuid, long_id, error_message, attempts,
           submitted_at, created_at, updated_at
        FROM einvoice_documents;
        DROP TABLE einvoice_documents;
        ALTER TABLE einvoice_documents_new RENAME TO einvoice_documents;
        CREATE INDEX IF NOT EXISTS idx_einvoice_status ON einvoice_documents(status);
        CREATE INDEX IF NOT EXISTS idx_einvoice_created ON einvoice_documents(created_at);
        CREATE INDEX IF NOT EXISTS idx_einvoice_kind ON einvoice_documents(document_kind, id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_doc_key
          ON einvoice_documents(sale_id, return_id);
      `);
      assertNoNewForeignKeyViolations(fkBefore, 'einvoice_documents', database);
    })();
  } finally {
    if (foreignKeysWereOn) database.pragma('foreign_keys = ON');
  }
}

// طابور الفاتورة الإلكترونية: كل مبيعة لها مستند واحد بحالته ومعرفاته عند المصلحة.
// المستند بيتخزن محليًا الأول عشان البيع ما يقفش لو النت فاصل (وضع offline).
function ensureEInvoice(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS einvoice_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL UNIQUE,
        internal_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'submitted', 'valid', 'invalid', 'rejected', 'cancelled', 'failed')),
        document_json TEXT NOT NULL,
        submission_uuid TEXT,
        document_uuid TEXT,
        long_id TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        submitted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_einvoice_status ON einvoice_documents(status);
    CREATE INDEX IF NOT EXISTS idx_einvoice_created ON einvoice_documents(created_at);
  `);

  // كود الصنف لدى المصلحة (EGS أو GS1). الفاضي بيقع على الكود الافتراضي في الإعدادات.
  addColumnIfMissing('product_variants', 'eta_item_code', 'TEXT', dbInstance);

  // الإيصال الإلكتروني: نفس الطابور، بس مستند من نوع تاني وله سلسلة uuid
  // (كل إيصال بيشاور على اللي قبله) عشان المصلحة تتأكد إن مفيش إيصال اتشال.
  addColumnIfMissing(
    'einvoice_documents',
    'document_kind',
    "TEXT NOT NULL DEFAULT 'invoice' CHECK(document_kind IN ('invoice', 'receipt'))",
    dbInstance
  );
  addColumnIfMissing('einvoice_documents', 'uuid', 'TEXT', dbInstance);
  addColumnIfMissing('einvoice_documents', 'previous_uuid', 'TEXT', dbInstance);
  dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_einvoice_kind ON einvoice_documents(document_kind, id);');

  // آخر خطوة: إعادة البناء محتاجة كل الأعمدة اللي فوق تكون موجودة.
  upgradeForReturns(dbInstance);
  // القاعدة الجديدة بتاخد return_id من schema.sql فإعادة البناء بتعدّيها،
  // والقيد لازم يتعمل في الحالتين: مستند واحد لكل (مبيعة، مرتجع).
  dbInstance.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_doc_key
      ON einvoice_documents(sale_id, return_id);
  `);
}

module.exports = { ensureEInvoice };
