// Attendance statistics for one member's profile, from the gate's check-in rows (newest first).
const DAY = 86400000;
export const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const RESULT = {
  allowed: { label: 'دخول', tone: 'ok' },
  warning: { label: 'دخول بتنبيه', tone: 'warn' },
  denied: { label: 'مرفوض', tone: 'bad' },
};

// SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC; the screen shows local time.
export const fromDb = (v) => new Date(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`);

export const timeLabel = (d) => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
export const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString('ar-EG', { hour: 'numeric' });

/** Counts per weekday and per hour of day (denied scans never count as attendance). */
export function analyzeVisits(rows, now = Date.now()) {
  const visits = rows.filter((r) => r.result !== 'denied').map((r) => ({ ...r, at: fromDb(r.created_at) }));
  const byWeekday = Array(7).fill(0);
  const byHour = Array(24).fill(0);
  visits.forEach(({ at }) => { byWeekday[at.getDay()] += 1; byHour[at.getHours()] += 1; });

  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const first = visits.length ? Math.min(...visits.map((v) => v.at.getTime())) : now;
  const weeks = Math.max(1, Math.ceil((now - first) / (7 * DAY)));
  const top = (counts) => (Math.max(...counts) > 0 ? counts.indexOf(Math.max(...counts)) : -1);

  return {
    total: visits.length,
    thisMonth: visits.filter((v) => v.at.getTime() >= monthStart).length,
    perWeek: visits.length ? Math.round((visits.length / weeks) * 10) / 10 : 0,
    byWeekday,
    byHour,
    topWeekday: top(byWeekday),
    topHour: top(byHour),
    lastVisit: visits[0]?.at || null,
  };
}
