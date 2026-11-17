/**
 * @file tracking.test.js
 * @description متابعة العميل لسيارته: سجل الأحداث، اللقطة العامة (من غير بيانات خاصة)، الصور، والنشر للـ Worker.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn(() => ({ id: null })) }));
jest.mock('../../electron/services/licenseClock.service', () => ({ getTimeEndpoint: jest.fn(() => 'https://fox.example.workers.dev/api/license/time') }));
const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
require('../../electron/database/migrations/autoWorkshop').ensureAutoWorkshop(db);

const workshop = require('../../electron/services/autoWorkshop.service');
const tracking = require('../../electron/services/tracking.service');
const licenseClock = require('../../electron/services/licenseClock.service');

const PHOTO = `data:image/jpeg;base64,${Buffer.from('tiny').toString('base64')}`;
let order;

// The test database is shared between runs and suites: leave no vehicles behind (they make the app guess the workshop sector).
const wipe = () => db.exec('DELETE FROM work_order_events; DELETE FROM work_order_photos; DELETE FROM work_order_lines; DELETE FROM work_orders; DELETE FROM vehicles;');
afterAll(() => { wipe(); db.exec("DELETE FROM customers WHERE phone = '01099998888'"); });

beforeAll(() => {
  wipe();
  db.exec("DELETE FROM customers WHERE phone = '01099998888'");
  const customerId = Number(db.prepare("INSERT INTO customers (name, phone) VALUES ('أحمد علي السيد', '01099998888')").run().lastInsertRowid);
  global.vehicle = workshop.createVehicle({ customer_id: customerId, plate: 'ل م ر 5570', make: 'هيونداي', model: 'توسان', year: 2019, odometer: 1000 });
});

beforeEach(() => {
  db.exec('DELETE FROM work_order_events; DELETE FROM work_order_photos; DELETE FROM work_order_lines; DELETE FROM work_orders;');
  order = workshop.openOrder({ vehicle_id: global.vehicle.id, odometer_in: 2000, complaint: 'صوت في الفرامل', warranty_days: 0 });
  workshop.addLine(order.id, { kind: 'labor', description: 'تغيير تيل الفرامل', quantity: 1, unit_price: 500 });
  workshop.addLine(order.id, { kind: 'labor', description: 'ضبط زوايا العجل', quantity: 1, unit_price: 300 });
});

afterEach(() => jest.restoreAllMocks());

describe('اللقطة اللي العميل بيشوفها', () => {
  test('بتبدأ باستلام السيارة وبتتبع تغيّر الحالة', () => {
    workshop.setStatus(order.id, 'diagnosing');
    workshop.setStatus(order.id, 'in_progress');
    const snap = tracking.buildSnapshot(order.id);
    expect(snap.order.status).toBe('in_progress');
    expect(snap.timeline.map((t) => t.title)).toEqual(['تم استلام سيارتك', 'بدأ الفحص', 'تمت الموافقة وبدأ العمل']);
    expect(snap.timeline[0].note).toContain('صوت في الفرامل');
  });

  test('مفيهاش تليفون ولا اسم العميل ولا أي تكلفة', () => {
    const json = JSON.stringify(tracking.buildSnapshot(order.id));
    expect(json).not.toContain('01099998888');
    expect(json).not.toContain('أحمد علي السيد');
    expect(json).not.toMatch(/unit_cost|cost|profit/i);
    expect(json).toContain('لمر5570');
  });

  test('البنود بتتعلّم تم لوحدها لما السيارة تجهز', () => {
    workshop.setStatus(order.id, 'in_progress');
    tracking.setLineDone(order.lines?.[0]?.id ?? workshop.getOrder(order.id).lines[0].id, true);
    let lines = tracking.buildSnapshot(order.id).lines;
    expect(lines.map((l) => l.done)).toEqual([true, false]);
    workshop.setStatus(order.id, 'ready');
    lines = tracking.buildSnapshot(order.id).lines;
    expect(lines.every((l) => l.done)).toBe(true);
    expect(tracking.buildSnapshot(order.id).due).toBe(800);
  });

  test('تحديث الفني بيظهر بعنوان وتفصيلة، وبيرفض الفاضي', () => {
    tracking.addUpdate(order.id, { title: 'تم تغيير التيل', note: 'ركّبنا طقم جديد' });
    const last = tracking.buildSnapshot(order.id).timeline.at(-1);
    expect(last).toMatchObject({ title: 'تم تغيير التيل', note: 'ركّبنا طقم جديد' });
    expect(() => tracking.addUpdate(order.id, { title: '  ' })).toThrow('عنوان');
  });
});

describe('الصور', () => {
  test('بتتضاف وبتظهر في اللقطة وتتمسح', () => {
    const list = tracking.addPhoto(order.id, { phase: 'before', data: PHOTO, caption: 'قبل' });
    expect(tracking.buildSnapshot(order.id).photos).toHaveLength(1);
    tracking.removePhoto(list[0].id);
    expect(tracking.buildSnapshot(order.id).photos).toHaveLength(0);
  });

  test('بترفض ملف مش صورة، مرحلة غلط، وأكتر من 6', () => {
    expect(() => tracking.addPhoto(order.id, { phase: 'before', data: 'data:text/html;base64,AAAA' })).toThrow('غير صالحة');
    expect(() => tracking.addPhoto(order.id, { phase: 'middle', data: PHOTO })).toThrow('نوع');
    for (let i = 0; i < 6; i++) tracking.addPhoto(order.id, { phase: 'after', data: PHOTO });
    expect(() => tracking.addPhoto(order.id, { phase: 'after', data: PHOTO })).toThrow('الحد الأقصى');
  });
});

describe('الرابط والنشر', () => {
  test('الرمز بيتعمل مرة واحدة وبيفضل ثابت', () => {
    const a = tracking.getLink(order.id);
    const b = tracking.getLink(order.id);
    expect(a.token).toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.url).toBe(`https://fox.example.workers.dev/t/${a.token}`);
  });

  test('من غير خادم ترخيص مفيش رابط', () => {
    licenseClock.getTimeEndpoint.mockReturnValueOnce(null);
    expect(() => tracking.getLink(order.id)).toThrow('FOX_LICENSE_TIME_URL');
  });

  test('بيبعت اللقطة مرة واحدة وميعيدهاش إلا لو اتغيّرت', async () => {
    const { token } = tracking.getLink(order.id);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    expect(await tracking.publishOne(order.id)).toBe(true);
    expect(await tracking.publishOne(order.id)).toBe(false);
    workshop.setStatus(order.id, 'diagnosing');
    expect(await tracking.publishOne(order.id)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://fox.example.workers.dev/api/track/${token}`);
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body.key).toMatch(/^[0-9a-f]{64}$/);
    expect(body.device).toMatch(/^[0-9a-f]{64}$/);
  });

  test('لو النت واقف الأمر يفضل متعلّم عشان يتبعت بعدين', async () => {
    tracking.getLink(order.id);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(tracking.publishOne(order.id)).rejects.toThrow('offline');
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    expect(await tracking.publishOne(order.id)).toBe(true);
  });

  test('بيرفض لو الـ Worker رد بخطأ', async () => {
    tracking.getLink(order.id);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 });
    await expect(tracking.publishOne(order.id)).rejects.toThrow('403');
  });
});

describe('revoking the link', () => {
  test('tells the Worker, forgets the token, and the next link is a new one', async () => {
    const { token } = tracking.getLink(order.id);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    await tracking.revokeLink(order.id);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://fox.example.workers.dev/api/track/${token}`);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(db.prepare('SELECT tracking_token FROM work_orders WHERE id = ?').get(order.id).tracking_token).toBeNull();
    expect(tracking.getLink(order.id).token).not.toBe(token);
  });

  test('keeps the link if the server cannot be reached, so it can be retried', async () => {
    const { token } = tracking.getLink(order.id);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(tracking.revokeLink(order.id)).rejects.toThrow('تعذر الوصول');
    expect(db.prepare('SELECT tracking_token FROM work_orders WHERE id = ?').get(order.id).tracking_token).toBe(token);
  });

  test('an order with no link has nothing to revoke', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(await tracking.revokeLink(order.id)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the customer answers the quote on the page', () => {
  const answer = (decision) => jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => ({
    ok: true, status: 200, json: async () => ({ decision: JSON.parse(init.body).consume ? null : decision }),
  }));
  const waiting = () => { workshop.setStatus(order.id, 'diagnosing'); workshop.setStatus(order.id, 'awaiting_approval'); tracking.getLink(order.id); };

  test('an approval starts the work, leaves a note for the customer, and is confirmed afterwards', async () => {
    waiting();
    const fetchMock = answer('approve');
    expect(await tracking.applyDecision(order.id)).toBe('approve');
    expect(workshop.getOrder(order.id).status).toBe('in_progress');
    expect(tracking.buildSnapshot(order.id).timeline.some((t) => t.title === 'وافق العميل على العرض')).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).consume).toBe(true);
  });

  test('a refusal keeps the order waiting and says so in the history', async () => {
    waiting();
    answer('decline');
    expect(await tracking.applyDecision(order.id)).toBe('decline');
    expect(workshop.getOrder(order.id).status).toBe('awaiting_approval');
    expect(tracking.buildSnapshot(order.id).timeline.some((t) => t.title.includes('رفض'))).toBe(true);
  });

  test('no answer yet, or an order that is not waiting, changes nothing', async () => {
    waiting();
    answer(null);
    expect(await tracking.applyDecision(order.id)).toBeNull();
    expect(workshop.getOrder(order.id).status).toBe('awaiting_approval');

    workshop.setStatus(order.id, 'in_progress');
    global.fetch.mockClear();
    const fetchMock = global.fetch;
    expect(await tracking.applyDecision(order.id)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
