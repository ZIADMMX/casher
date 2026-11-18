// Sends "Rate Fox" reviews to the vendor's cloud (license Worker, POST /api/reviews).
// Reads the review_sync_queue. A local account's entry is removed once the cloud has it;
// a central (LAN) account's entry stays for the central sync, and the cloud copy is
// remembered in review_cloud_state so it is not sent again.
const crypto = require('node:crypto');
const { db } = require('../database/db');
const reviewsRepo = require('../repositories/reviews.repository');
const { guardedFetch } = require('./circuitBreaker.service');

const MAX_LOGO_CHARS = 400_000;
const BATCH = 20;
let running = null;

function ensureStateTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS review_cloud_state (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, user_id)
    )
  `).run();
}

function endpoint() {
  const timeUrl = require('./licenseClock.service').getTimeEndpoint();
  return timeUrl ? new URL('/api/reviews', timeUrl).toString() : null;
}

function hashOf(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function toCloudReview(entry) {
  const p = entry.payload || {};
  const logo = typeof p.businessLogo === 'string' && p.businessLogo.length <= MAX_LOGO_CHARS ? p.businessLogo : null;
  return {
    tenantId: entry.tenantId,
    userId: entry.userId,
    rating: p.rating,
    tags: p.tags || [],
    comment: p.comment || null,
    consent: p.consent === true,
    sector: p.sector || null,
    appVersion: p.appVersion || null,
    businessName: p.consent ? p.businessName || null : null,
    businessLogo: p.consent ? logo : null,
  };
}

async function sendPending(fetchImpl) {
  let url;
  try {
    url = endpoint();
  } catch {
    url = null;
  }
  if (!url) return { sent: 0, skipped: true, error: 'السحابة غير مضبوطة في هذه النسخة' };

  ensureStateTable();
  const sentHash = db.prepare('SELECT payload_hash FROM review_cloud_state WHERE tenant_id = ? AND user_id = ?');
  const due = reviewsRepo.getPendingSync()
    .map((entry) => ({ entry, review: toCloudReview(entry) }))
    .filter(({ entry, review }) => sentHash.get(entry.tenantId, String(entry.userId))?.payload_hash !== hashOf(review))
    .slice(0, BATCH);
  if (due.length === 0) return { sent: 0 };

  const { getDeviceId } = require('../security/deviceId');
  let res;
  try {
    res = await guardedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: getDeviceId(), reviews: due.map(({ review }) => review) }),
      signal: AbortSignal.timeout(15_000),
    }, fetchImpl);
  } catch {
    return { sent: 0, error: 'تعذر الاتصال بالسحابة؛ هيتبعت التقييم تلقائيًا لما النت يرجع.' };
  }
  if (!res.ok) return { sent: 0, error: `رفضت السحابة التقييم (${res.status})` };

  const remember = db.prepare(`
    INSERT INTO review_cloud_state (tenant_id, user_id, payload_hash) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, user_id) DO UPDATE SET payload_hash = excluded.payload_hash, synced_at = CURRENT_TIMESTAMP
  `);
  for (const { entry, review } of due) {
    remember.run(entry.tenantId, String(entry.userId), hashOf(review));
    if (entry.tenantId === 'local') reviewsRepo.removePendingSync(entry.id);
  }
  return { sent: due.length };
}

// One sync at a time; callers that arrive meanwhile share its result. Never throws.
function syncPending(fetchImpl = globalThis.fetch) {
  if (!running) {
    running = sendPending(fetchImpl)
      .catch((error) => ({ sent: 0, error: error.message }))
      .finally(() => { running = null; });
  }
  return running;
}

module.exports = { syncPending, toCloudReview };
