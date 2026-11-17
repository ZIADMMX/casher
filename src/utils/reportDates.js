const LOCALE = 'ar-EG-u-nu-latn';
const DAY = 86400000;

export const PRESETS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: '7 أيام' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'quarter', label: '3 أشهر' },
];

const pad = (n) => String(n).padStart(2, '0');
export const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (iso) => new Date(`${iso}T00:00:00`);
export const addDays = (iso, n) => localIso(new Date(at(iso).getTime() + n * DAY + 3600000)); // +1h keeps DST shifts on the same day

export function presetRange(key, now = new Date()) {
  const today = localIso(now);
  if (key === 'week') return { start: addDays(today, -6), end: today };
  if (key === 'month') return { start: `${today.slice(0, 8)}01`, end: today };
  if (key === 'quarter') return { start: addDays(today, -89), end: today };
  return { start: today, end: today };
}

export function formatRange(start, end) {
  const a = at(start);
  const b = at(end);
  const day = (d) => d.getDate();
  const month = (d) => d.toLocaleDateString(LOCALE, { month: 'long' });
  if (start === end) return `${day(a)} ${month(a)} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${day(a)} – ${day(b)} ${month(b)} ${b.getFullYear()}`;
  return `${day(a)} ${month(a)} ${a.getFullYear()} – ${day(b)} ${month(b)} ${b.getFullYear()}`;
}

export const shortDay = (iso) => at(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
export const longDay = (iso) => at(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
