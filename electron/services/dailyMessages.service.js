// "Today's messages": the app prepares the WhatsApp follow-ups due today, the user sends each
// one from the free wa.me link and marks it sent. No paid WhatsApp API involved.
const repo = require('../repositories/dailyMessages.repository');
const SettingsRepository = require('../repositories/settings.repository');
const NotificationsService = require('./notifications.service');
const { logError } = require('./logger.service');

const TEMPLATES_KEY = 'daily_message_templates';
const NOTIFIED_KEY = 'daily_messages_notified_on';
const SUMMARY_HOUR = 9; // the Windows summary goes out at or after 9 AM
const LEAD_FOLLOW_DAYS = 3;
const DEFAULT_STALE_DAYS = 7;
const SUBSCRIPTION_NOTICE_DAYS = 3;

const KINDS = {
  appointment: { label: 'تذكير بموعد بكرة', cooldownDays: Infinity },
  stale_deal: { label: 'صفقة واقفة', cooldownDays: 7 },
  lead_followup: { label: 'متابعة عميل محتمل', cooldownDays: 7 },
  subscription_expiring: { label: 'اشتراك قرب يخلص', cooldownDays: Infinity },
};

const DEFAULT_TEMPLATES = {
  appointment: 'أهلاً {name}، بنفكّر حضرتك بموعد {service} بكرة الساعة {time}. مستنيينك!',
  stale_deal: 'أهلاً {name}، حبيت أطمن على موضوع {deal}. لو في أي سؤال أنا موجود.',
  lead_followup: 'أهلاً {name}، بتواصل مع حضرتك بخصوص طلبك. تحب نكمل؟',
  subscription_expiring: 'أهلاً {name}، اشتراكك في {package} بيخلص يوم {date}. تحب نجدده؟',
};

const MAX_TEMPLATE_LENGTH = 1000;

const pad = (n) => String(n).padStart(2, '0');
const localDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dayDiff = (fromDay, toDay) => Math.round((new Date(`${toDay}T00:00:00`) - new Date(`${fromDay}T00:00:00`)) / 86_400_000);
const timeText = (date) => date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const dateText = (date) => date.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] ?? ''));
}

function getTemplates() {
  let saved = {};
  try {
    saved = JSON.parse(SettingsRepository.get(TEMPLATES_KEY) || '{}');
  } catch (error) {
    logError('DailyMessagesTemplates', error); // a broken value falls back to the defaults
  }
  const templates = { ...DEFAULT_TEMPLATES };
  for (const kind of Object.keys(KINDS)) {
    if (typeof saved[kind] === 'string' && saved[kind].trim()) templates[kind] = saved[kind];
  }
  return templates;
}

function saveTemplates(input) {
  if (!input || typeof input !== 'object') throw new Error('بيانات القوالب غير صالحة');
  const templates = {};
  for (const kind of Object.keys(KINDS)) {
    const text = String(input[kind] ?? '').trim();
    if (text.length > MAX_TEMPLATE_LENGTH) throw new Error(`قالب «${KINDS[kind].label}» أطول من ${MAX_TEMPLATE_LENGTH} حرف`);
    templates[kind] = text || DEFAULT_TEMPLATES[kind];
  }
  SettingsRepository.set(TEMPLATES_KEY, JSON.stringify(templates));
  return templates;
}

/** Raw candidates for today, before the "already sent" filter. */
function collect(now) {
  const tomorrow = addDays(now, 1);
  const templates = getTemplates();
  const items = [];
  const add = (kind, refId, row, vars, reason, record) => items.push({
    key: `${kind}:${refId}`, kind, refId, name: row.name, phone: row.phone, reason,
    label: KINDS[kind].label, text: fill(templates[kind], { name: row.name, ...vars }), record,
  });

  repo.getAppointmentsBetween(tomorrow.toISOString(), addDays(now, 2).toISOString()).forEach((row) => {
    const at = new Date(row.start_at);
    add('appointment', row.id, row, { service: row.service_name || '', time: timeText(at), date: dateText(at) },
      `${row.service_name || 'موعد'} بكرة ${timeText(at)}`, row.customer_id ? { type: 'customer', id: row.customer_id } : null);
  });
  // Salon bookings live in their own table; a negative ref keeps their ids apart from the general ones.
  repo.getSalonAppointmentsOn(localDay(tomorrow)).forEach((row) => {
    add('appointment', -row.id, row, { service: row.service_name || '', time: row.start_time, date: dateText(tomorrow) },
      `${row.service_name || 'موعد'} بكرة ${row.start_time}`, row.customer_id ? { type: 'customer', id: row.customer_id } : null);
  });

  const staleDays = repo.getStaleRuleDays() || DEFAULT_STALE_DAYS;
  repo.getStaleDeals(staleDays).forEach((row) => {
    add('stale_deal', row.id, row, { deal: row.title }, `«${row.title}» بقالها ${staleDays.toLocaleString('ar-EG')} أيام أو أكتر من غير حركة`, { type: 'opportunity', id: row.id });
  });
  repo.getLeadsToFollow(LEAD_FOLLOW_DAYS).forEach((row) => {
    add('lead_followup', row.id, row, {}, `محدش كلّمه من ${LEAD_FOLLOW_DAYS.toLocaleString('ar-EG')} أيام أو أكتر`, { type: 'lead', id: row.id });
  });
  repo.getSubscriptionsEnding(localDay(now), localDay(addDays(now, SUBSCRIPTION_NOTICE_DAYS))).forEach((row) => {
    const end = new Date(`${String(row.end_date).slice(0, 10)}T00:00:00`);
    add('subscription_expiring', row.id, row, { package: row.package_name, date: dateText(end) },
      `${row.package_name} بيخلص ${dateText(end)}`, { type: 'customer', id: row.customer_id });
  });
  return items;
}

/**
 * Today's list. A row sent today stays (marked sent) so the list shows progress; a row sent
 * earlier is hidden for its kind's cooldown (forever for one-off events like an appointment).
 */
function getToday(now = new Date()) {
  const today = localDay(now);
  const lastSent = repo.getLastSent();
  return collect(now)
    .map((item) => ({ ...item, sent: lastSent.get(item.key) === today, last: lastSent.get(item.key) }))
    .filter((item) => item.sent || !item.last || dayDiff(item.last, today) >= KINDS[item.kind].cooldownDays)
    .map((item) => ({ key: item.key, kind: item.kind, refId: item.refId, name: item.name, phone: item.phone, reason: item.reason, label: item.label, text: item.text, sent: item.sent }));
}

function markSent(kind, refId, userId, now = new Date()) {
  const item = collect(now).find((row) => row.kind === kind && row.refId === Number(refId));
  if (!item) throw new Error('الرسالة دي مش في قائمة النهارده');
  repo.markSent({
    kind, refId: item.refId, day: localDay(now), userId, record: item.record,
    title: `رسالة واتساب: ${item.label}`,
  });
  return { ...item, record: undefined, sent: true };
}

/** One Windows notification a day with the count, once it is 9 AM and something is due. */
function notifyDailySummary(now = new Date()) {
  const today = localDay(now);
  if (now.getHours() < SUMMARY_HOUR || SettingsRepository.get(NOTIFIED_KEY) === today) return null;
  const pending = getToday(now).filter((item) => !item.sent);
  if (!pending.length) return null;
  const counts = Object.entries(KINDS)
    .map(([kind, { label }]) => [label, pending.filter((item) => item.kind === kind).length])
    .filter(([, count]) => count)
    .map(([label, count]) => `${count} ${label}`);
  const notification = NotificationsService.notify({
    type: 'info',
    title: `عندك ${pending.length} رسالة متابعة النهارده`,
    message: `${counts.join('، ')}. اضغط هنا وابعتهم من الواتساب.`,
    // The CRM sector has no Today page; its card sits on the CRM overview.
    linkPage: SettingsRepository.get('business_type') === 'crm' ? 'crm' : 'today',
    desktop: true,
  });
  if (notification) SettingsRepository.set(NOTIFIED_KEY, today);
  return notification;
}

module.exports = {
  KINDS,
  DEFAULT_TEMPLATES,
  fill,
  getTemplates,
  saveTemplates,
  getToday,
  markSent,
  notifyDailySummary,
};
