// Pure helpers shared by the Employee Affairs pages (team / attendance / leaves).

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBefore(today, days) {
  const [year, month, day] = today.split('-').map(Number);
  return localDateString(new Date(year, month - 1, day - days));
}

export const LEAVE_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'بانتظار الرد' },
  { key: 'approved', label: 'مقبولة' },
  { key: 'rejected', label: 'مرفوضة' },
];

export function filterLeaves(items, status) {
  return status === 'all' ? items : items.filter((item) => item.status === status);
}

// Approved/rejected count only decisions in the last 30 days (by review date, falling back to request date).
export function summarizeLeaves(items, today) {
  const since = daysBefore(today, 30);
  const decidedRecently = (item) => String(item.reviewed_at || item.created_at || '').slice(0, 10) >= since;
  const onLeave = new Set(items
    .filter((item) => item.status === 'approved' && item.start_date <= today && item.end_date >= today)
    .map((item) => item.user_id));
  return {
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved' && decidedRecently(item)).length,
    rejected: items.filter((item) => item.status === 'rejected' && decidedRecently(item)).length,
    onLeaveNow: onLeave.size,
  };
}

// Inclusive day count of a leave range.
export function leaveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const toUtc = (value) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.max(0, Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1);
}

export function countWithoutShift(users) {
  return users.filter((user) => user.is_active && !(user.scheduled_start && user.scheduled_end)).length;
}

export function todayAttendanceLabel(user) {
  if (user.on_leave) return { label: 'في إجازة', tone: 'info' };
  if (user.is_present) return { label: 'حاضر', tone: 'success' };
  if (user.checked_out_today) return { label: 'انصرف', tone: 'muted' };
  return { label: 'لم يسجّل بعد', tone: 'muted' };
}

export function employeeCountLabel(count) {
  if (count === 1) return 'موظف واحد';
  if (count === 2) return 'موظفين';
  return `${count} موظفين`;
}
