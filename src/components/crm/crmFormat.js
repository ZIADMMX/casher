// Small display helpers shared by the CRM pipeline board and leads list.
const DAY_MS = 24 * 60 * 60 * 1000;

export const num = (value) => Number(value || 0).toLocaleString('ar-EG');
export const money = (value) => `${num(value)} ج.م`;

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('.');
}

// SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS"; a plain date "YYYY-MM-DD" is local.
export function parseDbDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole calendar days from `date` to `now` (negative when `date` is in the future). */
export function daysBetween(date, now = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - start) / DAY_MS);
}

export function agoText(days) {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'منذ يومين';
  return days <= 10 ? `منذ ${num(days)} أيام` : `منذ ${num(days)} يوم`;
}

export function dueText(date, now = new Date()) {
  const days = -daysBetween(date, now);
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غداً';
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}

export const shortDate = (date) => date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
