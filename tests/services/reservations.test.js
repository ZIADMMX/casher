/**
 * @file reservations.test.js
 * @description حجز الطاولات بميعاد: التحقق، منع التعارض على نفس الطاولة، تغيّر الحالة، الجلوس، والتذكير.
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(() => ({ id: 1 })),
  getCurrentSession: jest.fn(() => ({ id: 1, username: 'cashier' })),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
// Opening a check needs an open shift in the real service; here it just opens the check.
jest.mock('../../electron/services/tables.service', () => ({
  openTab: jest.fn((tableId) => {
    const repo = require('../../electron/repositories/tables.repository');
    return { id: repo.openTab(tableId, null), table_id: tableId };
  }),
}));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const NotificationsService = require('../../electron/services/notifications.service');
const resv = require('../../electron/services/reservations.service');

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const inMinutes = (m) => local(new Date(Date.now() + m * 60_000));
const TABLES = "('حجز-1', 'حجز-2')";
let t1;
let t2;

const book = (extra = {}) => resv.createReservation({ guest_name: 'أسرة محمود', phone: '01012345678', party_size: 4, reserved_at: inMinutes(120), table_id: t1, ...extra });
const wipe = () => {
  db.exec('DELETE FROM table_reservations');
  db.exec(`DELETE FROM table_tabs WHERE table_id IN (SELECT id FROM dining_tables WHERE name IN ${TABLES})`);
};

beforeAll(() => {
  wipe();
  db.exec(`DELETE FROM dining_tables WHERE name IN ${TABLES}`);
  t1 = Number(db.prepare("INSERT INTO dining_tables (name) VALUES ('حجز-1')").run().lastInsertRowid);
  t2 = Number(db.prepare("INSERT INTO dining_tables (name) VALUES ('حجز-2')").run().lastInsertRowid);
});
afterAll(() => {
  wipe();
  db.exec(`DELETE FROM dining_tables WHERE name IN ${TABLES}`);
});
beforeEach(() => {
  jest.clearAllMocks();
  wipe();
});

describe('creating a booking', () => {
  test('saves the booking and lists it on its day', () => {
    const r = book();
    expect(r).toMatchObject({ guest_name: 'أسرة محمود', party_size: 4, status: 'booked', table_name: 'حجز-1', duration_min: 90 });
    expect(resv.listReservations(r.reserved_at.slice(0, 10)).map((x) => x.id)).toContain(r.id);
  });

  test('rejects bad input', () => {
    expect(() => book({ guest_name: ' ' })).toThrow('اسم');
    expect(() => book({ party_size: 0 })).toThrow('الأفراد');
    expect(() => book({ party_size: 2.5 })).toThrow('الأفراد');
    expect(() => book({ reserved_at: '2030-02-31 20:00' })).toThrow('ميعاد');
    expect(() => book({ reserved_at: 'tomorrow' })).toThrow('ميعاد');
    expect(() => book({ phone: 'abc' })).toThrow('موبايل');
    expect(() => book({ duration_min: 5 })).toThrow('مدة');
    expect(() => book({ table_id: 999999 })).toThrow('الطاولة');
    expect(() => book({ reserved_at: inMinutes(-180) })).toThrow('فات');
  });

  test('a booking without a table is allowed (the table is chosen when they arrive)', () => {
    expect(book({ table_id: null }).table_id).toBeNull();
  });
});

describe('clashes on one table', () => {
  test('overlapping windows are refused, back-to-back and other tables are fine', () => {
    book({ reserved_at: inMinutes(120), duration_min: 90 });
    expect(() => book({ guest_name: 'تاني', reserved_at: inMinutes(150) })).toThrow('محجوزة');
    expect(() => book({ guest_name: 'تاني', reserved_at: inMinutes(90) })).toThrow('محجوزة');
    expect(book({ guest_name: 'بعده', reserved_at: inMinutes(210) }).id).toBeGreaterThan(0); // starts when the first ends
    expect(book({ guest_name: 'طاولة تانية', reserved_at: inMinutes(120), table_id: t2 }).id).toBeGreaterThan(0);
  });

  test('a cancelled booking frees the slot', () => {
    const first = book();
    resv.setReservationStatus(first.id, 'cancelled');
    expect(book({ guest_name: 'بدلها' }).id).toBeGreaterThan(0);
  });

  test('editing keeps its own slot but cannot move onto another booking', () => {
    const a = book({ reserved_at: inMinutes(120) });
    book({ guest_name: 'ب', reserved_at: inMinutes(300) });
    expect(resv.updateReservation(a.id, { party_size: 6 }).party_size).toBe(6);
    expect(() => resv.updateReservation(a.id, { reserved_at: inMinutes(300) })).toThrow('محجوزة');
  });
});

describe('status and seating', () => {
  test('only allowed moves: booked can be cancelled or marked no-show, then it is closed', () => {
    const r = book();
    expect(resv.setReservationStatus(r.id, 'no_show').status).toBe('no_show');
    expect(() => resv.setReservationStatus(r.id, 'cancelled')).toThrow('مش مسموح');
    expect(() => resv.updateReservation(r.id, { party_size: 2 })).toThrow('اتقفل');
    expect(() => resv.setReservationStatus(r.id, 'seated')).toThrow('مش مسموح');
  });

  test('seating opens the table check and links it', () => {
    const r = book();
    const out = resv.seatReservation(r.id);
    expect(out.reservation).toMatchObject({ status: 'seated', tab_id: out.tab.id, table_id: t1 });
    expect(resv.setReservationStatus(r.id, 'completed').status).toBe('completed');
  });

  test('seating needs a table, refuses a busy one, and can pick another table', () => {
    const noTable = book({ table_id: null });
    expect(() => resv.seatReservation(noTable.id)).toThrow('اختار الطاولة');
    expect(resv.seatReservation(noTable.id, t2).reservation.table_id).toBe(t2);

    const other = book({ guest_name: 'تانيين', reserved_at: inMinutes(300), table_id: null });
    expect(() => resv.seatReservation(other.id, t2)).toThrow('حساب مفتوح');
  });
});

describe('floor view and reminders', () => {
  test('upcoming shows bookings starting soon, with a table', () => {
    const soon = book({ reserved_at: inMinutes(40) });
    book({ guest_name: 'بعيد', reserved_at: inMinutes(60 * 20), table_id: t2 });
    book({ guest_name: 'من غير طاولة', reserved_at: inMinutes(40), table_id: null });
    expect(resv.getUpcomingByTable().map((x) => x.id)).toEqual([soon.id]);
  });

  test('a booking is announced once, about 15 minutes before', () => {
    book({ reserved_at: inMinutes(10) });
    book({ guest_name: 'بعد ساعة', reserved_at: inMinutes(60), table_id: t2 });
    expect(resv.checkDueReminders()).toBe(1);
    expect(resv.checkDueReminders()).toBe(0);
    expect(NotificationsService.notify).toHaveBeenCalledTimes(1);
    expect(NotificationsService.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'reservation_soon', linkPage: 'reservations' }));
  });
});
