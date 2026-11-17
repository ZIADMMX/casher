/**
 * حجز الطاولات بميعاد: اسم وعدد أفراد وميعاد وطاولة (اختيارية لحد وقت الجلوس).
 * الجلوس بيفتح حساب الطاولة العادي، فالباقي (المطبخ، الدفع) شغال زي أي طاولة.
 */
const { db } = require('../database/db');
const tablesRepo = require('../repositories/tables.repository');
const tablesService = require('./tables.service');
const { requireAuth, getCurrentSession } = require('./auth.service');

const WHEN_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE = ['booked', 'seated'];
const REMIND_BEFORE_MIN = 15;
const PAST_GRACE_MIN = 30; // a booking can be entered up to half an hour late (walk-in "just sat down")

// Local wall-clock text -> Date; invalid text or an impossible date (31 Feb) -> null.
function parseWhen(text) {
  if (!WHEN_RE.test(text)) return null;
  const date = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;
  return formatWhen(date) === text ? date : null; // rolls like 31 Feb come back as another date and fail here
}
const pad = (n) => String(n).padStart(2, '0');
const formatWhen = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function clean(data = {}) {
  const guest = text(data.guest_name, 80);
  if (!guest) throw new Error('اسم صاحب الحجز مطلوب');
  const size = Number(data.party_size);
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('عدد الأفراد غير صالح');
  const when = parseWhen(String(data.reserved_at ?? ''));
  if (!when) throw new Error('ميعاد الحجز غير صالح');
  const duration = data.duration_min == null || data.duration_min === '' ? 90 : Number(data.duration_min);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) throw new Error('مدة الحجز غير صالحة');
  const phone = text(data.phone, 20);
  if (phone && !/^[0-9+\s-]{6,20}$/.test(phone)) throw new Error('رقم الموبايل غير صالح');
  let tableId = null;
  if (data.table_id != null && data.table_id !== '') {
    tableId = Number(data.table_id);
    if (!Number.isSafeInteger(tableId) || !tablesRepo.getTable(tableId)) throw new Error('الطاولة غير موجودة');
  }
  return { guest_name: guest, phone: phone || null, party_size: size, reserved_at: formatWhen(when), duration_min: duration, table_id: tableId, notes: text(data.notes, 200) || null };
}

// Two bookings on one table clash when their [start, start + duration) windows overlap.
function assertNoClash(fields, ignoreId = null) {
  if (!fields.table_id) return;
  const start = parseWhen(fields.reserved_at).getTime();
  const end = start + fields.duration_min * 60_000;
  const others = db.prepare(`SELECT id, guest_name, reserved_at, duration_min FROM table_reservations
    WHERE table_id = ? AND status IN ('booked', 'seated') AND id != ? AND substr(reserved_at, 1, 10) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`)
    .all(fields.table_id, ignoreId ?? -1, fields.reserved_at.slice(0, 10), fields.reserved_at.slice(0, 10));
  for (const other of others) {
    const s = parseWhen(other.reserved_at).getTime();
    if (start < s + other.duration_min * 60_000 && s < end) {
      throw new Error(`الطاولة محجوزة لـ ${other.guest_name} الساعة ${other.reserved_at.slice(11)}`);
    }
  }
}

const SELECT = `SELECT r.*, t.name AS table_name FROM table_reservations r LEFT JOIN dining_tables t ON t.id = r.table_id`;

function getReservation(id) {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(Number(id));
  if (!row) throw new Error('الحجز غير موجود');
  return row;
}

function listReservations(date) {
  requireAuth();
  const day = String(date ?? '');
  if (!DATE_RE.test(day)) throw new Error('التاريخ غير صالح');
  return db.prepare(`${SELECT} WHERE substr(r.reserved_at, 1, 10) = ? ORDER BY r.reserved_at, r.id`).all(day);
}

function createReservation(data) {
  requireAuth();
  const fields = clean(data);
  if (parseWhen(fields.reserved_at).getTime() < Date.now() - PAST_GRACE_MIN * 60_000) throw new Error('الميعاد ده فات');
  assertNoClash(fields);
  const id = Number(db.prepare(`INSERT INTO table_reservations (table_id, guest_name, phone, party_size, reserved_at, duration_min, notes, created_by)
    VALUES (@table_id, @guest_name, @phone, @party_size, @reserved_at, @duration_min, @notes, @created_by)`)
    .run({ ...fields, created_by: getCurrentSession()?.id ?? null }).lastInsertRowid);
  return getReservation(id);
}

function updateReservation(id, data) {
  requireAuth();
  const current = getReservation(id);
  if (current.status !== 'booked') throw new Error('الحجز ده اتقفل ومينفعش يتعدّل');
  const fields = clean({ ...current, ...data });
  assertNoClash(fields, current.id);
  // a new time starts a new reminder
  db.prepare(`UPDATE table_reservations SET table_id = @table_id, guest_name = @guest_name, phone = @phone, party_size = @party_size,
    reserved_at = @reserved_at, duration_min = @duration_min, notes = @notes, reminded_at = NULL WHERE id = @id`).run({ ...fields, id: current.id });
  return getReservation(current.id);
}

const NEXT = { booked: ['cancelled', 'no_show'], seated: ['completed'] };
function setReservationStatus(id, status) {
  requireAuth();
  const current = getReservation(id);
  if (!NEXT[current.status]?.includes(status)) throw new Error('الانتقال بين الحالتين دي مش مسموح');
  db.prepare('UPDATE table_reservations SET status = ? WHERE id = ?').run(status, current.id);
  return getReservation(current.id);
}

/** The guests arrived: opens the table's check (needs an open shift, like any table) and marks the booking seated. */
function seatReservation(id, tableId) {
  requireAuth();
  const current = getReservation(id);
  if (current.status !== 'booked') throw new Error('الحجز ده مش في وضع الانتظار');
  const chosen = tableId != null && tableId !== '' ? Number(tableId) : current.table_id;
  if (!chosen) throw new Error('اختار الطاولة اللي هيقعدوا عليها');
  const table = tablesRepo.getTable(chosen);
  if (!table) throw new Error('الطاولة غير موجودة');
  const open = tablesRepo.getOpenTabForTable(chosen);
  if (open) throw new Error('الطاولة عليها حساب مفتوح بالفعل');
  const tab = tablesService.openTab(chosen);
  db.prepare("UPDATE table_reservations SET status = 'seated', table_id = ?, tab_id = ? WHERE id = ?").run(chosen, tab.id, current.id);
  return { reservation: getReservation(current.id), tab };
}

/** For the floor view: today's bookings that start soon (or are a little late), by table. */
function getUpcomingByTable(now = new Date()) {
  requireAuth();
  const from = formatWhen(new Date(now.getTime() - PAST_GRACE_MIN * 60_000));
  const to = formatWhen(new Date(now.getTime() + 120 * 60_000));
  return db.prepare(`SELECT id, table_id, guest_name, party_size, reserved_at FROM table_reservations
    WHERE status = 'booked' AND table_id IS NOT NULL AND reserved_at BETWEEN ? AND ? ORDER BY reserved_at`).all(from, to);
}

/** Every minute: tells the staff 15 minutes before a booking, once. */
function checkDueReminders(now = new Date()) {
  const from = formatWhen(now);
  const to = formatWhen(new Date(now.getTime() + REMIND_BEFORE_MIN * 60_000));
  const due = db.prepare(`${SELECT} WHERE r.status = 'booked' AND r.reminded_at IS NULL AND r.reserved_at BETWEEN ? AND ?`).all(from, to);
  for (const r of due) {
    db.prepare('UPDATE table_reservations SET reminded_at = ? WHERE id = ?').run(from, r.id);
    try {
      require('./notifications.service').notify({
        type: 'reservation_soon',
        title: 'حجز قريب',
        message: `${r.guest_name} (${r.party_size} أفراد) الساعة ${r.reserved_at.slice(11)}${r.table_name ? ` على ${r.table_name}` : ''}`,
        linkPage: 'reservations',
        dedupeKey: `reservation:${r.id}`,
      });
    } catch { /* a missing notification never blocks the floor */ }
  }
  return due.length;
}

module.exports = {
  parseWhen, listReservations, createReservation, updateReservation, setReservationStatus, seatReservation, getUpcomingByTable, checkDueReminders,
};
