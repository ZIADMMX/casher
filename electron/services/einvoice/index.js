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
const returnsRepo = require('../../repositories/returns.repository');
const einvoiceRepo = require('../../repositories/einvoice.repository');
const { logError } = require('../logger.service');
const { getConfig, getPublicConfig, saveConfig, validateConfig, validateCredentials } = require('./config');
const { buildInvoiceDocument, serialize, round } = require('./document');
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

/**
 * مبيعة مصطنعة من المرتجع: بند واحد بالكمية المرتجعة، وفرق المبلغ المسترد عن
 * إجماليه بيتمرر كخصم فاتورة. كده حسابات الضريبة والخصم والتقريب بتتعمل بنفس
 * `prepareGrossLines` بتاعة الفاتورة، من غير حسابات فلوس تانية تتكتب من جديد.
 */
function saleFromReturn(sale, ret) {
  const item = (sale.items || []).find(
    (row) => Number(row.variant_id ?? row.variantId) === Number(ret.variant_id)
  );
  if (!item) throw new Error('الصنف المرتجع غير موجود في الفاتورة');

  const quantity = Number(ret.quantity) || 0;
  const gross = round(quantity * (Number(item.unit_price) || 0));
  const refund = round(Number(ret.refund_amount) || 0);
  return {
    ...sale,
    items: [{ ...item, quantity }],
    discount: Math.max(round(gross - refund), 0),
    service_charge: 0,
    total_amount: refund,
    created_at: ret.created_at,
    invoice_number: `${sale.invoice_number || sale.id}-R${ret.id}`,
  };
}

/**
 * المستند كما سيُرسل. بيرجّع null لإشعار خصم لسه فاتورته الأصلية ما اتقبلتش عند
 * المصلحة: الإشعار لازم يشاور على uuid الفاتورة، واللي ما بيتعرفش غير بعد قبولها.
 */
function documentForRow(row) {
  const document = JSON.parse(row.document_json);
  if (row.return_id && row.document_kind === 'invoice') {
    const origin = einvoiceRepo.getBySaleId(row.sale_id);
    if (!origin?.document_uuid) return null;
    document.references = [origin.document_uuid];
  }
  return document;
}

/**
 * يسجّل مرتجعًا في الطابور كإشعار خصم (منظومة الفاتورة) أو إيصال استرداد
 * (منظومة الإيصال) حسب نوع مستند المبيعة الأصلية نفسه، مش حسب الإعداد الحالي.
 * زي `enqueueSale`: ما بيرميش استثناء — عطل المنظومة ما ينفعش يمنع المرتجع.
 */
function enqueueReturn(returnId) {
  try {
    const config = getConfig();
    if (!config.enabled) return null;
    const { valid } = validateConfig(config);
    if (!valid) throw new Error('إعدادات المستندات الإلكترونية غير مكتملة');

    const ret = returnsRepo.getById(returnId);
    if (!ret) throw new Error('المرتجع غير موجود');
    // استبدال بغير مبلغ مسترد مالوش إشعار خصم.
    if (round(Number(ret.refund_amount) || 0) <= 0) return null;

    // المبيعة اللي ما اتبعتش للمصلحة أصلاً (بيع قبل تشغيل المنظومة) مالهاش
    // مستند يتعمل عليه إشعار خصم.
    const origin = einvoiceRepo.getBySaleId(ret.sale_id);
    if (!origin) return null;

    const sale = salesRepo.getById(ret.sale_id);
    if (!sale) throw new Error('الفاتورة غير موجودة');
    const creditSale = saleFromReturn(sale, ret);

    if (origin.document_kind === 'receipt') {
      const previousUuid = einvoiceRepo.getLastReceiptUuid();
      const document = buildReceiptDocument(creditSale, config, previousUuid, {
        receiptType: 'R',
        referenceOldUUID: origin.uuid,
      });
      return einvoiceRepo.enqueue({
        saleId: ret.sale_id,
        returnId,
        internalId: document.header.receiptNumber,
        documentJson: JSON.stringify(document),
        kind: 'receipt',
        uuid: document.header.uuid,
        previousUuid,
      });
    }

    // references بتتملى وقت الإرسال (documentForRow) لأن uuid الفاتورة الأصلية
    // ما بيتعرفش غير بعد ما المصلحة تقبلها.
    const document = buildInvoiceDocument(creditSale, config, { documentType: 'C' });
    return einvoiceRepo.enqueue({
      saleId: ret.sale_id,
      returnId,
      internalId: document.internalID,
      documentJson: JSON.stringify(document),
      kind: 'invoice',
    });
  } catch (err) {
    logError('EInvoiceEnqueueReturn', err);
    return null;
  }
}

async function signRow(row, config) {
  const document = documentForRow(row);
  if (!document) return null;
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
      const signed = await signRow(row, config);
      if (!signed) continue; // إشعار خصم مستني قبول فاتورته الأصلية
      const result = await client.submitDocument(signed, config);
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
  } else if (row.return_id) {
    const ret = returnsRepo.getById(row.return_id);
    const sale = ret ? salesRepo.getById(ret.sale_id) : null;
    if (!ret || !sale) throw new Error('المرتجع غير موجود');
    const document = buildInvoiceDocument(saleFromReturn(sale, ret), config, { documentType: 'C' });
    einvoiceRepo.requeue(row.id, JSON.stringify(document));
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
  enqueueReturn,
  documentForRow,
  flush,
  resubmit,
  getQueue,
  previewSale,
  getConfig: getPublicConfig,
  saveConfig,
  listItemCodes: (...args) => einvoiceRepo.listItemCodes(...args),
  setItemCode: (...args) => einvoiceRepo.setItemCode(...args),
};
