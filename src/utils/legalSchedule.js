// Date and label helpers for the law-firm sessions screens. Weekday numbers follow Date#getDay (0 = Sunday).
export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Egyptian work week starts on Saturday

export function toDateValue(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateValue(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function shiftDate(value, days) {
  const date = parseDateValue(value);
  date.setDate(date.getDate() + days);
  return toDateValue(date);
}

/** The Saturday-to-Friday week that contains `value`. */
export function weekDays(value) {
  const date = parseDateValue(value);
  const start = shiftDate(value, -((date.getDay() + 1) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = parseDateValue(shiftDate(start, index));
    return { date: toDateValue(day), weekday: day.getDay(), dayNumber: day.getDate() };
  });
}

export function formatLongDate(value) {
  return parseDateValue(value).toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** '13:00' -> '1:00 م' */
export function formatTime12(time) {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'ص' : 'م'}`;
}

export function localTimeOf(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Working hours rows ({ weekday, start_time, end_time }) -> 'السبت – الخميس · 9:00 ص – 5:00 م' */
export function summarizeHours(workingHours = []) {
  const byDay = new Map(workingHours.map((row) => [Number(row.weekday), row]));
  const days = WEEK_ORDER.filter((weekday) => byDay.has(weekday));
  if (!days.length) return 'لا توجد أوقات عمل';
  const [first] = days.map((weekday) => byDay.get(weekday));
  const sameTimes = days.every((weekday) => (
    byDay.get(weekday).start_time === first.start_time && byDay.get(weekday).end_time === first.end_time
  ));
  if (!sameTimes) return `${days.length} أيام عمل · أوقات مختلفة`;
  const contiguous = days.every((weekday, index) => weekday === WEEK_ORDER[WEEK_ORDER.indexOf(days[0]) + index]);
  let label;
  if (days.length === 7) label = 'كل الأيام';
  else if (days.length === 1) label = DAY_NAMES[days[0]];
  else if (contiguous) label = `${DAY_NAMES[days[0]]} – ${DAY_NAMES[days[days.length - 1]]}`;
  else label = days.map((weekday) => DAY_NAMES[weekday]).join('، ');
  return `${label} · ${formatTime12(first.start_time)} – ${formatTime12(first.end_time)}`;
}

/** 'أ. محمد علي' -> 'م' */
export function nameInitial(name) {
  const clean = String(name || '').trim().replace(/^(أ\.|أ\/|الأستاذة?\s+|د\.)\s*/, '');
  return clean.charAt(0) || '؟';
}

export const HOLIDAY_REASONS = ['إجازة محامٍ', 'إغلاق المكتب', 'عطلة رسمية', 'سفر'];
const HOLIDAY_SEPARATOR = ' — ';

/** The reason chip and the free-text details are stored together in the holiday name. */
export function holidayName(reason, details) {
  const extra = String(details || '').trim();
  return extra ? `${reason}${HOLIDAY_SEPARATOR}${extra}` : reason;
}

export function parseHolidayName(name) {
  const text = String(name || '').trim();
  const reason = HOLIDAY_REASONS.find((item) => text === item || text.startsWith(`${item}${HOLIDAY_SEPARATOR}`));
  if (!reason) return { reason: '', details: text };
  return { reason, details: text.slice(reason.length + HOLIDAY_SEPARATOR.length) };
}

/** 'upcoming' | 'current' | 'ended' relative to the local date value `today`. */
export function holidayState(holiday, today) {
  if (holiday.end_date < today) return 'ended';
  return holiday.start_date <= today ? 'current' : 'upcoming';
}

/** '2026-11-20' -> { day: 20, month: 'نوفمبر' } */
export function dayMonth(value) {
  const date = parseDateValue(value);
  return { day: date.getDate(), month: date.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long' }) };
}

/** 'المكتب كله · 20 – 21 نوفمبر · يوم كامل' style line for one unavailability period. */
export function holidaySummary(holiday) {
  const parts = [holiday.resource_name || 'المكتب كله'];
  if (holiday.end_date !== holiday.start_date) {
    const start = dayMonth(holiday.start_date);
    const end = dayMonth(holiday.end_date);
    parts.push(start.month === end.month
      ? `${start.day} – ${end.day} ${end.month}`
      : `${start.day} ${start.month} – ${end.day} ${end.month}`);
  }
  parts.push(holiday.start_time
    ? `${formatTime12(holiday.start_time)} – ${formatTime12(holiday.end_time)}`
    : 'يوم كامل');
  return parts.join(' · ');
}

/** Sessions of one day: cancelled ones are left out of the schedule and its counts. */
export function daySessions(appointments, dateValue) {
  return appointments
    .filter((appointment) => appointment?.start_at && appointment.status !== 'cancelled'
      && toDateValue(new Date(appointment.start_at)) === dateValue)
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

export function sessionStats(sessions) {
  return {
    total: sessions.length,
    confirmed: sessions.filter((session) => ['confirmed', 'completed'].includes(session.status)).length,
    pending: sessions.filter((session) => session.status === 'booked').length,
  };
}
