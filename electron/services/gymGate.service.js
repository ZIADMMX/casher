const gate = require('../repositories/gymGate.repository');
const subsRepo = require('../repositories/subscriptions.repository');

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dayStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`;
const parseStamp = (v) => new Date(String(v).replace(' ', 'T'));
const INSIDE_MINUTES = 90;
const EXPIRING_DAYS = 2;
// A second swipe within this window is the same entry, not another visit.
const REPEAT_MINUTES = 2;

// Decides the screen for one scan from the member's latest subscription and debt.
function decide(sub, balance, now) {
  if (!sub) return { result: 'denied', reason: 'no_subscription' };
  if (balance > 0) return { result: 'denied', reason: 'late_payment' };
  if (sub.status === 'frozen') return { result: 'denied', reason: 'frozen' };
  const sessions = sub.package_type === 'session_based';
  if (sub.status === 'depleted' || (sessions && sub.remaining_credits <= 0)) return { result: 'denied', reason: 'depleted' };
  const end = parseStamp(sub.end_date);
  if (sub.status === 'expired' || end < now) return { result: 'denied', reason: 'expired' };
  const daysLeft = Math.ceil((end - now) / 86400000);
  if (daysLeft <= EXPIRING_DAYS) return { result: 'warning', reason: 'expiring', daysLeft };
  if (sessions && sub.remaining_credits <= EXPIRING_DAYS) return { result: 'warning', reason: 'low_credits', daysLeft };
  return { result: 'allowed', reason: 'ok', daysLeft };
}

function scan({ code, gateName } = {}) {
  const text = String(code ?? '').trim().slice(0, 60);
  if (!text) throw new Error('الكود فاضي');
  subsRepo.releaseDueFreezes(); // a timed freeze that ended must not turn the member away
  const now = new Date();
  const customer = gate.findCustomer(text);
  const known = customer && customer.is_active !== 0;
  const sub = known ? gate.getLatestSubscription(customer.id) : null;
  const verdict = known ? decide(sub, gate.getBalance(customer.id), now) : { result: 'denied', reason: 'unknown_code' };
  const repeat = known && verdict.result !== 'denied'
    ? gate.getLastAcceptedCheckin(customer.id, localStamp(new Date(now.getTime() - REPEAT_MINUTES * 60000)))
    : null;
  const id = repeat ? repeat.id : gate.insertCheckin({
    customer_id: known ? customer.id : null,
    code_text: text,
    result: verdict.result,
    reason: verdict.reason,
    subscription_id: sub?.id ?? null,
    gate: String(gateName || 'بوابة 1').slice(0, 40),
    created_at: localStamp(now),
  });
  const visits = known && verdict.result !== 'denied'
    ? gate.getVisitInfo(customer.id, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 00:00:00`, id)
    : { month: 0, lastVisit: null };
  return {
    id,
    ...verdict,
    repeat: Boolean(repeat),
    at: repeat ? repeat.created_at : localStamp(now),
    member: known ? { id: customer.id, name: customer.name, code: `GM-${customer.id}` } : null,
    subscription: sub && {
      id: sub.id,
      package: sub.package_name,
      type: sub.package_type,
      remainingCredits: sub.remaining_credits,
      totalCredits: sub.total_credits,
      endDate: sub.end_date,
    },
    visitNumber: visits.month,
    lastVisit: visits.lastVisit,
  };
}

// Session-based packages lose one session when the member is registered for a class.
function registerSession(subscriptionId) {
  const sub = subsRepo.getSubscriptionById(Number(subscriptionId));
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.package_type !== 'session_based') throw new Error('هذه الباقة لا تُخصم منها حصص');
  const updated = subsRepo.consumeCredit(sub.id, 1, null, null, 'تسجيل حصة من بوابة الاستقبال');
  return { remainingCredits: updated.remaining_credits, status: updated.status };
}

function getOverview() {
  const now = new Date();
  const hourly = Array(24).fill(0);
  gate.getHourly(dayStamp(now)).forEach((r) => { hourly[r.hour] = r.n; });
  const since = new Date(now.getTime() - INSIDE_MINUTES * 60000);
  return {
    recent: gate.getRecent(30),
    hourly,
    inside: gate.countInside(localStamp(since)),
    capacity: gate.getCapacity(),
    nowHour: now.getHours(),
  };
}

function setCapacity(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5000) throw new Error('السعة يجب أن تكون بين 1 و5000');
  gate.setCapacity(n);
  return { capacity: n };
}

function getAttendanceReport(filters = {}) {
  const now = new Date();
  const from = filters.from || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 00:00:00`;
  const to = filters.to || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 23:59:59`;
  return gate.getAttendanceReport({ from, to, limit: filters.limit || 200 });
}

function getMemberCheckins(customerId, filters = {}) {
  const now = new Date();
  const from = filters.from || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 00:00:00`;
  const to = filters.to || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 23:59:59`;
  return gate.getMemberCheckins(Number(customerId), { from, to, limit: filters.limit || 100 });
}

module.exports = { decide, scan, registerSession, getOverview, setCapacity, getAttendanceReport, getMemberCheckins };
