const crypto = require('node:crypto');
const repo = require('../repositories/webhooks.repository');

const WEBHOOK_EVENTS = ['sale.created', 'return.processed', 'customer.created'];
const DELIVERY_TIMEOUT_MS = 10000;
// Minutes to wait after the 1st, 2nd, 3rd, 4th failed delivery; the 5th failure gives up (last_error shows it).
const RETRY_WAIT_MINUTES = [1, 5, 30, 120];

function clean(data) {
  const name = String(data?.name || '').trim();
  const url = String(data?.url || '').trim();
  if (!name) throw new Error('اسم الويب هوك مطلوب');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('رابط الويب هوك غير صالح');
  }
  if (parsed.protocol !== 'https:') throw new Error('الرابط لازم يبدأ بـ https');
  const events = Array.isArray(data?.events) ? data.events.filter((e) => WEBHOOK_EVENTS.includes(e)) : [];
  if (!events.length) throw new Error('اختر حدثًا واحدًا على الأقل');
  return { name, url, events, is_active: data?.is_active !== false };
}

function sign(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

// One signed POST of an already built body; the result is stored on the row so the page shows the last delivery.
// retry = worth sending again later (no connection, timeout, 5xx, 429); a 4xx is the receiver refusing it.
async function send(hook, event, body) {
  // Hooks saved before HTTPS became mandatory are refused too; the user must edit them to an https:// address.
  if (!String(hook.url).startsWith('https://')) {
    const error = 'الرابط لازم يكون https';
    repo.recordDelivery(hook.id, null, error);
    return { ok: false, status: null, error, retry: false };
  }
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fox-Event': event,
        'X-Fox-Signature': sign(hook.secret, body),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    repo.recordDelivery(hook.id, response.status, response.ok ? null : `HTTP ${response.status}`);
    return { ok: response.ok, status: response.status, retry: response.status >= 500 || response.status === 429 };
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'انتهت مهلة الاتصال' : (error?.message || 'فشل الاتصال');
    repo.recordDelivery(hook.id, null, message);
    return { ok: false, status: null, error: message, retry: true };
  }
}

const deliver = (hook, event, payload) =>
  send(hook, event, JSON.stringify({ event, created_at: new Date().toISOString(), data: payload }));

// A dead endpoint or a dropped connection never blocks or fails the sale: the delivery waits in webhook_outbox.
async function deliverWithRetry(hook, event, payload) {
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
  const result = await send(hook, event, body);
  if (!result.ok && result.retry) repo.queueRetry(hook.id, event, body, 1, RETRY_WAIT_MINUTES[0]);
  return result;
}

// Called every minute: sends the queued deliveries that are due, with the same body they first had.
async function retryPending() {
  for (const row of repo.dueRetries()) {
    const hook = repo.getWebhook(row.webhook_id);
    if (!hook || !hook.is_active) { repo.deleteRetry(row.id); continue; }
    const result = await send(hook, row.event, row.body);
    if (result.ok || !result.retry || row.attempts >= RETRY_WAIT_MINUTES.length) repo.deleteRetry(row.id);
    else repo.rescheduleRetry(row.id, row.attempts + 1, RETRY_WAIT_MINUTES[row.attempts]);
  }
}

// Fire-and-forget.
function dispatch(event, payload) {
  let hooks;
  try {
    hooks = repo.listWebhooks().filter((h) => h.is_active && h.events.includes(event));
  } catch (error) {
    console.error('[webhooks] تعذر قراءة الويب هوكس:', error.message);
    return;
  }
  for (const hook of hooks) {
    deliverWithRetry(hook, event, payload).catch(() => {});
  }
}

module.exports = {
  WEBHOOK_EVENTS,
  sign,
  dispatch,
  retryPending,
  list: () => repo.listWebhooks(),
  create: (data) => repo.createWebhook({ ...clean(data), secret: `whsec_${crypto.randomBytes(24).toString('hex')}` }),
  update: (id, data) => {
    if (!repo.getWebhook(id)) throw new Error('الويب هوك غير موجود');
    return repo.updateWebhook(id, clean(data));
  },
  remove: (id) => repo.deleteWebhook(id),
  test: async (id) => {
    const hook = repo.getWebhook(id);
    if (!hook) throw new Error('الويب هوك غير موجود');
    return deliver(hook, 'ping', { message: 'Fox POS webhook test' });
  },
};
