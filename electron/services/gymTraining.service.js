const repo = require('../repositories/gymTraining.repository');
const PT_PLANS = require('../../shared/gymPtPlans.json');

const TONES = ['peach', 'stone', 'sky'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoDate(new Date());

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

// Weekday index used everywhere in this module: 0 = Saturday ... 6 = Friday.
function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 1) % 7;
}

const weekStartOf = (iso) => addDays(iso, -weekdayOf(iso));

function monthRange(iso) {
  const [y, m] = iso.split('-').map(Number);
  return [`${y}-${pad(m)}-01`, isoDate(new Date(y, m, 0))];
}

function requireDate(value, label = 'التاريخ') {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error(`${label} غير صالح`);
  return value;
}

function requireId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label} غير صالح`);
  return id;
}

function requireNumber(value, label, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} يجب أن يكون بين ${min} و${max}`);
  return n;
}

const money = (n) => Math.round(n * 100) / 100;

function quotePackage(sessionRate, sessions) {
  const plan = PT_PLANS.find((p) => p.sessions === Number(sessions));
  if (!plan) throw new Error('عدد الحصص غير متاح');
  const total = money(sessionRate * plan.sessions * (1 - plan.discountPct / 100));
  return { plan, total };
}

function commissionOf(trainer, ptValue, groupClasses) {
  const ptCommission = Math.round(ptValue * trainer.commission_pct / 100);
  const groupCommission = Math.round(groupClasses * trainer.group_fee);
  return { ptCommission, groupCommission, total: ptCommission + groupCommission };
}

function packageStatus(pkg, today) {
  const remaining = pkg.sessions_total - pkg.sessions_used;
  if (remaining <= 0) return 'used_up';
  if (pkg.valid_until < today) return 'expired';
  if (remaining <= 2 || pkg.valid_until <= addDays(today, 5)) return 'ending';
  return 'active';
}

// ---- Trainers -----------------------------------------------------------------

function normalizeTrainer(data = {}) {
  const name = String(data.name || '').trim().slice(0, 80);
  if (!name) throw new Error('اسم المدرب مطلوب');
  return {
    name,
    specialty: String(data.specialty || '').trim().slice(0, 120),
    session_rate: requireNumber(data.session_rate, 'سعر الحصة', 0, 100000),
    commission_pct: requireNumber(data.commission_pct ?? 18, 'نسبة العمولة', 0, 100),
    group_fee: requireNumber(data.group_fee ?? 35, 'مبلغ الحصة الجماعية', 0, 100000),
  };
}

function getTrainersOverview({ date } = {}) {
  const today = todayIso();
  const ref = date ? requireDate(date) : today;
  const [from, to] = monthRange(ref);
  const weekFrom = weekStartOf(ref);
  const weekTo = addDays(weekFrom, 6);
  const byTrainer = (rows) => new Map(rows.map((r) => [r.trainer_id, r]));
  const pt = byTrainer(repo.getPtSessionTotals(from, to));
  const groups = byTrainer(repo.getGroupClassesHeld(from, to));
  const attendance = byTrainer(repo.getAttendance(from, to));
  const members = byTrainer(repo.getActiveMembersPerTrainer(today));
  const ptDays = repo.getPtSessionsByDay(weekFrom, weekTo);
  const classes = repo.getClasses();

  return repo.getTrainers().map((trainer) => {
    const ptSessions = pt.get(trainer.id)?.sessions || 0;
    const ptValue = pt.get(trainer.id)?.value || 0;
    const groupClasses = groups.get(trainer.id)?.classes || 0;
    const att = attendance.get(trainer.id);
    const week = Array(7).fill(0);
    classes.filter((c) => c.trainer_id === trainer.id).forEach((c) => { week[c.weekday] += 1; });
    ptDays.filter((r) => r.trainer_id === trainer.id).forEach((r) => { week[weekdayOf(r.session_date)] += r.sessions; });
    return {
      ...trainer,
      month: { from, to, ptSessions, ptValue, groupClasses },
      members: members.get(trainer.id)?.members || 0,
      attendancePct: att?.booked ? Math.round((att.attended / att.booked) * 100) : null,
      week,
      commission: commissionOf(trainer, ptValue, groupClasses),
    };
  });
}

function createTrainer(data) {
  return { id: repo.createTrainer(normalizeTrainer(data)) };
}

function updateTrainer(id, data) {
  const trainerId = requireId(id, 'المدرب');
  if (!repo.getTrainerById(trainerId)) throw new Error('المدرب غير موجود');
  repo.updateTrainer(trainerId, normalizeTrainer(data));
  return { id: trainerId };
}

// ---- Weekly classes -----------------------------------------------------------

function getWeekSchedule({ weekStart } = {}) {
  const from = weekStartOf(weekStart ? requireDate(weekStart) : todayIso());
  const to = addDays(from, 6);
  const counts = new Map(repo.getBookingCounts(from, to).map((r) => [`${r.class_id}|${r.session_date}`, r]));
  const classes = repo.getClasses().map((c) => {
    const date = addDays(from, c.weekday);
    const count = counts.get(`${c.id}|${date}`);
    return { ...c, date, booked: count?.booked || 0, waitlist: count?.waitlist || 0 };
  });
  return { weekStart: from, weekEnd: to, today: todayIso(), classes };
}

function createClass(data = {}) {
  const name = String(data.name || '').trim().slice(0, 60);
  if (!name) throw new Error('اسم الحصة مطلوب');
  const trainerId = requireId(data.trainer_id, 'المدرب');
  if (!repo.getTrainerById(trainerId)) throw new Error('المدرب غير موجود');
  if (!TIME_RE.test(String(data.start_time || ''))) throw new Error('وقت الحصة غير صالح');
  return {
    id: repo.createClass({
      name,
      tone: TONES.includes(data.tone) ? data.tone : 'peach',
      trainer_id: trainerId,
      weekday: requireNumber(data.weekday, 'اليوم', 0, 6),
      start_time: data.start_time,
      duration_min: requireNumber(data.duration_min ?? 45, 'مدة الحصة', 10, 240),
      capacity: requireNumber(data.capacity ?? 20, 'السعة', 1, 500),
    }),
  };
}

function deactivateClass(id) {
  repo.deactivateClass(requireId(id, 'الحصة'));
  return { ok: true };
}

function getClassRoster({ classId, date } = {}) {
  return repo.getRoster(requireId(classId, 'الحصة'), requireDate(date));
}

// Books a member into one dated occurrence; a full class puts them on the waiting list.
function bookClass({ classId, customerId, date } = {}) {
  const id = requireId(classId, 'الحصة');
  const customer = requireId(customerId, 'العضو');
  const sessionDate = requireDate(date);
  return repo.db.transaction(() => {
    const cls = repo.getClassById(id);
    if (!cls) throw new Error('الحصة غير موجودة');
    if (weekdayOf(sessionDate) !== cls.weekday) throw new Error('التاريخ لا يوافق يوم الحصة');
    if (sessionDate < todayIso()) throw new Error('لا يمكن الحجز في حصة انتهت');
    if (!repo.customerExists(customer)) throw new Error('العضو غير موجود');
    const status = repo.countBooked(id, sessionDate) >= cls.capacity ? 'waitlist' : 'booked';
    try {
      return { id: repo.insertBooking(id, customer, sessionDate, status), status };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new Error('العضو محجوز بالفعل في هذه الحصة');
      throw err;
    }
  })();
}

function setAttendance({ bookingId, attended } = {}) {
  const booking = repo.getBooking(requireId(bookingId, 'الحجز'));
  if (!booking) throw new Error('الحجز غير موجود');
  if (booking.status === 'waitlist') throw new Error('العضو في قائمة الانتظار');
  repo.setBookingStatus(booking.id, attended ? 'attended' : 'booked');
  return { ok: true };
}

// Cancelling a confirmed seat moves the first waiting member into it.
function cancelBooking(bookingId) {
  return repo.db.transaction(() => {
    const booking = repo.getBooking(requireId(bookingId, 'الحجز'));
    if (!booking) throw new Error('الحجز غير موجود');
    repo.deleteBooking(booking.id);
    if (booking.status !== 'waitlist') {
      const next = repo.firstWaitlisted(booking.class_id, booking.session_date);
      if (next) repo.setBookingStatus(next.id, 'booked');
    }
    return { ok: true };
  })();
}

// ---- Private training packages -------------------------------------------------

function getPackages() {
  const today = todayIso();
  return repo.getPackages().map((p) => ({
    ...p,
    remaining: Math.max(0, p.sessions_total - p.sessions_used),
    status: packageStatus(p, today),
  }));
}

function createPackage({ customerId, trainerId, sessions } = {}) {
  const customer = requireId(customerId, 'العضو');
  const trainer = repo.getTrainerById(requireId(trainerId, 'المدرب'));
  if (!trainer) throw new Error('المدرب غير موجود');
  if (!repo.customerExists(customer)) throw new Error('العضو غير موجود');
  const { plan, total } = quotePackage(trainer.session_rate, sessions);
  const id = repo.createPackage({
    customer_id: customer,
    trainer_id: trainer.id,
    sessions_total: plan.sessions,
    unit_price: money(total / plan.sessions),
    discount_pct: plan.discountPct,
    total,
    valid_until: addDays(todayIso(), plan.validDays),
  });
  return { id, total };
}

function logPtSession(packageId) {
  return repo.db.transaction(() => {
    const pkg = repo.getPackageById(requireId(packageId, 'الباقة'));
    if (!pkg) throw new Error('الباقة غير موجودة');
    const status = packageStatus(pkg, todayIso());
    if (status === 'used_up') throw new Error('حصص الباقة خلصت');
    if (status === 'expired') throw new Error('الباقة انتهت صلاحيتها');
    repo.insertPtSession(pkg.id, pkg.trainer_id, pkg.unit_price, todayIso());
    return { remaining: pkg.sessions_total - pkg.sessions_used - 1 };
  })();
}

function changePackageTrainer({ packageId, trainerId } = {}) {
  const pkg = repo.getPackageById(requireId(packageId, 'الباقة'));
  if (!pkg) throw new Error('الباقة غير موجودة');
  const trainer = repo.getTrainerById(requireId(trainerId, 'المدرب'));
  if (!trainer) throw new Error('المدرب غير موجود');
  repo.setPackageTrainer(pkg.id, trainer.id);
  return { ok: true };
}

module.exports = {
  PT_PLANS,
  quotePackage, commissionOf, packageStatus, weekdayOf, weekStartOf, addDays,
  getTrainersOverview, createTrainer, updateTrainer,
  getWeekSchedule, createClass, deactivateClass, getClassRoster, bookClass, setAttendance, cancelBooking,
  getPackages, createPackage, logPtSession, changePackageTrainer,
};
