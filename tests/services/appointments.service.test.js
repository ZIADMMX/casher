const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb }));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const authService = require('../../electron/services/auth.service');
const usersRepo = require('../../electron/repositories/users.repository');
const appointmentsService = require('../../electron/services/appointments.service');
const appointmentsRepo = require('../../electron/repositories/appointments.repository');
const NotificationsService = require('../../electron/services/notifications.service');

function futureSlot(hoursAhead = 48) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60_000);
  if (hoursAhead >= 24) {
    date.setHours(10, 0, 0, 0);
  } else {
    date.setMinutes(0, 0, 0);
  }
  return date;
}

function localDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe('Appointments service', () => {
  let resourceId;
  let serviceId;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    mockDb.exec(fs.readFileSync(schemaPath, 'utf8'));
  });

  beforeEach(() => {
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM order_items;
      DELETE FROM order_history;
      DELETE FROM orders;
      DELETE FROM appointments;
      DELETE FROM appointment_holidays;
      DELETE FROM appointment_working_hours;
      DELETE FROM appointment_services;
      DELETE FROM appointment_resources;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);
    authService._resetMemoryForTesting();
    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });
    authService.login('admin', 'admin123');

    resourceId = appointmentsService.saveResource({
      name: 'المورد التجريبي',
      resourceType: 'employee',
      workingHours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: '00:00',
        endTime: '23:59',
      })),
    });
    serviceId = appointmentsService.saveService({
      name: 'الخدمة التجريبية',
      durationMinutes: 60,
      bufferMinutes: 15,
      price: 250,
      resourceType: 'employee',
    });
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (mockDb.open) mockDb.close();
  });

  test('loads editable resource working hours', () => {
    const resource = appointmentsService.getResource(resourceId);
    expect(resource.name).toBe('المورد التجريبي');
    expect(resource.workingHours).toHaveLength(7);
  });

  test('lists every resource with its working hours', () => {
    const [resource] = appointmentsService.getResources();
    expect(resource.workingHours).toHaveLength(7);
    expect(resource.workingHours[0]).toEqual({ weekday: 0, start_time: '00:00', end_time: '23:59' });
  });

  test('deletes an unused resource with its hours and holidays', () => {
    const date = localDateTime(futureSlot()).slice(0, 10);
    appointmentsService.saveHoliday({ resourceId, startDate: date, endDate: date, name: 'إجازة' });

    expect(appointmentsService.removeResource(resourceId)).toEqual({ deleted: true, deactivated: false });
    expect(appointmentsService.getResources()).toHaveLength(0);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM appointment_working_hours').get().n).toBe(0);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM appointment_holidays').get().n).toBe(0);
    expect(() => appointmentsService.removeResource(resourceId)).toThrow('غير موجود');
  });

  test('switches off a resource that has sessions instead of deleting it', () => {
    const booking = appointmentsService.createAppointment({
      serviceId,
      resourceId,
      customerName: 'عميل',
      startAt: localDateTime(futureSlot()),
    });

    expect(appointmentsService.removeResource(resourceId)).toEqual({ deleted: false, deactivated: true });
    expect(appointmentsService.getResource(resourceId).is_active).toBe(0);
    expect(appointmentsService.getAppointments()[0].id).toBe(booking.id);
  });

  test('deletes an unused session type and switches off one that has bookings', () => {
    const spare = appointmentsService.saveService({ name: 'خدمة احتياطية', durationMinutes: 30, price: 100 });
    expect(appointmentsService.removeService(spare)).toEqual({ deleted: true, deactivated: false });
    expect(appointmentsService.getServices().map((service) => service.id)).toEqual([serviceId]);

    appointmentsService.createAppointment({ serviceId, resourceId, customerName: 'عميل', startAt: localDateTime(futureSlot()) });
    expect(appointmentsService.removeService(serviceId)).toEqual({ deleted: false, deactivated: true });
    expect(appointmentsService.getServices()[0].is_active).toBe(0);
    expect(appointmentsService.getAppointments()).toHaveLength(1);
  });

  test('edits an unavailability period in place', () => {
    const date = localDateTime(futureSlot()).slice(0, 10);
    const id = appointmentsService.saveHoliday({ startDate: date, endDate: date, name: 'إغلاق المكتب' });
    expect(appointmentsService.saveHoliday({ id, resourceId, startDate: date, endDate: date, startTime: '13:00', endTime: '16:00', name: 'سفر' })).toBe(id);
    const [holiday] = appointmentsService.getHolidays();
    expect(holiday).toMatchObject({ id, resource_id: resourceId, start_time: '13:00', end_time: '16:00', name: 'سفر' });
    expect(() => appointmentsService.saveHoliday({ id: 999, startDate: date, endDate: date, name: 'x' })).toThrow('غير موجودة');
  });

  test('lists booked sessions that clash with an unavailability period', () => {
    const slot = futureSlot(); // 10:00 local, two days ahead
    const date = localDateTime(slot).slice(0, 10);
    const booking = appointmentsService.createAppointment({ serviceId, resourceId, customerName: 'عميل', startAt: localDateTime(slot) });
    const other = appointmentsService.saveResource({
      name: 'قاعة', resourceType: 'room', workingHours: [{ weekday: slot.getDay(), startTime: '00:00', endTime: '23:59' }],
    });

    expect(appointmentsService.findHolidayConflicts({ startDate: date, endDate: date }).map((a) => a.id)).toEqual([booking.id]);
    expect(appointmentsService.findHolidayConflicts({ resourceId, startDate: date, endDate: date, startTime: '10:30', endTime: '12:00' })).toHaveLength(1);
    expect(appointmentsService.findHolidayConflicts({ resourceId, startDate: date, endDate: date, startTime: '13:00', endTime: '15:00' })).toHaveLength(0);
    expect(appointmentsService.findHolidayConflicts({ resourceId: other, startDate: date, endDate: date })).toHaveLength(0);
    appointmentsService.updateAppointmentStatus(booking.id, 'cancelled');
    expect(appointmentsService.findHolidayConflicts({ startDate: date, endDate: date })).toHaveLength(0);
  });

  test('rejects overlapping bookings and allows a slot after the service buffer', () => {
    const slot = futureSlot();
    const booking = {
      serviceId,
      resourceId,
      customerName: 'عميل',
      startAt: localDateTime(slot),
    };
    appointmentsService.createAppointment(booking);

    expect(() => appointmentsService.createAppointment(booking)).toThrow('يتعارض');
    expect(() => appointmentsService.createAppointment({
      ...booking,
      startAt: localDateTime(new Date(slot.getTime() + 74 * 60_000)),
    })).toThrow('يتعارض');
    expect(() => appointmentsService.createAppointment({
      ...booking,
      startAt: localDateTime(new Date(slot.getTime() + 75 * 60_000)),
    })).not.toThrow();
  });

  test('rejects holidays and deposits greater than the service price', () => {
    const slot = futureSlot();
    const date = localDateTime(slot).slice(0, 10);
    const holidayId = appointmentsService.saveHoliday({
      startDate: date,
      endDate: date,
      name: 'إجازة عامة',
    });
    const booking = {
      serviceId,
      resourceId,
      customerName: 'عميل',
      startAt: localDateTime(slot),
    };

    expect(() => appointmentsService.createAppointment(booking)).toThrow('في إجازة');
    appointmentsRepo.removeHoliday(holidayId);
    expect(() => appointmentsService.createAppointment({
      ...booking,
      depositAmount: 251,
    })).toThrow('العربون');
  });

  test('reminds once and converts a booking to a linked service order atomically', () => {
    // A fixed 10:00 slot keeps the booking inside one day whatever time the
    // suite runs; the reminder check then runs one hour before that slot.
    const slot = futureSlot();
    const oneHourBefore = new Date(slot.getTime() - 60 * 60_000);
    appointmentsService.createAppointment({
      serviceId,
      resourceId,
      customerName: 'عميل',
      startAt: localDateTime(slot),
      depositAmount: 50,
      reminderMinutes: 120,
    });

    jest.clearAllMocks();
    appointmentsService.checkDueReminders(oneHourBefore);
    appointmentsService.checkDueReminders(oneHourBefore);
    expect(NotificationsService.notify).toHaveBeenCalledTimes(1);
  });
});
