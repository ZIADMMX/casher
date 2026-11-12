// منظومة الفاتورة والإيصال الإلكتروني المصرية — خدمة واحدة مشتركة لكل القطاعات.
// المستند بيتسجل محليًا وقت البيع (حتى لو النت فاصل)، وبعدين يتوقّع ويتبعت
// للمصلحة في الخلفية، وحالته بتتحدّث لحد ما يبقى «مقبول».
//
// منظومتين منفصلتين عند المصلحة والاتنين هنا على نفس الطابور:
//  - **الفاتورة الإلكترونية**: مستند لكل فاتورة، بيتبعت واحد واحد.
//  - **الإيصال الإلكتروني**: للكاشير وبيع التجزئة، بيتبعت دفعات، وكل إيصال
//    مربوط ببصمة اللي قبله (سلسلة).
// المنشأة بتشتغل بواحدة منهم حسب تسجيلها (إعداد `documentKind`).
const salesRepo = require('../../repositories/sales.repository');
const einvoiceRepo = require('../../repositories/einvoice.repository');
const { logError } = require('../logger.service');
const { getConfig, getPublicConfig, saveConfig, validateConfig, validateCredentials } = require('./config');
const { buildInvoiceDocument, serialize } = require('./document');
const { buildReceiptDocument } = require('./receipt');
const { signDocument, attachSignature, isSignerConfigured } = require('./signer');
const client = require('./client');

const MAX_PER_FLUSH = 20;
const MAX_RECEIPTS_PER_BATCH = 100; // حد المصلحة للدفعة الواحدة

function buildDocumentForSale(saleId, config = getConfig(), { previousUuid = null } = {}) {
  const sale = salesRepo.getById(saleId);
  if (!sale) throw new Error('الفاتورة غير موجودة');
  if (config.documentKind === 'receipt') {
    return { sale, document: buildReceiptDocument(sale, config, previousUuid), kind: 'receipt' };
  }
  return { sale, document: buildInvoiceDocument(sale, config), kind: 'invoice' };
}

/**
 * يسجّل المبيعة في الطابور. ما بيرميش استثناء للبيع:
 * فشل التسجيل هنا ما ينفعش يمنع الكاشير من إتمام البيع.
 */
function enqueueSale(saleId) {
  try {
    const config = getConfig();
    if (!config.enabled) return null;
    const { valid } = validateConfig(config);
    if (!valid) throw new Error('إعدادات المستندات الإلكترونية غير مكتملة');

    const isReceipt = config.documentKind === 'receipt';
    const previousUuid = isReceipt ? einvoiceRepo.getLastReceiptUuid() : null;
    const { document, kind } = buildDocumentForSale(saleId, config, { previousUuid });

    return einvoiceRepo.enqueue({
      saleId,
      internalId: isReceipt ? document.header.receiptNumber : document.internalID,
      documentJson: JSON.stringify(document),
      kind,
      uuid: isReceipt ? document.header.uuid : null,
      previousUuid: isReceipt ? previousUuid : null,
    });
  } catch (err) {
    logError('EInvoiceEnqueue', err);
    return null;
  }
}

async function signRow(row, config) {
  const document = JSON.parse(row.document_json);
  const signature = await signDocument(serialize(document), config);
  return attachSignature(document, signature);
}

function recordFailure(row, err, summary) {
  if (err?.code === 'ETA_REJECTED') {
    einvoiceRepo.markStatus(row.id, 'rejected', { errorMessage: err.message });
  } else {
    einvoiceRepo.markFailed(row.id, err.message);
  }
  summary.failed += 1;
  logError('EInvoiceSubmit', err);
}

async function flushInvoices(config, summary) {
  for (const row of einvoiceRepo.listSendable('invoice', MAX_PER_FLUSH)) {
    try {
      const result = await client.submitDocument(await signRow(row, config), config);
      einvoiceRepo.markSubmitted(row.id, result);
      summary.sent += 1;
    } catch (err) {
      recordFailure(row, err, summary);
    }
  }

  for (const row of einvoiceRepo.listAwaitingStatus('invoice', MAX_PER_FLUSH)) {
    try {
      const { status, longId, reason } = await client.getDocumentStatus(row.document_uuid, config);
      if (!status || status === 'submitted') continue;
      const known = ['valid', 'invalid', 'rejected', 'cancelled'].includes(status) ? status : 'invalid';
      einvoiceRepo.markStatus(row.id, known, { longId, errorMessage: known === 'valid' ? null : reason });
      summary.updated += 1;
    } catch (err) {
      logError('EInvoiceStatus', err);
    }
  }
}

async function flushReceipts(config, summary) {
  // الترتيب هنا مقصود: الإيصالات بتتبعت بترتيب سلسلتها، فأي حلقة متعثرة
  // بتوقف الدفعة بدل ما تعدّيها وتبعت اللي بعدها.
  const rows = einvoiceRepo.listSendable('receipt', MAX_RECEIPTS_PER_BATCH);
  if (rows.length > 0) {
    // التوقيع واحد واحد بالترتيب: أول إيصال يفشل توقيعه بيوقف الباقي، لأن
    // تخطّيه معناه إرسال إيصال قبل اللي بيشاور عليه.
    const batch = [];
    for (const row of rows) {
      try {
        batch.push({ row, receipt: await signRow(row, config) });
      } catch (err) {
        einvoiceRepo.markFailed(row.id, err.message);
        summary.failed += 1;
        logError('EReceiptSign', err);
        break;
      }
    }
    if (batch.length > 0) {
      try {
        const result = await client.submitReceipts(batch.map((entry) => entry.receipt), config);
        for (const { row } of batch) {
          const rejection = result.rejected.get(row.uuid);
          if (rejection) {
            einvoiceRepo.markStatus(row.id, 'rejected', { errorMessage: rejection });
            summary.failed += 1;
          } else {
            einvoiceRepo.markSubmitted(row.id, {
              submissionUuid: result.submissionUuid,
              documentUuid: row.uuid,
              longId: null,
            });
            summary.sent += 1;
          }
        }
      } catch (err) {
        for (const { row } of batch) recordFailure(row, err, summary);
      }
    }
  }

  // حالة الدفعات المرسلة: استعلام واحد لكل دفعة مهما كان عدد إيصالاتها.
  const awaiting = einvoiceRepo.listAwaitingStatus('receipt', MAX_RECEIPTS_PER_BATCH);
  const bySubmission = new Map();
  for (const row of awaiting) {
    if (!row.submission_uuid) continue;
    if (!bySubmission.has(row.submission_uuid)) bySubmission.set(row.submission_uuid, []);
    bySubmission.get(row.submission_uuid).push(row);
  }

  for (const [submissionUuid, submissionRows] of bySubmission) {
    try {
      const statuses = await client.getReceiptSubmissionStatus(submissionUuid, config);
      for (const row of submissionRows) {
        const result = statuses.get(row.uuid);
        if (!result?.status || result.status === 'submitted') continue;
        const known = ['valid', 'invalid', 'rejected', 'cancelled'].includes(result.status)
          ? result.status
          : 'invalid';
        einvoiceRepo.markStatus(row.id, known, {
          errorMessage: known === 'valid' ? null : result.reason,
        });
        summary.updated += 1;
      }
    } catch (err) {
      logError('EReceiptStatus', err);
    }
  }
}

/**
 * يبعت المستندات المنتظرة ويحدّث حالة اللي اتبعت. آمن للاستدعاء المتكرر.
 * بيعالج النوعين، فلو المنشأة غيّرت نظامها المستندات القديمة بتكمّل طريقها.
 * @returns {Promise<{sent: number, failed: number, updated: number, skipped?: string}>}
 */
async function flush() {
  const config = getConfig();
  const summary = { sent: 0, failed: 0, updated: 0 };
  if (!config.enabled) return { ...summary, skipped: 'disabled' };
  if (!validateConfig(config).valid) return { ...summary, skipped: 'config' };
  if (!validateCredentials(config).valid) return { ...summary, skipped: 'credentials' };
  if (!isSignerConfigured(config)) return { ...summary, skipped: 'signer' };

  await flushInvoices(config, summary);
  await flushReceipts(config, summary);
  return summary;
}

/** إعادة إرسال المرفوض. */
async function resubmit(documentId) {
  const row = einvoiceRepo.getById(documentId);
  if (!row) throw new Error('المستند غير موجود');
  const config = getConfig();
  const { valid, missing } = validateConfig(config);
  if (!valid) throw new Error(`أكمل إعدادات المستندات الإلكترونية أولًا: ${missing.join('، ')}`);

  if (row.document_kind === 'receipt') {
    // الإيصال بيتبعت زي ما هو: بصمته محسوبة على محتواه ومربوطة بالإيصال اللي
    // بعده، فإعادة بنائه بتكسر السلسلة.
    einvoiceRepo.requeueSame(row.id);
  } else {
    const { document } = buildDocumentForSale(row.sale_id, { ...config, documentKind: 'invoice' });
    einvoiceRepo.requeue(row.id, JSON.stringify(document));
  }
  return flush();
}

function getQueue({ status = null, limit = 100 } = {}) {
  return {
    documents: einvoiceRepo.list({ status, limit }),
    counts: einvoiceRepo.countsByStatus(),
    config: getPublicConfig(),
  };
}

/** معاينة المستند كما سيُرسل (للمراجعة وتشخيص الرفض). */
function previewSale(saleId) {
  const { document } = buildDocumentForSale(saleId);
  return document;
}

module.exports = {
  enqueueSale,
  flush,
  resubmit,
  getQueue,
  previewSale,
  getConfig: getPublicConfig,
  saveConfig,
  listItemCodes: (...args) => einvoiceRepo.listItemCodes(...args),
  setItemCode: (...args) => einvoiceRepo.setItemCode(...args),
};
