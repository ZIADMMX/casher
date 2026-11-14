const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const gate = require('../../electron/services/gymGate.service');

const pad = (n) => String(n).padStart(2, '0');
const stamp = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

describe('gym gate', () => {
  let member;
  const pkg = {};
  const newMember = (name) => db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name, `01${Math.floor(Math.random() * 1e9)}`).lastInsertRowid;
  const subscribe = (customerId, type, { status = 'active', endDays = 30, credits = 0 } = {}) => db.prepare(`
    INSERT INTO customer_subscriptions (customer_id, package_id, status, start_date, end_date, total_credits, remaining_credits)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(customerId, pkg[type], status, stamp(-1), stamp(endDays), credits, credits).lastInsertRowid;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    pkg.time_based = db.prepare("INSERT INTO packages (name, type, price, duration_days) VALUES ('باقة سنوي', 'time_based', 5000, 365)").run().lastInsertRowid;
    pkg.session_based = db.prepare("INSERT INTO packages (name, type, price, duration_days, total_credits) VALUES ('حصص خاصة', 'session_based', 1000, 60, 12)").run().lastInsertRowid;
    member = newMember('مروان');
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('refuses an unknown code and a member without a subscription, and logs both', () => {
    expect(gate.scan({ code: 'GM-999999' })).toMatchObject({ result: 'denied', reason: 'unknown_code', member: null });
    expect(gate.scan({ code: `GM-${member}` })).toMatchObject({ result: 'denied', reason: 'no_subscription' });
    expect(gate.getOverview().recent.slice(0, 2).map((r) => r.reason)).toEqual(['no_subscription', 'unknown_code']);
  });

  it('allows an active subscription and counts the visit once per entry', () => {
    subscribe(member, 'time_based');
    const first = gate.scan({ code: `GM-${member}` });
    expect(first).toMatchObject({ result: 'allowed', reason: 'ok', visitNumber: 1, repeat: false, member: { code: `GM-${member}` } });

    // A second swipe straight away is the same entry.
    const again = gate.scan({ code: String(member) });
    expect(again).toMatchObject({ visitNumber: 1, repeat: true, id: first.id });

    // Once the window has passed it is a real second visit.
    db.prepare("UPDATE gym_checkins SET created_at = ? WHERE id = ?").run(stamp(-1), first.id);
    expect(gate.scan({ code: `GM-${member}` })).toMatchObject({ visitNumber: 2, repeat: false });
  });

  it('summarises last visit and this month visits for every member in one query, ignoring denied scans', () => {
    const m = newMember('زائر منتظم');
    const never = newMember('لم يزر');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 09:00:00`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 9);
    const lastMonthStamp = `${lastMonth.getFullYear()}-${pad(lastMonth.getMonth() + 1)}-15 09:00:00`;
    const insert = db.prepare("INSERT INTO gym_checkins (customer_id, code_text, result, reason, created_at) VALUES (?, 'x', ?, 'r', ?)");
    insert.run(m, 'allowed', lastMonthStamp);
    insert.run(m, 'allowed', thisMonth);
    insert.run(m, 'warning', `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 18:30:00`);
    insert.run(m, 'denied', `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 23:00:00`);

    const summary = gate.getVisitSummary();
    expect(summary.find((r) => r.customer_id === m)).toEqual({ customer_id: m, last_visit: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 18:30:00`, visits_month: 2 });
    expect(summary.find((r) => r.customer_id === never)).toBeUndefined();
  });

  it('counts a member with several subscriptions once in the attendance report', () => {
    const m = newMember('عضو متجدد');
    subscribe(m, 'time_based', { status: 'expired', endDays: -40 });
    subscribe(m, 'time_based');
    gate.scan({ code: `GM-${m}` });
    const row = gate.getAttendanceReport().find((r) => r.id === m);
    expect(row).toMatchObject({ visits: 1, sub_status: 'active' });
  });

  it('maps frozen, expired, depleted, expiring and late-payment states', () => {
    const cases = [
      [{ status: 'frozen' }, 'time_based', 'frozen', 'denied'],
      [{ endDays: -3 }, 'time_based', 'expired', 'denied'],
      [{ credits: 0 }, 'session_based', 'depleted', 'denied'],
      [{ endDays: 1 }, 'time_based', 'expiring', 'warning'],
      [{ credits: 2 }, 'session_based', 'low_credits', 'warning'],
    ];
    cases.forEach(([opts, type, reason, result]) => {
      const m = newMember(`m-${reason}`);
      subscribe(m, type, opts);
      expect(gate.scan({ code: `GM-${m}` })).toMatchObject({ result, reason });
    });

    const debtor = newMember('مدين');
    subscribe(debtor, 'time_based');
    db.prepare("INSERT INTO sales (customer_id, total_amount, payment_method) VALUES (?, 250, 'credit')").run(debtor);
    expect(gate.scan({ code: `GM-${debtor}` })).toMatchObject({ result: 'denied', reason: 'late_payment' });
  });

  it('registers a session and depletes the package at zero', () => {
    const m = newMember('حصص');
    const sub = subscribe(m, 'session_based', { credits: 1 });
    expect(gate.registerSession(sub)).toEqual({ remainingCredits: 0, status: 'depleted' });
    expect(() => gate.registerSession(sub)).toThrow();
    expect(gate.scan({ code: `GM-${m}` }).reason).toBe('depleted');
  });

  it('builds the crowd numbers and validates capacity', () => {
    const o = gate.getOverview();
    expect(o.capacity).toBe(60);
    expect(o.inside).toBeGreaterThan(0);
    expect(o.hourly.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(gate.setCapacity(80).capacity).toBe(80);
    expect(() => gate.setCapacity(0)).toThrow();
  });
});
