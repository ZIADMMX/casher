const appointmentsRepo = require('../repositories/appointments.repository');
const customersRepo = require('../repositories/customers.repository');
const { requireAdmin, requireAuth } = require('./auth.service');
const NotificationsService = require('./notifications.service');

const RESOURCE_TYPES = new Set(['employee', 'room', 'chair', 'car', 'device', 'other']);
const STATUSES = new Set(['booked', 'confirmed', 'completed', 'cancelled', 'no_show']);
const WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} يجب أن يكون رقمًا صحيحًا موجبًا`);
  return number;
}

function optionalResourceType(value) {
  if (value == null || value === '') return null;
  const type = String(value);
  if (!RESOURCE_TYPES.has(type)) throw new Error('نوع المورد غير صالح');
  return type;
}

function validateTime(value, label) {
  const time = String(value || '');
  if (!TIME_PATTERN.test(time)) throw new Error(`${label} يجب أن يكون بصيغة ساعة صحيحة مثل 09:00`);
  return time;
}

function normalizeWorkingHours(hours) {
  if (!Array.isArray(hours)) throw new Error('ساعات العمل غير صالحة');
  const seen = new Set();
  return hours.map((entry) => {
    const weekday = Number(entry.weekday);
    if (!WEEKDAYS.has(weekday) || seen.has(weekday)) throw new Error('يوم عمل غير صالح أو مكرر');
    seen.add(weekday);
    const startTime = validateTime(entry.startTime, 'بداية وقت العمل');
    const endTime = validateTime(entry.endTime, 'نهاية وقت العمل');
    if (startTime >= endTime) throw new Error('نهاية وقت العمل يجب أن تكون بعد بدايته');
    return { weekday, startTime, endTime };
  });
}

function getResources({ activeOnly = false } = {}) {
  requireAuth();
  return appointmentsRepo.getResources({ activeOnly: Boolean(activeOnly) });
}

function getResource(id) {
  requireAuth();
  const resourceId = positiveInteger(id, 'معرف المورد');
  const resource = appointmentsRepo.getResourceById(resourceId);
  if (!resource) throw new Error('المورد غير موجود');
  return resource;
}

function saveResource(data) {
  requireAdmin();
  const id = data.id == null || data.id === '' ? null : positiveInteger(data.id, 'معرف المورد');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('اسم المورد مطلوب');
  const resourceType = String(data.resourceType || '');
  if (!RESOURCE_TYPES.has(resourceType)) throw new Error('اختر نوعًا صالحًا للمورد');
  const workingHours = normalizeWorkingHours(data.workingHours || []);
  const isActive = data.isActive !== false;
  if (id && !appointmentsRepo.getResourceById(id)) throw new Error('المورد غير موجود');
  return appointmentsRepo.saveResource({
    id,
    name,
    resourceType,
    description: String(data.description || '').trim(),
    isActive,
    workingHours,
  });
}

function getServices({ activeOnly = false } = {}) {
  requireAuth();
  return appointmentsRepo.getServices({ activeOnly: Boolean(activeOnly) });
}

function saveService(data) {
  requireAdmin();
  const id = data.id == null || data.id === '' ? null : positiveInteger(data.id, 'معرف الخدمة');
  const name = String(data.name || '').trim();
  const durationMinutes = Number(data.durationMinutes || data.duration_minutes);
  const bufferMinutes = Number(data.bufferMinutes || data.buffer_minutes || 0);
  const price = Number(data.price || 0);
  if (!name) throw new Error('اسم الخدمة مطلوب');
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    throw new Error('مدة الخدمة يجب أن تكون بين دقيقة و24 ساعة');
  }
  if (!Number.isSafeInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 1440) {
    throw new Error('وقت التجهيز الإضافي يجب أن يكون عدد دقائق صحيحًا غير سالب');
  }
  if (!Number.isFinite(price) || price < 0) throw new Error('سعر الخدمة غير صالح');
  if (id && !appointmentsRepo.getServices().some((service) => service.id === id)) {
    throw new Error('الخدمة غير موجودة');
  }
  return appointmentsRepo.saveService({
    id,
    name,
    durationMinutes,
    bufferMinutes,
    price,
    resourceType: optionalResourceType(data.resourceType),
    description: String(data.description || '').trim(),
    isActive: data.isActive !== false,
  });
}

function saveHoliday(data) {
  requireAdmin();
  const resourceId = data.resourceId == null || data.resourceId === ''
    ? null
    : positiveInteger(data.resourceId, 'معرف المورد');
  if (resourceId && !appointmentsRepo.getResourceById(resourceId)) throw new Error('المورد غير موجود');
  const startDate = String(data.startDate || '');
  const endDate = String(data.endDate || startDate);
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) || endDate < startDate) {
    throw new Error('فترة الإجازة غير صالحة');
  }
  const startTime = data.startTime ? validateTime(data.startTime, 'بداية الإجازة') : null;
  const endTime = data.endTime ? validateTime(data.endTime, 'نهاية الإجازة') : null;
  if (Boolean(startTime) !== Boolean(endTime) || (startTime && startTime >= endTime)) {
    throw new Error('حدد بداية ونهاية الإجازة الجزئية بشكل صحيح');
  }
  const name = String(data.name || '').trim();
  if (!name) throw new Error('وصف الإجازة مطلوب');
  return appointmentsRepo.createHoliday({ resourceId, startDate, endDate, startTime, endTime, name });
}

function removeHoliday(id) {
  requireAdmin();
  const holidayId = positiveInteger(id, 'معرف الإجازة');
  const result = appointmentsRepo.removeHoliday(holidayId);
  if (!result.changes) throw new Error('الإجازة غير موجودة');
  return { success: true };
}

function getHolidays(filters = {}) {
  requireAuth();
  return appointmentsRepo.getHolidays(filters);
}

function normalizeDateTime(value) {
  const input = String(value || '');
  if (!DATETIME_PATTERN.test(input)) throw new Error('موعد البداية غير صالح');
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error('موعد البداية غير صالح');
  return date;
}

function localDateParts(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    weekday: date.getDay(),
  };
}

function validateSlot({ resourceId, service, startDate, excludeId = null }) {
  const resource = appointmentsRepo.getResourceById(resourceId);
  if (!resource || !resource.is_active) throw new Error('المورد غير موجود أو غير نشط');
  
  const resourceType = service.resource_type || service.resourceType;
  if (resourceType && resourceType !== resource.resource_type) {
    throw new Error('نوع المورد لا يتوافق مع الخدمة المختارة');
  }
  
  const duration = Number(service.duration_minutes || service.durationMinutes || 60);
  const buffer = Number(service.buffer_minutes || service.bufferMinutes || 0);
  const endDate = new Date(startDate.getTime() + (duration + buffer) * 60_000);
  
  const start = localDateParts(startDate);
  const end = localDateParts(endDate);
  
  const workingHours = appointmentsRepo.findWorkingHours(resourceId, start.weekday);
  if (!workingHours || start.time < workingHours.start_time || end.date !== start.date || end.time > workingHours.end_time) {
    throw new Error('الموعد خارج ساعات عمل المورد للمسار المختار');
  }
  
  const holiday = appointmentsRepo.findHoliday(resourceId, start.date, start.time, end.time);
  if (holiday) throw new Error(`المورد في إجازة خلال الموعد: ${holiday.name}`);
  
  const startAt = startDate.toISOString();
  const endAt = endDate.toISOString();
  if (appointmentsRepo.findConflict(resourceId, startAt, endAt, excludeId)) {
    throw new Error('هذا المورد لديه موعد آخر يتعارض مع الوقت المحدد');
  }
  return { startAt, endAt, start, end };
}

function createAppointment(data) {
  const session = requireAuth();
  const serviceId = positiveInteger(data.serviceId, 'معرف الخدمة');
  const resourceId = positiveInteger(data.resourceId, 'معرف المورد');
  const service = appointmentsRepo.getServices({ activeOnly: true }).find((item) => item.id === serviceId);
  if (!service) throw new Error('الخدمة غير موجودة أو غير نشطة');
  const customerName = String(data.customerName || '').trim();
  if (!customerName) throw new Error('اسم العميل مطلوب');
  const customerPhone = String(data.customerPhone || '').trim();
  const customerId = data.customerId == null || data.customerId === ''
    ? null
    : positiveInteger(data.customerId, 'معرف العميل');
  if (customerId && !customersRepo.getById(customerId)) throw new Error('العميل غير موجود');

  const startDate = normalizeDateTime(data.startAt);
  const { startAt, endAt } = validateSlot({ resourceId, service, startDate });
  const depositAmount = Number(data.depositAmount || 0);
  if (!Number.isFinite(depositAmount) || depositAmount < 0 || depositAmount > service.price) {
    throw new Error('العربون يجب أن يكون بين صفر وسعر الخدمة');
  }
  const reminderMinutes = Number(data.reminderMinutes ?? 60);
  if (!Number.isSafeInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 10080) {
    throw new Error('مدة التذكير يجب أن تكون من صفر إلى 7 أيام');
  }
  const id = appointmentsRepo.createAppointment({
    serviceId,
    resourceId,
    customerId,
    customerName,
    customerPhone,
    startAt,
    endAt,
    depositAmount,
    reminderMinutes,
    notes: String(data.notes || '').trim(),
    createdByUserId: session.id,
  });

  try {
    NotificationsService.notify({
      userId: null,
      type: 'info',
      title: 'حجز جديد',
      message: `تم حجز ${service.name} للعميل ${customerName} لدى ${appointmentsRepo.getResourceById(resourceId)?.name || 'المورد'}`,
      linkPage: 'appointments',
    });
  } catch {}

  return appointmentsRepo.getAppointment(id);
}

function getAppointments(filters = {}) {
  requireAuth();
  return appointmentsRepo.getAppointments(filters);
}

function updateAppointmentStatus(id, status) {
  requireAuth();
  const appointmentId = positiveInteger(id, 'معرف الحجز');
  if (!STATUSES.has(status)) throw new Error('حالة الحجز غير صالحة');
  const appointment = appointmentsRepo.getAppointment(appointmentId);
  if (!appointment || appointment.status === 'converted') throw new Error('الحجز غير موجود أو تم تحويله');
  appointmentsRepo.updateStatus(appointmentId, status);
  return appointmentsRepo.getAppointment(appointmentId);
}

function rescheduleAppointment(id, data) {
  requireAuth();
  const appointmentId = positiveInteger(id, 'معرف الحجز');
  const appointment = appointmentsRepo.getAppointment(appointmentId);
  if (!appointment || !['booked', 'confirmed'].includes(appointment.status)) {
    throw new Error('لا يمكن تغيير موعد هذا الحجز');
  }
  const resourceId = positiveInteger(data.resourceId || appointment.resource_id, 'معرف المورد');
  const startDate = normalizeDateTime(data.startAt);
  const service = appointmentsRepo.getServices().find((item) => item.id === appointment.service_id);
  const { startAt, endAt } = validateSlot({ resourceId, service, startDate, excludeId: appointmentId });
  appointmentsRepo.updateSchedule(appointmentId, resourceId, startAt, endAt);
  return appointmentsRepo.getAppointment(appointmentId);
}

function checkDueReminders(now = new Date()) {
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();
  const due = appointmentsRepo.getDueReminders(nowIso, horizonIso).filter((appointment) => (
    Date.parse(appointment.start_at) - now.getTime() <= appointment.reminder_minutes * 60_000
  ));
  for (const appointment of due) {
    const marked = appointmentsRepo.markReminderSent(appointment.id);
    if (!marked.changes) continue;
    const dateText = new Date(appointment.start_at).toLocaleString('ar-EG');
    try {
      NotificationsService.notify({
        userId: appointment.created_by_user_id || null,
        type: 'warning',
        title: 'تذكير بموعد قريب',
        message: `موعد ${appointment.service_name} للعميل ${appointment.customer_name} لدى ${appointment.resource_name} في ${dateText}`,
        linkPage: 'appointments',
      });
    } catch {}
  }
  return due.length;
}

module.exports = {
  getResources,
  getResource,
  saveResource,
  getServices,
  saveService,
  getHolidays,
  saveHoliday,
  removeHoliday,
  createAppointment,
  getAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
  checkDueReminders,
};
