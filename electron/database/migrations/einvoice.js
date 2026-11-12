const { addColumnIfMissing } = require('./helpers');

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
}

module.exports = { ensureEInvoice };
