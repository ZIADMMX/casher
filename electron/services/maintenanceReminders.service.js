// تذكيرات الصيانة الدورية للورش: قواعد (كل X كم أو Y شهر) + قالب واتساب + لوحة التذكيرات المستحقّة.
// بتعتمد على جدول service_reminders الموجود، وبتخزّن سطر لما العميل يتبعتله أو يتحجز.
const repo = require('../repositories/autoWorkshop.repository');
const SettingsRepository = require('../repositories/settings.repository');
const { logError } = require('./logger.service');

const RULES_KEY = 'workshop_service_rules';
const TEMPLATE_KEY = 'workshop_service_template';
const SOON_DAYS = 7;
const SOON_KM = 500;
const MAX_TEMPLATE = 1024;

const DEFAULT_RULES = [
  { kind: 'تغيير زيت وفلتر',      interval_km: 5000,  interval_months: 6,  active: true },
  { kind: 'فحص وتغيير تيل الفرامل', interval_km: 20000, interval_months: 12, active: true },
  { kind: 'ضبط زوايا العجل',      interval_km: 10000, interval_months: 12, active: true },
  { kind: 'تغيير سير التوقيت',    interval_km: 60000, interval_months: 48, active: true },
  { kind: 'تغيير فلتر المكيف',    interval_km: 15000, interval_months: 12, active: false },
  { kind: 'تغيير سائل الفرامل',   interval_km: 40000, interval_months: 24, active: true },
];

const DEFAULT_TEMPLATE = 'أهلًا {customer}، تذكير ودّي من ورشتنا: موعد {service} لسيارتك {plate} يحين في {date}. للحجز رُدّ على هذه الرسالة أو اتصل بنا. بانتظارك!';

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const addMonths = (iso, months) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (fromIso, toIso) => Math.round(
  (Date.parse(`${toIso}T00:00:00`) - Date.parse(`${fromIso}T00:00:00`)) / 86400000
);

function getRules() {
  const raw = SettingsRepository.get(RULES_KEY);
  if (!raw) return DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1 }));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1 }));
    return parsed.map((r, i) => ({
      id: Number(r.id) || i + 1,
      kind: String(r.kind || '').trim(),
      interval_km: r.interval_km ? Math.max(0, Math.floor(Number(r.interval_km))) : null,
      interval_months: r.interval_months ? Math.max(0, Math.floor(Number(r.interval_months))) : null,
      active: r.active !== false,
    })).filter((r) => r.kind && (r.interval_km || r.interval_months));
  } catch (err) {
    logError('MaintenanceRules', err);
    return DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1 }));
  }
}

function saveRules(rules) {
  if (!Array.isArray(rules)) throw new Error('قواعد التذكير غير صالحة');
  if (rules.length > 40) throw new Error('كتير قوي من القواعد');
  const cleaned = rules.map((r, i) => {
    const kind = String(r.kind || '').trim().slice(0, 80);
    if (!kind) throw new Error('اسم القاعدة مطلوب');
    const km = r.interval_km == null || r.interval_km === '' ? null : Math.max(0, Math.floor(Number(r.interval_km)));
    const months = r.interval_months == null || r.interval_months === '' ? null : Math.max(0, Math.floor(Number(r.interval_months)));
    if (!km && !months) throw new Error(`«${kind}»: حدد مسافة أو مدة`);
    return { id: Number(r.id) || i + 1, kind, interval_km: km, interval_months: months, active: r.active !== false };
  });
  SettingsRepository.set(RULES_KEY, JSON.stringify(cleaned));
  return cleaned;
}

function setRuleActive(id, active) {
  const rules = getRules().map((r) => (r.id === Number(id) ? { ...r, active: !!active } : r));
  SettingsRepository.set(RULES_KEY, JSON.stringify(rules));
  return rules;
}

function getTemplate() {
  const raw = SettingsRepository.get(TEMPLATE_KEY);
  return typeof raw === 'string' && raw.trim() ? raw : DEFAULT_TEMPLATE;
}

function saveTemplate(text) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('نص الرسالة مطلوب');
  if (t.length > MAX_TEMPLATE) throw new Error(`نص الرسالة أطول من ${MAX_TEMPLATE} حرف`);
  SettingsRepository.set(TEMPLATE_KEY, t);
  return t;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// Encodes a phone from Egyptian local form to the international form wa.me expects (country code 20).
function waPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('01') && digits.length === 11) return `2${digits}`;
  return digits;
}

// Status buckets the dashboard filters by.
function statusOf(dueDateIso, dueOdometer, odometer, today, sentAt, bookedFor) {
  if (bookedFor) return 'booked';
  if (sentAt) return 'sent';
  const dayGap = dueDateIso ? daysBetween(today, dueDateIso) : null;
  const kmGap = dueOdometer != null ? dueOdometer - odometer : null;
  const over = (dayGap !== null && dayGap <= 0) || (kmGap !== null && kmGap <= 0);
  if (over) return 'due';
  const soon = (dayGap !== null && dayGap <= SOON_DAYS) || (kmGap !== null && kmGap <= SOON_KM);
  return soon ? 'due' : 'upcoming';
}

function reasonOf(dueDateIso, dueOdometer, odometer, today) {
  const kmGap = dueOdometer != null ? dueOdometer - odometer : null;
  const dayGap = dueDateIso ? daysBetween(today, dueDateIso) : null;
  if (kmGap !== null && kmGap <= 0) return `متجاوزة بـ ${(-kmGap).toLocaleString('ar-EG')} كم`;
  if (dayGap !== null && dayGap <= 0) return dayGap === 0 ? 'اليوم' : `متأخرة ${(-dayGap).toLocaleString('ar-EG')} يوم`;
  if (kmGap !== null && dayGap !== null) return kmGap <= SOON_KM && kmGap < dayGap * 50 ? `خلال ${kmGap.toLocaleString('ar-EG')} كم` : `خلال ${dayGap} أيام`;
  if (kmGap !== null) return `خلال ${kmGap.toLocaleString('ar-EG')} كم`;
  return `خلال ${dayGap} أيام`;
}

// Virtual list of reminders: one per (vehicle × active rule). Persisted rows (sent_at, booked_for)
// are overlaid so a reminder that was sent today still appears, labelled as sent.
function getDashboard({ filter = 'all' } = {}) {
  const today = todayIso();
  const rules = getRules();
  const template = getTemplate();
  const activeRules = rules.filter((r) => r.active);
  const vehicles = repo.listActiveVehiclesWithOwner();
  const items = [];

  for (const v of vehicles) {
    for (const rule of activeRules) {
      const lastDone = repo.getLastDoneReminder(v.id, rule.kind);
      // Baseline date = the last completed service of this kind, else vehicle onboarding.
      // Baseline km   = that service's target km, else the car's first ever odometer reading
      // (so a 86,000 km car with a 5,000 km interval becomes due at 91,000, not at 5,000).
      const baseDate = lastDone?.done_at ? String(lastDone.done_at).slice(0, 10) : String(v.created_at || today).slice(0, 10);
      const firstReading = lastDone ? null : repo.getFirstReading(v.id);
      const baseKm = lastDone?.due_odometer ?? firstReading?.km ?? 0;
      const dueDate = rule.interval_months ? addMonths(baseDate, rule.interval_months) : null;
      const dueKm = rule.interval_km ? baseKm + rule.interval_km : null;

      const open = repo.getOpenReminder(v.id, rule.kind);
      const sentAt = open?.sent_at || null;
      const bookedFor = open?.booked_for || null;
      const status = statusOf(dueDate, dueKm, v.odometer, today, sentAt, bookedFor);
      if (status === 'upcoming' && !sentAt && !bookedFor) continue;

      items.push({
        key: `v${v.id}:${rule.kind}`,
        vehicle_id: v.id,
        reminder_id: open?.id || null,
        plate: v.plate,
        plate_city: v.plate_city,
        plate_kind: v.plate_kind,
        make: v.make,
        model: v.model,
        year: v.year,
        customer_name: v.customer_name,
        customer_phone: v.customer_phone,
        kind: rule.kind,
        due_date: dueDate,
        due_odometer: dueKm,
        odometer: v.odometer,
        reason: reasonOf(dueDate, dueKm, v.odometer, today),
        status,
        sent_at: sentAt,
        booked_for: bookedFor,
      });
    }
  }

  const all = items.sort((a, b) => {
    const order = { due: 0, sent: 1, booked: 2 };
    return order[a.status] - order[b.status] || (a.due_date || '').localeCompare(b.due_date || '');
  });
  const filtered = filter === 'all' ? all : all.filter((it) => it.status === filter);

  const inWeek = (iso) => iso && daysBetween(today, iso) >= 0 && daysBetween(today, iso) <= SOON_DAYS;
  const monthCounts = repo.reminderMonthCounts(monthStartIso());

  return {
    items: filtered,
    rules,
    template,
    stats: {
      total: all.length,
      due_today: all.filter((it) => it.status === 'due' && (!it.due_date || daysBetween(today, it.due_date) <= 0 || (it.due_odometer != null && it.due_odometer <= it.odometer))).length,
      due_week: all.filter((it) => it.status === 'due' || (it.status === 'upcoming' && inWeek(it.due_date))).length,
      sent_month: monthCounts.sent_month,
      booked_month: monthCounts.booked_month,
      counts_by_status: {
        due: all.filter((it) => it.status === 'due').length,
        sent: all.filter((it) => it.status === 'sent').length,
        booked: all.filter((it) => it.status === 'booked').length,
      },
    },
    today,
  };
}

// Parses key like "v12:تغيير زيت وفلتر" back to (vehicleId, kind).
function parseKey(key) {
  const m = /^v(\d+):(.+)$/.exec(String(key || ''));
  if (!m) throw new Error('مفتاح التذكير غير صالح');
  return { vehicleId: Number(m[1]), kind: m[2] };
}

// Find the virtual reminder row for a key (same compute path as the dashboard).
function resolveItem(key) {
  const { vehicleId, kind } = parseKey(key);
  const d = getDashboard({ filter: 'all' });
  const item = d.items.find((it) => it.vehicle_id === vehicleId && it.kind === kind);
  if (!item) throw new Error('التذكير مش موجود أو خرج من القائمة');
  return item;
}

// Make sure a row exists in service_reminders for (vehicle, kind), returns the row.
function ensureRow(vehicleId, kind, dueDate, dueOdometer) {
  const existing = repo.getOpenReminder(vehicleId, kind);
  if (existing) return existing;
  const id = repo.insertReminder({
    vehicle_id: vehicleId, kind, due_date: dueDate || null, due_odometer: dueOdometer || null, send_at: null,
  });
  return repo.getReminder(id);
}

function sendReminder(key) {
  const item = resolveItem(key);
  if (!item.customer_phone) throw new Error('رقم العميل مش مسجّل، سجّله الأول');
  const row = ensureRow(item.vehicle_id, item.kind, item.due_date, item.due_odometer);
  repo.markReminderSent(row.id);
  const message = fill(getTemplate(), {
    customer: item.customer_name || 'عميلنا العزيز',
    plate: item.plate,
    service: item.kind,
    date: item.due_date || new Date().toLocaleDateString('ar-EG'),
  });
  const phone = waPhone(item.customer_phone);
  return {
    key,
    reminder_id: row.id,
    phone,
    message,
    url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
  };
}

function sendBulk(keys) {
  const out = [];
  for (const k of Array.isArray(keys) ? keys : []) {
    try { out.push({ ok: true, ...sendReminder(k) }); }
    catch (err) { out.push({ ok: false, key: k, error: err.message }); }
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function bookReminder(key, date) {
  if (!DATE_RE.test(String(date || ''))) throw new Error('تاريخ الحجز غير صالح');
  const item = resolveItem(key);
  const row = ensureRow(item.vehicle_id, item.kind, item.due_date, item.due_odometer);
  if (repo.bookReminder(row.id, date) !== 1) throw new Error('التذكير اتنفّذ أو مش موجود');
  return { key, reminder_id: row.id, booked_for: date };
}

function previewMessage({ template, customer = 'العميل', plate = 'ق ن ر ٣٤٨١', service = 'تغيير زيت وفلتر', date = '16 نوفمبر 2026' } = {}) {
  return fill(typeof template === 'string' && template ? template : getTemplate(), { customer, plate, service, date });
}

module.exports = {
  getRules, saveRules, setRuleActive,
  getTemplate, saveTemplate, previewMessage,
  getDashboard, sendReminder, sendBulk, bookReminder,
  DEFAULT_RULES, DEFAULT_TEMPLATE,
};
