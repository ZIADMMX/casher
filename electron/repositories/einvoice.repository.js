const { db } = require('../database/db');

const LIST_COLUMNS = `
  d.id, d.sale_id, d.internal_id, d.document_kind, d.uuid, d.status, d.submission_uuid, d.document_uuid,
  d.long_id, d.error_message, d.attempts, d.submitted_at, d.created_at, d.updated_at,
  s.total_amount, s.customer_name, s.invoice_number
`;

const EInvoiceRepository = {
  getBySaleId(saleId) {
    return db.prepare('SELECT * FROM einvoice_documents WHERE sale_id = ?').get(saleId) || null;
  },

  getById(id) {
    return db.prepare('SELECT * FROM einvoice_documents WHERE id = ?').get(id) || null;
  },

  // إدراج آمن: لو المبيعة مسجّلة قبل كده ما يتعملش مستند تاني.
  enqueue({ saleId, internalId, documentJson, kind = 'invoice', uuid = null, previousUuid = null }) {
    const result = db.prepare(`
      INSERT OR IGNORE INTO einvoice_documents
        (sale_id, internal_id, document_json, document_kind, uuid, previous_uuid)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(saleId, internalId, documentJson, kind, uuid, previousUuid);
    return result.changes > 0 ? EInvoiceRepository.getBySaleId(saleId) : null;
  },

  // آخر حلقة في سلسلة الإيصالات: الإيصال الجديد بيشاور عليها.
  // بيتقرا من كل الإيصالات المسجلة مهما كانت حالتها، لأن السلسلة بتتبني وقت
  // الإصدار مش وقت القبول.
  getLastReceiptUuid() {
    const row = db.prepare(`
      SELECT uuid FROM einvoice_documents
      WHERE document_kind = 'receipt' AND uuid IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `).get();
    return row ? row.uuid : null;
  },

  markSubmitted(id, { submissionUuid, documentUuid, longId }) {
    return db.prepare(`
      UPDATE einvoice_documents
      SET status = 'submitted', submission_uuid = ?, document_uuid = ?, long_id = ?,
          error_message = NULL, attempts = attempts + 1,
          submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(submissionUuid, documentUuid, longId, id);
  },

  markStatus(id, status, { longId = null, errorMessage = null } = {}) {
    return db.prepare(`
      UPDATE einvoice_documents
      SET status = ?, long_id = COALESCE(?, long_id), error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, longId, errorMessage, id);
  },

  markFailed(id, errorMessage) {
    return db.prepare(`
      UPDATE einvoice_documents
      SET status = 'failed', error_message = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(errorMessage || '').slice(0, 500), id);
  },

  // إعادة إرسال المرفوض: يرجع للطابور بمستند محدّث.
  requeue(id, documentJson) {
    return db.prepare(`
      UPDATE einvoice_documents
      SET status = 'pending', document_json = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(documentJson, id);
  },

  // إعادة إرسال بغير إعادة بناء: الإيصال الإلكتروني بصمته جزء من سلسلة،
  // فتغيير محتواه بيكسر ربط الإيصالات اللي بعده.
  requeueSame(id) {
    return db.prepare(`
      UPDATE einvoice_documents
      SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  },

  // الجاهز للإرسال: الجديد والمتعثر. المرفوض بيستنى تدخل المستخدم.
  // الترتيب بالـ id لأن الإيصالات لازم تتبعت بترتيب سلسلتها.
  listSendable(kind = 'invoice', limit = 20) {
    return db.prepare(`
      SELECT * FROM einvoice_documents
      WHERE status IN ('pending', 'failed') AND document_kind = ?
      ORDER BY id ASC
      LIMIT ?
    `).all(kind, limit);
  },

  listAwaitingStatus(kind = 'invoice', limit = 20) {
    return db.prepare(`
      SELECT * FROM einvoice_documents
      WHERE status = 'submitted' AND document_kind = ?
        AND COALESCE(document_uuid, submission_uuid) IS NOT NULL
      ORDER BY submitted_at ASC
      LIMIT ?
    `).all(kind, limit);
  },

  list({ status = null, limit = 100 } = {}) {
    if (status) {
      return db.prepare(`
        SELECT ${LIST_COLUMNS} FROM einvoice_documents d
        JOIN sales s ON s.id = d.sale_id
        WHERE d.status = ? ORDER BY d.created_at DESC LIMIT ?
      `).all(status, limit);
    }
    return db.prepare(`
      SELECT ${LIST_COLUMNS} FROM einvoice_documents d
      JOIN sales s ON s.id = d.sale_id
      ORDER BY d.created_at DESC LIMIT ?
    `).all(limit);
  },

  countsByStatus() {
    const rows = db.prepare('SELECT status, COUNT(*) AS count FROM einvoice_documents GROUP BY status').all();
    const counts = { pending: 0, submitted: 0, valid: 0, invalid: 0, rejected: 0, cancelled: 0, failed: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  // تكويد الأصناف لدى المصلحة (EGS/GS1). الفاضي بيقع على الكود الافتراضي.
  listItemCodes({ onlyMissing = false, limit = 200 } = {}) {
    const where = onlyMissing ? "WHERE pv.eta_item_code IS NULL OR TRIM(pv.eta_item_code) = ''" : '';
    return db.prepare(`
      SELECT pv.id AS variantId, pv.sku, pv.size, pv.color, pv.eta_item_code AS etaItemCode,
             p.name AS productName
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      ${where}
      ORDER BY p.name, pv.id
      LIMIT ?
    `).all(limit);
  },

  setItemCode(variantId, code) {
    const id = Number(variantId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('الصنف غير صالح');
    const value = String(code ?? '').trim();
    const result = db.prepare('UPDATE product_variants SET eta_item_code = ? WHERE id = ?')
      .run(value === '' ? null : value, id);
    if (result.changes === 0) throw new Error('الصنف غير موجود');
    return { variantId: id, etaItemCode: value || null };
  },
};

module.exports = EInvoiceRepository;
