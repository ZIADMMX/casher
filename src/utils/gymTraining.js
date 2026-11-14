import PT_PLANS from '../../shared/gymPtPlans.json';

export { PT_PLANS };

// 0 = Saturday ... 6 = Friday, the same index the gym tables store.
export const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
export const TONES = [
  { key: 'peach', label: 'خوخي' },
  { key: 'stone', label: 'رملي' },
  { key: 'sky', label: 'ذهبي' },
];

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const pad = (n) => String(n).padStart(2, '0');

export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const d = parse(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export const weekdayOf = (iso) => (parse(iso).getDay() + 1) % 7;
export const weekStartOf = (iso) => addDays(iso, -weekdayOf(iso));
export const dayOfMonth = (iso) => parse(iso).getDate();
export const monthName = (iso) => MONTHS[parse(iso).getMonth()];

export function weekLabel(start) {
  const end = addDays(start, 6);
  const [s, e] = [parse(start), parse(end)];
  const tail = `${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${e.getDate()} ${tail}`
    : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${tail}`;
}

export const slashDate = (iso) => (iso ? iso.split('-').reverse().join(' / ') : '—');
export const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${pad(m)}` : ''} ${h < 12 ? 'ص' : 'م'}`;
}

// Mirrors gymTraining.service quotePackage so the screen shows the price the server will charge.
export function quote(rate, sessions) {
  const plan = PT_PLANS.find((p) => p.sessions === sessions) || PT_PLANS[0];
  return { plan, total: Math.round(rate * plan.sessions * (1 - plan.discountPct / 100) * 100) / 100 };
}

export const PACKAGE_STATUS = {
  active: { label: 'نشطة', tone: 'success' },
  ending: { label: 'قاربت تخلص', tone: 'warning' },
  used_up: { label: 'استهلكت', tone: 'info' },
  expired: { label: 'منتهية', tone: 'danger' },
};

export const initialOf = (name = '') => name.replace(/^م\.\s*/, '').trim().charAt(0) || '؟';
