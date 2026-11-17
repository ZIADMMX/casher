/**
 * متابعة العميل لسيارته: لقطة آمنة من أمر الشغل بتتبعت للـ Worker، ومنها الصفحة العامة اللي العميل بيفتحها من الـ QR.
 * البرنامج يفضل شغال من غير نت: اللقطة بتتبعت كل ما تتغير، ولو الإنترنت واقف بتتعاد في الدورة اللي بعدها.
 * اللقطة مفيهاش رقم تليفون العميل ولا اسمه الكامل ولا أي تكلفة أو ربح.
 */
const crypto = require('node:crypto');
const { db } = require('../database/db');
const repo = require('../repositories/autoWorkshop.repository');
const workshop = require('./autoWorkshop.service');
const Settings = require('../repositories/settings.repository');
const { renderTrackingHtml } = require('../../shared/trackingPage');

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO_CHARS = 220_000; // the screen shrinks photos first (about 160 KB); this is the hard stop
const MAX_PHOTOS = 6; // keeps one snapshot well under the Worker's 1.5 MB body limit
const PUBLISH_EVERY_MS = 15_000;

const STATUS_TEXT = {
  received: ['تم استلام سيارتك', 'سُجّلت الشكوى وقراءة العدّاد.'],
  diagnosing: ['بدأ الفحص', 'فحص شامل لتحديد المطلوب بدقة.'],
  awaiting_approval: ['أُرسل عرض السعر', 'تفاصيل الأعمال والتكلفة بانتظار موافقتك.'],
  in_progress: ['تمت الموافقة وبدأ العمل', 'بدأ الفني تنفيذ الأعمال.'],
  ready: ['سيارتك جاهزة', 'تقدر تمرّ على الورشة وتستلمها.'],
  delivered: ['تم تسليم السيارة', 'شكرًا لثقتك بنا.'],
  cancelled: ['تم إلغاء أمر الشغل', ''],
};

const iso = (sqlite) => (sqlite ? `${String(sqlite).replace(' ', 'T')}Z` : null);
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const setting = (key) => {
  try { return String(Settings.get(key) || '').trim(); } catch { return ''; }
};

function secret(key, make) {
  let v = setting(key);
  if (!v) { v = make(); Settings.set(key, v); }
  return v;
}

// ---- what the customer sees ----
function dueText(reminder) {
  if (!reminder) return null;
  const when = [reminder.due_odometer ? `${Number(reminder.due_odometer).toLocaleString('en-US')} كم` : '', reminder.due_date || ''].filter(Boolean).join(' أو ');
  return `ستذكّرك الورشة بالصيانة القادمة (${reminder.kind}) عند ${when}.`;
}

function buildSnapshot(orderId) {
  const order = workshop.getOrder(orderId);
  const vehicle = repo.getVehicle(order.vehicle_id);
  const events = repo.listEvents(order.id);
  const done = ['ready', 'delivered'].includes(order.status);
  const readyEvent = [...events].reverse().find((e) => e.status === 'ready');

  const timeline = events.map((e) => {
    if (e.kind === 'status') {
      const [title, note] = STATUS_TEXT[e.status] || [e.status, ''];
      return { at: iso(e.created_at), title, note: e.status === 'received' && order.complaint ? `${note} الشكوى: ${text(order.complaint, 120)}` : note };
    }
    const [title, ...rest] = String(e.note || '').split('\n');
    return { at: iso(e.created_at), title, note: rest.join(' ') };
  });

  let invoice = null;
  if (order.status === 'delivered' && order.sale_id) {
    const sale = db.prepare('SELECT id, total_amount, created_at FROM sales WHERE id = ?').get(order.sale_id);
    if (sale) invoice = { number: `INV-${String(sale.id).padStart(6, '0')}`, at: iso(sale.created_at), total: sale.total_amount };
  }

  return {
    v: 1,
    shop: {
      name: setting('store_name') || 'الورشة',
      tagline: setting('store_tagline') || 'لصيانة السيارات',
      phone: setting('store_phone'),
      address: setting('store_address'),
      hours: setting('store_hours'),
    },
    order: {
      number: order.order_number.replace(/^WO-0*/, ''),
      status: order.status,
      opened_at: iso(order.opened_at),
      closed_at: iso(order.closed_at),
      ready_at: readyEvent ? iso(readyEvent.created_at) : null,
      mechanic: order.mechanic || null,
    },
    vehicle: {
      plate: vehicle.plate, city: vehicle.plate_city, kind: vehicle.plate_kind,
      make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color,
    },
    lines: order.lines.map((l) => ({ description: l.description, quantity: l.quantity, total: l.line_total, done: done || !!l.done })),
    total: order.total,
    due: order.status === 'ready' ? order.total : 0,
    timeline,
    photos: repo.listPhotos(order.id).map((p) => ({ id: p.id, phase: p.phase, caption: p.caption, src: p.data })),
    invoice,
    next_service: order.status === 'delivered' ? dueText(repo.getVehicleDueReminder(order.vehicle_id)) : null,
  };
}

// The in-app preview: the same page the customer gets, frozen at this moment.
function getPreviewHtml(orderId) {
  return renderTrackingHtml(buildSnapshot(orderId));
}

// ---- the public link ----
function baseUrl() {
  const { getTimeEndpoint } = require('./licenseClock.service');
  const endpoint = getTimeEndpoint();
  return endpoint ? new URL(endpoint).origin : null;
}

function ensureToken(orderId) {
  const order = workshop.getOrder(orderId);
  if (order.tracking_token) return order.tracking_token;
  repo.setTrackingToken(order.id, crypto.randomBytes(16).toString('base64url'));
  return repo.getOrder(order.id).tracking_token;
}

function getLink(orderId) {
  const token = ensureToken(orderId);
  const base = baseUrl();
  if (!base) throw new Error('رابط المتابعة محتاج خادم الترخيص (FOX_LICENSE_TIME_URL) متظبط');
  return { token, url: `${base}/t/${token}` };
}

// ---- publishing ----
async function publishOne(orderId, { force = false } = {}) {
  const base = baseUrl();
  if (!base) return false;
  const order = repo.getOrder(orderId);
  if (!order?.tracking_token) return false;
  const data = buildSnapshot(order.id);
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  if (!force && hash === order.tracking_hash) return false;

  const res = await fetch(`${base}/api/track/${order.tracking_token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: require('../security/deviceId').getDeviceId(),
      key: secret('tracking_write_key', () => crypto.randomBytes(32).toString('hex')),
      data,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`tracking publish failed (${res.status})`);
  repo.setTrackingHash(order.id, hash);
  return true;
}

let running = false;
async function publishPending() {
  if (running) return;
  running = true;
  try {
    for (const row of repo.listTrackedOrders()) {
      try { await publishOne(row.id); } catch { /* offline or server down: the next round retries */ }
    }
  } finally {
    running = false;
  }
}

function start() {
  const timer = setInterval(publishPending, PUBLISH_EVERY_MS);
  timer.unref?.();
  setTimeout(publishPending, 3000).unref?.();
}

// ---- what the workshop adds for the customer ----
function addUpdate(orderId, data = {}) {
  const order = workshop.getOrder(orderId);
  const title = text(data.title, 80);
  if (!title) throw new Error('اكتب عنوان التحديث');
  const note = text(data.note, 200);
  repo.insertEvent(order.id, 'note', null, note ? `${title}\n${note}` : title);
  return buildSnapshot(order.id).timeline;
}

function addPhoto(orderId, data = {}) {
  const order = workshop.getOrder(orderId);
  if (!['before', 'after'].includes(data.phase)) throw new Error('نوع الصورة غير صالح');
  if (typeof data.data !== 'string' || !DATA_URL.test(data.data) || data.data.length > MAX_PHOTO_CHARS) throw new Error('الصورة غير صالحة أو كبيرة');
  if (repo.countPhotos(order.id) >= MAX_PHOTOS) throw new Error(`الحد الأقصى ${MAX_PHOTOS} صور لكل أمر`);
  repo.insertPhoto(order.id, data.phase, text(data.caption, 120) || null, data.data);
  return repo.listPhotos(order.id).map(({ id, phase, caption }) => ({ id, phase, caption }));
}

function removePhoto(id) {
  repo.deletePhoto(Number(id));
  return true;
}

function listPhotos(orderId) {
  return repo.listPhotos(workshop.getOrder(orderId).id).map((p) => ({ id: p.id, phase: p.phase, caption: p.caption, src: p.data }));
}

function setLineDone(lineId, done) {
  if (repo.setLineDone(Number(lineId), !!done) !== 1) throw new Error('البند غير موجود');
  return true;
}

module.exports = { buildSnapshot, getPreviewHtml, getLink, publishOne, publishPending, start, addUpdate, addPhoto, removePhoto, listPhotos, setLineDone };
