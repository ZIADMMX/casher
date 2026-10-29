const attendanceRepo = require('../repositories/attendance.repository');
const { requireAdmin, requireAuth } = require('./auth.service');
const shiftsRepo = require('../repositories/shifts.repository');

function formatLocalTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getTodayDate() {
  return formatLocalTimestamp(new Date()).slice(0, 10);
}

function validateDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day) {
    throw new Error('تاريخ الحضور غير صالح');
  }
  return parsed;
}

function getAttendanceForDate(date) {
  requireAdmin();
  validateDate(date);
  return attendanceRepo.getByDate(date);
}

function getMyTodayStatus() {
  const session = requireAuth();
  return attendanceRepo.getRecord(session.id, getTodayDate());
}

function isCheckedInToday(userId) {
  const record = attendanceRepo.getRecord(userId, getTodayDate());
  return Boolean(record?.check_in && !record.check_out);
}

function getLast30DaysSummary() {
  requireAdmin();
  const endDate = getTodayDate();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const startDate = formatLocalTimestamp(start).slice(0, 10);
  const startTime = new Date(`${startDate}T00:00:00`);
  const endTime = new Date(`${endDate}T00:00:00`);
  const rangeDays = Math.floor((endTime - startTime) / 86_400_000) + 1;

  return attendanceRepo.getLast30DaysSummary(startDate, endDate).map((employee) => {
    const firstDay = employee.created_at?.slice(0, 10);
    const activeStart = firstDay && firstDay > startDate ? firstDay : startDate;
    const activeStartTime = new Date(`${activeStart}T00:00:00`);
    const monitoredDays = Math.max(0, Math.floor((endTime - activeStartTime) / 86_400_000) + 1);
    const presentDays = Number(employee.present_days) || 0;
    return {
      ...employee,
      monitored_days: Math.min(rangeDays, monitoredDays),
      present_days: presentDays,
      absent_days: Math.max(0, Math.min(rangeDays, monitoredDays) - presentDays),
    };
  });
}

function updateSchedule({ userId, scheduledStart, scheduledEnd }) {
  requireAdmin();
  const user = attendanceRepo.getUser(userId);
  if (!user) throw new Error('الموظف غير موجود');

  const result = attendanceRepo.updateSchedule(userId, scheduledStart, scheduledEnd);
  if (!result.changes) throw new Error('تعذر حفظ جدول الموظف');
  return { success: true };
}

function checkIn({ userId, date }) {
  const session = requireAuth();
  const targetUserId = userId ?? session.id;
  if (session.role !== 'admin' && Number(targetUserId) !== Number(session.id)) {
    throw new Error('يمكنك تسجيل حضورك لنفسك فقط');
  }
  validateDate(date);
  if (date !== getTodayDate()) {
    throw new Error('تسجيل الحضور الفوري متاح لتاريخ اليوم فقط');
  }

  const user = attendanceRepo.getUser(targetUserId);
  if (!user) throw new Error('الموظف غير موجود');
  if (!user.is_active) throw new Error('لا يمكن تسجيل حضور حساب معطل');
  if (attendanceRepo.getRecord(targetUserId, date)) throw new Error('تم تسجيل حضور الموظف لهذا اليوم بالفعل');

  attendanceRepo.createCheckIn(targetUserId, date, formatLocalTimestamp(new Date()));
  return { success: true };
}

function checkOut({ userId, date }) {
  const session = requireAuth();
  const targetUserId = userId ?? session.id;
  if (session.role !== 'admin' && Number(targetUserId) !== Number(session.id)) {
    throw new Error('يمكنك تسجيل انصرافك لنفسك فقط');
  }
  validateDate(date);
  if (date !== getTodayDate()) {
    throw new Error('تسجيل الانصراف الفوري متاح لتاريخ اليوم فقط');
  }
  if (session.role !== 'admin') {
    const openShift = shiftsRepo.getCurrentOpenShift(session.id);
    if (openShift) {
      throw new Error('أغلق ورديتك أولاً قبل تسجيل الانصراف');
    }
  }

  const record = attendanceRepo.getRecord(targetUserId, date);
  if (!record) throw new Error('يجب تسجيل الحضور قبل الانصراف');
  if (record.check_out) throw new Error('تم تسجيل انصراف الموظف لهذا اليوم بالفعل');

  const result = attendanceRepo.setCheckOut(record.id, formatLocalTimestamp(new Date()));
  if (!result.changes) throw new Error('تعذر تسجيل انصراف الموظف');
  return { success: true };
}

module.exports = {
  getTodayDate,
  getAttendanceForDate,
  getMyTodayStatus,
  isCheckedInToday,
  getLast30DaysSummary,
  updateSchedule,
  checkIn,
  checkOut,
};
