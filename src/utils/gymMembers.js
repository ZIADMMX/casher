// Pure helpers for the gym members directory: one row per registered member, joined from
// customers, their subscriptions, the gate's visit summary and the member profiles.
const DAY = 86400000;
// "Expiring" means fewer than this many days left (the warning colour, the KPI and the filter all agree).
export const EXPIRING_DAYS = 7;
const RANK = { active: 0, frozen: 1, expired: 2 };

export const STATUS = {
  active: { label: 'نشط', tone: 'ok' },
  frozen: { label: 'مجمد', tone: 'ice' },
  expired: { label: 'منتهي', tone: 'bad' },
  none: { label: 'بدون اشتراك', tone: 'muted' },
};

export const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشط' },
  { key: 'expiring', label: 'ينتهي هذا الأسبوع' },
  { key: 'frozen', label: 'مجمد' },
  { key: 'expired', label: 'منتهي' },
  { key: 'none', label: 'بدون اشتراك' },
];

export const memberCode = (id) => `GM-${id}`;

// A stored "active" subscription whose end date has passed is already over for the member.
export function statusOf(sub, now) {
  if (!sub) return 'none';
  if (sub.status === 'frozen') return 'frozen';
  if (sub.status === 'active' && new Date(sub.end_date).getTime() >= now) return 'active';
  return 'expired';
}

// The subscription that describes the member today: running, then frozen, then the newest.
export function primarySubscription(subs, now) {
  const live = subs.filter((s) => s.status !== 'cancelled');
  return [...live].sort((a, b) => RANK[statusOf(a, now)] - RANK[statusOf(b, now)] || b.id - a.id)[0] || null;
}

export function buildMembers({ customers, subscriptions, visits = [], profiles = [], now = Date.now() }) {
  const group = (rows, key) => rows.reduce((map, r) => map.set(r[key], [...(map.get(r[key]) || []), r]), new Map());
  const subsBy = group(subscriptions, 'customer_id');
  const visitBy = new Map(visits.map((v) => [v.customer_id, v]));
  const profileBy = new Map(profiles.map((p) => [p.customer_id, p]));
  const monthStart = new Date(now);
  const monthPrefix = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

  return customers.map((c) => {
    const sub = primarySubscription(subsBy.get(c.id) || [], now);
    const status = statusOf(sub, now);
    const daysLeft = sub && status === 'active' ? Math.max(Math.ceil((new Date(sub.end_date).getTime() - now) / DAY), 0) : null;
    const visit = visitBy.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      code: memberCode(c.id),
      sub,
      status,
      daysLeft,
      expiring: daysLeft !== null && daysLeft < EXPIRING_DAYS,
      packageName: sub?.package_name || '',
      endDate: sub?.end_date || null,
      lastVisit: visit?.last_visit || null,
      visitsMonth: visit?.visits_month || 0,
      trainer: profileBy.get(c.id)?.trainer_name || '',
      debt: Number(c.debt) > 0 ? Number(c.debt) : 0,
      isNew: String(c.created_at || '').startsWith(monthPrefix),
    };
  });
}

export function summarize(members) {
  const count = (fn) => members.filter(fn).length;
  return {
    total: members.length,
    active: count((m) => m.status === 'active'),
    expiring: count((m) => m.expiring),
    frozen: count((m) => m.status === 'frozen'),
    none: count((m) => m.status === 'none'),
    fresh: count((m) => m.isNew),
  };
}

export function filterMembers(members, filter, query) {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    const inFilter = filter === 'all' || (filter === 'expiring' ? m.expiring : m.status === filter);
    return inFilter && (!q || [m.name, m.phone, m.code].some((v) => (v || '').toLowerCase().includes(q)));
  });
}
