const fs = require('node:fs');
const path = require('node:path');

jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
}));

// Real database: the queries, the "already sent" rules and the CRM log are what matter here.
describe('daily messages', () => {
  const baseTestDir = path.join(__dirname, '../../.jest-cache');
  if (!fs.existsSync(baseTestDir)) fs.mkdirSync(baseTestDir, { recursive: true });

  let db;
  let closeDatabase;
  let service;
  const now = new Date(2026, 10, 11, 10, 0); // 11 Nov 2026, 10:00 local
  const tomorrowAt = (hour) => new Date(2026, 10, 12, hour, 0).toISOString();

  beforeAll(() => {
    process.env.FOX_USER_DATA_DIR = fs.mkdtempSync(path.join(baseTestDir, 'foxcloud-daily-messages-'));
    jest.resetModules();
    ({ db, closeDatabase } = require('../../electron/database/db.js'));
    require('../../electron/database/db.js').runAllMigrations();
    service = require('../../electron/services/dailyMessages.service');

    db.exec(`
      INSERT INTO customers (id, name, phone) VALUES (1, 'سارة', '01011111111'), (2, 'بدون رقم', NULL);
      INSERT INTO appointment_services (id, name, duration_minutes) VALUES (1, 'قص شعر', 30);
      INSERT INTO appointment_resources (id, name, resource_type) VALUES (1, 'كرسي ١', 'chair');
      INSERT INTO crm_leads (id, name, phone, status, updated_at) VALUES
        (1, 'عميل قديم', '01022222222', 'new', datetime('now', '-5 days')),
        (2, 'عميل جديد', '01033333333', 'new', datetime('now')),
        (3, 'اتحول', '01044444444', 'converted', datetime('now', '-9 days'));
    `);
    db.prepare(`INSERT INTO appointments (id, service_id, resource_id, customer_id, customer_name, customer_phone, start_at, end_at)
      VALUES (1, 1, 1, 1, 'سارة', '01011111111', ?, ?)`).run(tomorrowAt(14), tomorrowAt(15));
    db.prepare(`INSERT INTO appointments (id, service_id, resource_id, customer_name, customer_phone, start_at, end_at)
      VALUES (2, 1, 1, 'بعد بكرة', '01055555555', ?, ?)`).run(new Date(2026, 10, 13, 14).toISOString(), new Date(2026, 10, 13, 15).toISOString());
  });

  afterAll(() => closeDatabase?.());

  test("lists tomorrow's appointments and stale leads with filled templates", () => {
    const items = service.getToday(now);
    expect(items.map((item) => item.key).sort()).toEqual(['appointment:1', 'lead_followup:1']);
    const appointment = items.find((item) => item.kind === 'appointment');
    expect(appointment.text).toContain('سارة');
    expect(appointment.text).toContain('قص شعر');
    expect(appointment.sent).toBe(false);
  });

  test('marking sent keeps the row today, logs it on the customer, and hides it on later days', () => {
    service.markSent('appointment', 1, null, now);
    expect(service.getToday(now).find((item) => item.key === 'appointment:1').sent).toBe(true);
    const log = db.prepare("SELECT * FROM crm_activities WHERE record_type = 'customer' AND record_id = 1").all();
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('completed');

    // Sending twice the same day does not log twice.
    service.markSent('appointment', 1, null, now);
    expect(db.prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE record_id = 1 AND record_type = 'customer'").get().n).toBe(1);
  });

  test('a lead comes back after its 7 day cooldown', () => {
    service.markSent('lead_followup', 1, null, now);
    const nextDay = new Date(2026, 10, 12, 10);
    expect(service.getToday(nextDay).some((item) => item.key === 'lead_followup:1')).toBe(false);
    const weekLater = new Date(2026, 10, 18, 10);
    expect(service.getToday(weekLater).some((item) => item.key === 'lead_followup:1')).toBe(true);
  });

  test('rejects a row that is not on today\'s list', () => {
    expect(() => service.markSent('lead_followup', 2, null, now)).toThrow('مش في قائمة النهارده');
  });

  test('saved templates override the defaults and empty ones fall back', () => {
    service.saveTemplates({ lead_followup: 'يا {name} تعالى', appointment: '' });
    const templates = service.getTemplates();
    expect(templates.lead_followup).toBe('يا {name} تعالى');
    expect(templates.appointment).toBe(service.DEFAULT_TEMPLATES.appointment);
    expect(service.fill(templates.lead_followup, { name: 'علي' })).toBe('يا علي تعالى');
  });

  test('the Windows summary goes out once a day, after 9 AM', () => {
    const later = new Date(2026, 10, 19, 10);
    expect(service.notifyDailySummary(new Date(2026, 10, 19, 8))).toBeNull();
    const first = service.notifyDailySummary(later);
    expect(first.title).toMatch(/رسالة متابعة النهارده/);
    expect(first.link_page).toBe('today');
    expect(service.notifyDailySummary(later)).toBeNull();
  });
});

describe('daily messages summary link', () => {
  test('points the CRM sector to the CRM page', () => {
    jest.resetModules();
    jest.doMock('../../electron/repositories/dailyMessages.repository', () => ({
      getAppointmentsBetween: () => [], getSalonAppointmentsOn: () => [], getStaleDeals: () => [],
      getLeadsToFollow: () => [{ id: 1, name: 'علي', phone: '010' }], getSubscriptionsEnding: () => [],
      getStaleRuleDays: () => null, getLastSent: () => new Map(), markSent: jest.fn(),
    }));
    const settings = { business_type: 'crm' };
    jest.doMock('../../electron/repositories/settings.repository', () => ({
      get: (key) => settings[key] ?? null, set: (key, value) => { settings[key] = value; },
    }));
    const notify = jest.fn(() => ({ id: 1 }));
    jest.doMock('../../electron/services/notifications.service', () => ({ notify }));
    const service = require('../../electron/services/dailyMessages.service');
    service.notifyDailySummary(new Date(2026, 10, 11, 10));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ linkPage: 'crm', desktop: true }));
  });
});
