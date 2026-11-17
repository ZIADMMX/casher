/**
 * @file maintenanceReminders.test.js
 * @description تذكيرات الصيانة الدورية: القاعدة، احتساب الاستحقاق، الحفظ والإرسال.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn(() => ({ id: null })) }));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
require('../../electron/database/migrations/autoWorkshop').ensureAutoWorkshop(db);

const workshop = require('../../electron/services/autoWorkshop.service');
const maintenance = require('../../electron/services/maintenanceReminders.service');
const settings = require('../../electron/repositories/settings.repository');

let customerId;
let vehicleId;

beforeAll(() => {
  customerId = Number(db.prepare("INSERT INTO customers (name, phone) VALUES ('عميل التذكيرات', '01009998888')").run().lastInsertRowid);
});

beforeEach(() => {
  db.exec('DELETE FROM service_reminders; DELETE FROM work_orders; DELETE FROM vehicles;');
  db.prepare('DELETE FROM settings WHERE key IN (?, ?)').run('workshop_service_rules', 'workshop_service_template');
  const v = workshop.createVehicle({ customer_id: customerId, plate: 'ق ن ر 3481', make: 'تويوتا', model: 'كورولا', year: 2019, odometer: 80000 });
  vehicleId = v.id;
});

describe('قواعد الصيانة', () => {
  test('بترجع القواعد الافتراضية لو مفيش حفظ', () => {
    const rules = maintenance.getRules();
    expect(rules.length).toBeGreaterThan(3);
    expect(rules[0]).toHaveProperty('kind');
    expect(rules[0]).toHaveProperty('interval_km');
  });

  test('بترفض قاعدة من غير مسافة ومن غير مدة', () => {
    expect(() => maintenance.saveRules([{ kind: 'كشف سريع' }])).toThrow(/مسافة أو مدة/);
  });

  test('بتحفظ وبتفعّل/تطفّي', () => {
    maintenance.saveRules([{ kind: 'تغيير زيت', interval_km: 5000 }]);
    const after = maintenance.setRuleActive(1, false);
    expect(after[0].active).toBe(false);
  });
});

describe('قالب الرسالة', () => {
  test('بيرفض نص فاضي', () => {
    expect(() => maintenance.saveTemplate('   ')).toThrow();
  });
  test('بيبدّل المتغيرات في المعاينة', () => {
    const preview = maintenance.previewMessage({
      template: 'أهلًا {customer}، موعد {service} يوم {date}',
      customer: 'أحمد', service: 'تغيير زيت', date: '16 نوفمبر',
    });
    expect(preview).toBe('أهلًا أحمد، موعد تغيير زيت يوم 16 نوفمبر');
  });
});

describe('لوحة التذكيرات', () => {
  test('بتولّد تذكيرات مستحقة لما العداد يعدّي الحد', () => {
    maintenance.saveRules([{ kind: 'تغيير زيت', interval_km: 5000, interval_months: 6 }]);
    // Vehicle onboarded at 80,000 km. Simulate 86,000 km later.
    db.prepare('UPDATE vehicles SET odometer = 86000 WHERE id = ?').run(vehicleId);
    const d = maintenance.getDashboard({ filter: 'all' });
    const item = d.items.find((it) => it.vehicle_id === vehicleId);
    expect(item).toBeTruthy();
    expect(item.status).toBe('due');
    expect(item.reason).toMatch(/متجاوزة/);
  });

  test('بتحسب نسبة الاستحقاق على أساس التاريخ لو ما فيش مسافة متجاوزة', () => {
    maintenance.saveRules([{ kind: 'كشف دوري', interval_months: 1 }]);
    // Backdate the vehicle so the date-based reminder fires.
    db.prepare("UPDATE vehicles SET created_at = datetime('now','-2 months') WHERE id = ?").run(vehicleId);
    const d = maintenance.getDashboard({ filter: 'all' });
    const item = d.items.find((it) => it.vehicle_id === vehicleId);
    expect(item.status).toBe('due');
  });
});

describe('الإرسال والحجز', () => {
  beforeEach(() => {
    maintenance.saveRules([{ kind: 'تغيير زيت', interval_km: 5000 }]);
    db.prepare('UPDATE vehicles SET odometer = 86000 WHERE id = ?').run(vehicleId);
  });

  test('الإرسال بيكتب sent_at وبيرجّع رابط واتساب صالح', () => {
    const key = `v${vehicleId}:تغيير زيت`;
    const res = maintenance.sendReminder(key);
    expect(res.phone).toBe('201009998888'); // 01... → 201...
    expect(res.url).toMatch(/^https:\/\/wa\.me\/201009998888\?text=/);
    expect(res.message).toContain('قنر3481');
    // بعد الإرسال التذكير بيتغيّر لحالة sent
    const d = maintenance.getDashboard({ filter: 'all' });
    expect(d.items[0].status).toBe('sent');
    expect(d.stats.sent_month).toBe(1);
  });

  test('الحجز بيعلّم booked_for وبيظهر حجم الحجوزات', () => {
    const key = `v${vehicleId}:تغيير زيت`;
    maintenance.sendReminder(key);
    maintenance.bookReminder(key, '2026-11-20');
    const d = maintenance.getDashboard({ filter: 'all' });
    expect(d.items[0].status).toBe('booked');
    expect(d.items[0].booked_for).toBe('2026-11-20');
    expect(d.stats.booked_month).toBeGreaterThanOrEqual(1);
  });

  test('الإرسال بيرفض عميل من غير رقم', () => {
    db.prepare('UPDATE customers SET phone = NULL WHERE id = ?').run(customerId);
    const key = `v${vehicleId}:تغيير زيت`;
    expect(() => maintenance.sendReminder(key)).toThrow(/رقم العميل/);
  });
});
