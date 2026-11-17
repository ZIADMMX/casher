/**
 * طلبات تطبيقات الدليفري: بتوصل من صندوق الـ Worker (أو بتتكتب بالتليفون)، بتستنى قبول المطعم،
 * والقبول بيعمل فاتورة توصيل عادية (فتظهر في شاشة المطبخ وتتخصم من المخزون).
 *
 * الشكل المتفق عليه للطلب (لكل تطبيق/وسيط يتحوّل له):
 *   { id, source, customer: { name, phone, address }, notes, total, items: [{ sku?, name, quantity }] }
 * shortcut: format واحد عام. تطبيق زي طلبات محتاج adapter يحوّل رده لده لما تاخد وثائق الـ API ومفاتيحه.
 */
const crypto = require('node:crypto');
const { db } = require('../database/db');
const SettingsRepository = require('../repositories/settings.repository');
const { requireAuth } = require('./auth.service');

const MAX_ITEMS = 60;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function normalize(raw, defaultSource) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('الطلب غير صالح');
  const externalId = text(data.id, 80);
  if (!externalId) throw new Error('رقم الطلب مطلوب');
  const source = text(data.source || defaultSource, 30).toLowerCase();
  if (!source) throw new Error('مصدر الطلب مطلوب');
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > MAX_ITEMS) throw new Error('أصناف الطلب غير صالحة');
  const items = data.items.map((item) => {
    const quantity = Number(item?.quantity);
    const name = text(item?.name, 120);
    if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('صنف في الطلب غير صالح');
    return { name, sku: text(item?.sku, 60) || null, quantity };
  });
  const total = data.total == null || data.total === '' ? null : Number(data.total);
  if (total !== null && (!Number.isFinite(total) || total < 0)) throw new Error('إجمالي الطلب غير صالح');
  return {
    source, externalId, items, total,
    name: text(data.customer?.name, 80), phone: text(data.customer?.phone, 20), address: text(data.customer?.address, 200), notes: text(data.notes, 200),
  };
}

// Menu item for a line: the app's SKU first, then the exact name.
function matchVariant(item) {
  const bySku = item.sku ? db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(item.sku) : null;
  if (bySku) return bySku.id;
  const byName = db.prepare('SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE LOWER(p.name) = LOWER(?) ORDER BY pv.id LIMIT 1').get(item.name);
  return byName?.id ?? null;
}

/** Saves an incoming order. The same (source, id) again is ignored, so a re-delivery never doubles an order. */
function receive(raw, defaultSource = 'manual') {
  const o = normalize(raw, defaultSource);
  const items = o.items.map((item) => ({ ...item, variant_id: matchVariant(item) }));
  const info = db.prepare(`INSERT OR IGNORE INTO delivery_orders (source, external_id, customer_name, phone, address, notes, items_json, app_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(o.source, o.externalId, o.name || null, o.phone || null, o.address || null, o.notes || null, JSON.stringify(items), o.total);
  const row = db.prepare('SELECT id FROM delivery_orders WHERE source = ? AND external_id = ?').get(o.source, o.externalId);
  const created = info.changes === 1;
  if (created) {
    try {
      require('./notifications.service').notify({
        type: 'delivery_order', title: 'طلب توصيل جديد', message: `${o.source} #${o.externalId}${o.name ? ` · ${o.name}` : ''}`, linkPage: 'delivery-orders', dedupeKey: `delivery:${row.id}`,
      });
    } catch { /* a missing notification never blocks the order */ }
  }
  return { id: row.id, created };
}

const parse = (row) => ({ ...row, items: JSON.parse(row.items_json) });

function getOrders(status) {
  requireAuth();
  const rows = status
    ? db.prepare('SELECT * FROM delivery_orders WHERE status = ? ORDER BY id DESC LIMIT 200').all(String(status))
    : db.prepare('SELECT * FROM delivery_orders ORDER BY id DESC LIMIT 200').all();
  return rows.map(parse);
}

const getOrder = (id) => {
  const row = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(Number(id));
  if (!row) throw new Error('الطلب غير موجود');
  return parse(row);
};

/**
 * Accept: becomes a normal delivery sale (prices from our menu, stock, kitchen screen). mappings = { lineIndex: variantId }
 * for lines the menu did not match. Paid through the app, so it is recorded as a card sale.
 */
function accept(id, mappings = {}) {
  requireAuth();
  const order = getOrder(id);
  if (order.status !== 'new') throw new Error('الطلب ده اتقرر فيه قبل كده');
  const lines = order.items.map((item, index) => {
    const variantId = Number(mappings?.[index] ?? item.variant_id);
    if (!Number.isSafeInteger(variantId) || variantId <= 0) throw new Error(`اربط الصنف "${item.name}" بصنف من المنيو الأول`);
    return { variantId, quantity: item.quantity };
  });
  if (!order.phone || !order.address) throw new Error('رقم الموبايل والعنوان مطلوبين لطلب التوصيل. كمّلهم من الطلب');
  const sale = require('./sales.service').createSale({
    items: lines, paymentMethod: 'card', orderMode: 'delivery',
    delivery: { name: order.customer_name, phone: order.phone, address: order.address },
  });
  db.prepare("UPDATE delivery_orders SET status = 'accepted', sale_id = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(sale.saleId, order.id);
  return { order: getOrder(order.id), sale };
}

function reject(id, reason) {
  requireAuth();
  const order = getOrder(id);
  if (order.status !== 'new') throw new Error('الطلب ده اتقرر فيه قبل كده');
  db.prepare("UPDATE delivery_orders SET status = 'rejected', reject_reason = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(text(reason, 120) || null, order.id);
  return getOrder(order.id);
}

/** Missing details typed in by the cashier before accepting (the app did not send a phone or address). */
function updateDetails(id, data = {}) {
  requireAuth();
  const order = getOrder(id);
  if (order.status !== 'new') throw new Error('الطلب ده اتقرر فيه قبل كده');
  db.prepare('UPDATE delivery_orders SET customer_name = ?, phone = ?, address = ? WHERE id = ?')
    .run(text(data.name, 80) || order.customer_name, text(data.phone, 20) || order.phone, text(data.address, 200) || order.address, order.id);
  return getOrder(order.id);
}

// ---- the Worker inbox ----
function baseUrl() {
  const endpoint = require('./licenseClock.service').getTimeEndpoint();
  return endpoint ? new URL(endpoint).origin : null;
}
function secret(key, make) {
  let value = SettingsRepository.get(key);
  if (!value) { value = make(); SettingsRepository.set(key, value); }
  return value;
}
const credentials = () => ({
  device: require('../security/deviceId').getDeviceId(),
  key: secret('tracking_write_key', () => crypto.randomBytes(32).toString('hex')), // the same key the customer tracking pages use
});

async function call(path, body, method = 'POST') {
  const res = await fetch(`${baseUrl()}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials(), ...body }), signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`inbox request failed (${res.status})`);
  return res.json();
}

/** The address an app or integrator posts orders to. Made once, and registered on the Worker. */
async function getInboxInfo() {
  requireAuth();
  const base = baseUrl();
  if (!base) throw new Error('الاستقبال محتاج خادم الترخيص (FOX_LICENSE_TIME_URL) متظبط');
  const token = secret('delivery_inbox_token', () => crypto.randomBytes(16).toString('base64url'));
  await call(`/api/inbox/${token}`, {}, 'PUT');
  return { url: `${base}/d/${token}` };
}

/** Every 20 s once an inbox exists: takes the waiting orders, saves them, then confirms them (a crash in between only re-sends, never loses). */
async function pollInbox() {
  const token = SettingsRepository.get('delivery_inbox_token');
  if (!token || !baseUrl()) return 0;
  const { items = [] } = await call(`/api/inbox/${token}/pull`, {});
  const done = [];
  for (const item of items) {
    try { receive(item.payload); } catch { /* a malformed order is dropped, not retried forever */ }
    done.push(item.id);
  }
  if (done.length) await call(`/api/inbox/${token}/ack`, { ids: done });
  return done.length;
}

module.exports = { receive, getOrders, accept, reject, updateDetails, getInboxInfo, pollInbox, normalize };
