const crypto = require('node:crypto');
const repo = require('../repositories/webhooks.repository');

const WEBHOOK_EVENTS = ['sale.created', 'return.processed', 'customer.created'];
const DELIVERY_TIMEOUT_MS = 10000;

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
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('الرابط لازم يبدأ بـ http أو https');
  const events = Array.isArray(data?.events) ? data.events.filter((e) => WEBHOOK_EVENTS.includes(e)) : [];
  if (!events.length) throw new Error('اختر حدثًا واحدًا على الأقل');
  return { name, url, events, is_active: data?.is_active !== false };
}

function sign(secret, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

// One signed POST; the result is stored on the row so the page shows the last delivery.
async function deliver(hook, event, payload) {
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
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
    return { ok: response.ok, status: response.status };
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'انتهت مهلة الاتصال' : (error?.message || 'فشل الاتصال');
    repo.recordDelivery(hook.id, null, message);
    return { ok: false, status: null, error: message };
  }
}

// Fire-and-forget: a slow or dead endpoint must never block or fail the sale itself.
// shortcut: no retry queue, failed deliveries are only shown on the page; add an outbox table if customers need guaranteed delivery.
function dispatch(event, payload) {
  let hooks;
  try {
    hooks = repo.listWebhooks().filter((h) => h.is_active && h.events.includes(event));
  } catch (error) {
    console.error('[webhooks] تعذر قراءة الويب هوكس:', error.message);
    return;
  }
  for (const hook of hooks) {
    deliver(hook, event, payload).catch(() => {});
  }
}

module.exports = {
  WEBHOOK_EVENTS,
  sign,
  dispatch,
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
