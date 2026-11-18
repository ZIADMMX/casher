// اتصال منظومة الفاتورة الإلكترونية: رمز الدخول، إرسال المستندات، وحالة المستند.
const { guardedFetch } = require('../circuitBreaker.service');

const TOKEN_SAFETY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

let cachedToken = null; // { value, expiresAt, clientId, environment }

function resetTokenCache() {
  cachedToken = null;
}

async function request(url, options) {
  const response = await guardedFetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  return { ok: response.ok, status: response.status, body };
}

async function getAccessToken(config) {
  const now = Date.now();
  if (cachedToken
    && cachedToken.clientId === config.clientId
    && cachedToken.environment === config.environment
    && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now) {
    return cachedToken.value;
  }

  const { ok, body } = await request(`${config.endpoints.identity}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'InvoicingAPI',
    }).toString(),
  });

  if (!ok || !body?.access_token) {
    throw new Error('تعذر تسجيل الدخول على بوابة الضرائب. راجع Client ID و Client Secret.');
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: now + (Number(body.expires_in) || 3600) * 1000,
    clientId: config.clientId,
    environment: config.environment,
  };
  return cachedToken.value;
}

/**
 * يرسل مستندًا موقّعًا واحدًا.
 * @returns {Promise<{submissionUuid: string, documentUuid: string|null, longId: string|null}>}
 */
async function submitDocument(signedDocument, config) {
  const token = await getAccessToken(config);
  const { ok, status, body } = await request(`${config.endpoints.api}/documentsubmissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ documents: [signedDocument] }),
  });

  if (status === 401) {
    resetTokenCache();
    throw new Error('انتهت صلاحية جلسة بوابة الضرائب. سيعاد المحاولة تلقائيًا.');
  }

  const rejected = body?.rejectedDocuments?.[0];
  if (rejected) {
    const detail = rejected.error?.details?.map((d) => d.message).filter(Boolean).join(' · ')
      || rejected.error?.message
      || 'المستند مرفوض من المصلحة';
    const error = new Error(detail);
    error.code = 'ETA_REJECTED';
    throw error;
  }

  if (!ok || !body?.submissionId) {
    throw new Error(body?.error?.message || `تعذر إرسال الفاتورة إلى المصلحة (رمز ${status})`);
  }

  const accepted = body.acceptedDocuments?.[0] || null;
  return {
    submissionUuid: String(body.submissionId),
    documentUuid: accepted?.uuid || null,
    longId: accepted?.longId || null,
  };
}

/**
 * الإيصال الإلكتروني بيتبعت دفعات (منظومة منفصلة عن الفاتورة وليها endpoint تاني).
 * @param {object[]} signedReceipts إيصالات موقّعة بترتيب سلسلتها
 * @returns {Promise<{submissionUuid: string, accepted: string[], rejected: Map<string, string>}>}
 */
async function submitReceipts(signedReceipts, config) {
  const token = await getAccessToken(config);
  const { ok, status, body } = await request(`${config.endpoints.api}/receiptsubmissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receipts: signedReceipts }),
  });

  if (status === 401) {
    resetTokenCache();
    throw new Error('انتهت صلاحية جلسة بوابة الضرائب. سيعاد المحاولة تلقائيًا.');
  }
  if (!ok || !body?.submissionId) {
    throw new Error(body?.error?.message || `تعذر إرسال الإيصالات إلى المصلحة (رمز ${status})`);
  }

  // المصلحة بترد بالمقبول والمرفوض داخل نفس الدفعة، فكل إيصال بياخد نتيجته.
  const rejected = new Map();
  for (const item of body.rejectedReceipts || []) {
    const detail = item.error?.details?.map((d) => d.message).filter(Boolean).join(' · ')
      || item.error?.message
      || 'الإيصال مرفوض من المصلحة';
    if (item.uuid) rejected.set(item.uuid, detail);
  }

  return {
    submissionUuid: String(body.submissionId),
    accepted: (body.acceptedDocuments || []).map((item) => item.uuid).filter(Boolean),
    rejected,
  };
}

/** حالة دفعة إيصالات بعد مراجعتها. */
async function getReceiptSubmissionStatus(submissionUuid, config) {
  const token = await getAccessToken(config);
  const { ok, body } = await request(
    `${config.endpoints.api}/receiptsubmissions/${encodeURIComponent(submissionUuid)}/details`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!ok) throw new Error('تعذر قراءة حالة الإيصالات من المصلحة');

  const byUuid = new Map();
  for (const item of body?.receipts || []) {
    if (!item.uuid) continue;
    byUuid.set(item.uuid, {
      status: String(item.status || '').toLowerCase(),
      reason: item.errors?.map((e) => e.message).filter(Boolean).join(' · ') || null,
    });
  }
  return byUuid;
}

/**
 * يقرأ حالة مستند بعد ما تراجعه المصلحة (Valid / Invalid / Rejected / Cancelled).
 */
async function getDocumentStatus(documentUuid, config) {
  const token = await getAccessToken(config);
  const { ok, body } = await request(
    `${config.endpoints.api}/documents/${encodeURIComponent(documentUuid)}/details`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!ok) throw new Error('تعذر قراءة حالة الفاتورة من المصلحة');
  return {
    status: String(body?.status || '').toLowerCase(),
    longId: body?.longId || null,
    reason: body?.validationResults?.validationSteps
      ?.filter((step) => step.status && step.status.toLowerCase() !== 'valid')
      ?.map((step) => step.error?.message || step.error?.details?.[0]?.message)
      ?.filter(Boolean)
      ?.join(' · ') || null,
  };
}

module.exports = {
  getAccessToken,
  submitDocument,
  getDocumentStatus,
  submitReceipts,
  getReceiptSubmissionStatus,
  resetTokenCache,
};
