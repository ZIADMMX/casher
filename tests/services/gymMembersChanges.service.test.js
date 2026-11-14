const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const subscriptions = require('../../electron/services/subscriptions.service');
const subsRepo = require('../../electron/repositories/subscriptions.repository');
const members = require('../../electron/services/gymMembers.service');
const gate = require('../../electron/services/gymGate.service');

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe('gym member changes: timed freeze, upgrade, transfer, profile', () => {
  let ahmed;
  let sara;
  let monthly;
  let annual;
  let cappedMonthly;
  let shiftId;

  const insertSub = (customerId, packageId, { start = -10, end = 20, status = 'active', credits = 0, remaining = 0 } = {}) => db.prepare(`
    INSERT INTO customer_subscriptions (customer_id, package_id, status, start_date, end_date, total_credits, remaining_credits)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(customerId, packageId, status, iso(start), iso(end), credits, remaining).lastInsertRowid;
  const sub = (id) => db.prepare('SELECT * FROM customer_subscriptions WHERE id = ?').get(id);

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    ahmed = db.prepare("INSERT INTO customers (name, phone) VALUES ('أحمد', '01000000001')").run().lastInsertRowid;
    sara = db.prepare("INSERT INTO customers (name, phone) VALUES ('سارة', '01000000002')").run().lastInsertRowid;
    monthly = db.prepare("INSERT INTO packages (name, type, price, duration_days) VALUES ('شهري', 'time_based', 600, 30)").run().lastInsertRowid;
    annual = db.prepare("INSERT INTO packages (name, type, price, duration_days) VALUES ('سنوي', 'time_based', 3600, 365)").run().lastInsertRowid;
    cappedMonthly = db.prepare("INSERT INTO packages (name, type, price, duration_days, max_freeze_days) VALUES ('محدود', 'time_based', 600, 30, 10)").run().lastInsertRowid;
    const userId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('reception', 'x', 'cashier')").run().lastInsertRowid;
    shiftId = db.prepare("INSERT INTO shifts (user_id, opening_cash, status) VALUES (?, 0, 'open')").run(userId).lastInsertRowid;
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  describe('migration', () => {
    test('adds frozen_until, upgraded_from_id and the member profile table', () => {
      const cols = db.prepare('PRAGMA table_info(customer_subscriptions)').all().map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining(['frozen_until', 'upgraded_from_id']));
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'gym_member_profiles'").get()).toBeTruthy();
    });

    test('running the migrations again changes nothing and loses no data', () => {
      const id = insertSub(ahmed, monthly);
      runAllMigrations();
      expect(sub(id)).toBeTruthy();
    });
  });

  describe('freeze for a number of days', () => {
    test('stores when the freeze ends, and a manual unfreeze still extends by the real days', () => {
      const id = insertSub(ahmed, monthly);
      const frozen = subscriptions.freezeSubscription(id, 'سفر', {}, 14);
      expect(frozen.status).toBe('frozen');
      const until = new Date(sub(id).frozen_until).getTime();
      expect(until - Date.now()).toBeGreaterThan(13.9 * DAY);
      expect(until - Date.now()).toBeLessThanOrEqual(14 * DAY);

      const endBefore = new Date(sub(id).end_date).getTime();
      subscriptions.unfreezeSubscription(id);
      const after = sub(id);
      expect(after.status).toBe('active');
      expect(after.frozen_until).toBeNull();
      // unfrozen right away: only the one started day is added, not the 14 planned
      expect(new Date(after.end_date).getTime() - endBefore).toBe(DAY);
    });

    test('an open-ended freeze (no days) leaves frozen_until empty', () => {
      const id = insertSub(ahmed, monthly);
      subscriptions.freezeSubscription(id, null, {});
      expect(sub(id).frozen_until).toBeNull();
      subscriptions.unfreezeSubscription(id);
    });

    test('rejects a bad duration and one above the package allowance', () => {
      const id = insertSub(ahmed, cappedMonthly);
      expect(() => subscriptions.freezeSubscription(id, null, {}, 0)).toThrow(/عدد أيام صحيح/);
      expect(() => subscriptions.freezeSubscription(id, null, {}, 2.5)).toThrow(/عدد أيام صحيح/);
      expect(() => subscriptions.freezeSubscription(id, null, {}, 11)).toThrow(/المتبقي 10 يوم/);
      expect(sub(id).status).toBe('active');
    });

    test('a timed freeze that has ended is released by itself and extends the end date by the planned days', () => {
      const id = insertSub(ahmed, monthly);
      const endBefore = new Date(sub(id).end_date).getTime();
      subscriptions.freezeSubscription(id, null, {}, 7);
      // move the freeze 8 days into the past: it ended 1 day ago
      db.prepare('UPDATE customer_subscriptions SET frozen_until = ? WHERE id = ?').run(iso(-1), id);
      db.prepare('UPDATE subscription_freeze_logs SET freeze_date = ? WHERE subscription_id = ? AND unfreeze_date IS NULL').run(iso(-8), id);

      expect(subsRepo.releaseDueFreezes()).toBe(1);
      const after = sub(id);
      expect(after.status).toBe('active');
      expect(after.frozen_until).toBeNull();
      expect(after.frozen_days_used).toBe(7);
      expect(new Date(after.end_date).getTime() - endBefore).toBe(7 * DAY);
      expect(subsRepo.releaseDueFreezes()).toBe(0);
    });

    test('a freeze still running is left alone, and listing subscriptions releases the ended ones', () => {
      const running = insertSub(sara, monthly);
      subscriptions.freezeSubscription(running, null, {}, 30);
      expect(subsRepo.releaseDueFreezes()).toBe(0);
      expect(sub(running).status).toBe('frozen');

      db.prepare('UPDATE customer_subscriptions SET frozen_until = ? WHERE id = ?').run(iso(-1), running);
      db.prepare('UPDATE subscription_freeze_logs SET freeze_date = ? WHERE subscription_id = ? AND unfreeze_date IS NULL').run(iso(-31), running);
      subscriptions.getAllSubscriptions({ customer_id: sara });
      expect(sub(running).status).toBe('active');
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(running);
    });

    test('the gate lets a member in once a timed freeze has ended', () => {
      db.prepare("INSERT INTO customers (id, name, phone) VALUES (900, 'بوابة', '01099999999')").run();
      const id = insertSub(900, monthly);
      subscriptions.freezeSubscription(id, null, {}, 3);
      db.prepare('UPDATE customer_subscriptions SET frozen_until = ? WHERE id = ?').run(iso(-1), id);
      db.prepare('UPDATE subscription_freeze_logs SET freeze_date = ? WHERE subscription_id = ? AND unfreeze_date IS NULL').run(iso(-4), id);
      const result = gate.scan({ code: '01099999999' });
      expect(result.result === 'allowed' || result.result === 'warning').toBe(true);
    });
  });

  describe('upgrade', () => {
    test('quote: credit is the unused share of the current price', () => {
      const id = insertSub(ahmed, monthly, { start: -15, end: 15 }); // half used
      const quote = subscriptions.getUpgradeQuote(id, annual);
      expect(quote.current_price).toBe(600);
      expect(quote.new_price).toBe(3600);
      expect(quote.credit).toBeGreaterThan(290);
      expect(quote.credit).toBeLessThan(310);
      expect(quote.amount_due).toBeCloseTo(3600 - quote.credit, 2);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(id);
    });

    test('quote for a session package uses the sessions left', () => {
      const pkg = db.prepare("INSERT INTO packages (name, type, price, duration_days, total_credits) VALUES ('10 جلسات', 'session_based', 500, 60, 10)").run().lastInsertRowid;
      const id = insertSub(ahmed, pkg, { credits: 10, remaining: 4 });
      expect(subscriptions.getUpgradeQuote(id, annual).credit).toBe(200);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(id);
    });

    test('refuses a cheaper or equal package, the same package, frozen and ended subscriptions', () => {
      const id = insertSub(ahmed, annual);
      expect(() => subscriptions.getUpgradeQuote(id, monthly)).toThrow(/أعلى سعرًا/);
      expect(() => subscriptions.getUpgradeQuote(id, annual)).toThrow(/الباقة الحالية/);
      db.prepare("UPDATE customer_subscriptions SET status = 'frozen' WHERE id = ?").run(id);
      expect(() => subscriptions.getUpgradeQuote(id, monthly)).toThrow(/النشطة فقط/);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(id);
    });

    test('upgrading cancels the old subscription, starts the new one and collects the difference on the shift', () => {
      const id = insertSub(ahmed, monthly, { start: -15, end: 15 });
      const quote = subscriptions.getUpgradeQuote(id, annual);
      const salesBefore = db.prepare('SELECT COUNT(*) AS n FROM sales WHERE shift_id = ?').get(shiftId).n;

      const created = subscriptions.upgradeSubscription(id, annual, { payments: [{ method: 'cash', amount: quote.amount_due }] });

      expect(sub(id).status).toBe('cancelled');
      expect(created).toMatchObject({ package_id: annual, status: 'active', customer_id: ahmed, upgraded_from_id: id });
      const days = (new Date(created.end_date) - new Date(created.start_date)) / DAY;
      expect(Math.round(days)).toBe(365);
      const sale = db.prepare('SELECT * FROM sales WHERE shift_id = ? ORDER BY id DESC LIMIT 1').get(shiftId);
      expect(sale).toMatchObject({ total_amount: quote.amount_due, payment_method: 'cash', customer_id: ahmed });
      expect(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE shift_id = ?').get(shiftId).n).toBe(salesBefore + 1);
      expect(db.prepare("SELECT COUNT(*) AS n FROM cashier_audit_logs WHERE action_type = 'subscription_change'").get().n).toBeGreaterThan(0);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(created.id);
    });

    test('a payment split that does not match the amount due rolls everything back', () => {
      const id = insertSub(ahmed, monthly, { start: -15, end: 15 });
      const salesBefore = db.prepare('SELECT COUNT(*) AS n FROM sales').get().n;
      expect(() => subscriptions.upgradeSubscription(id, annual, { payments: [{ method: 'cash', amount: 1 }] })).toThrow(/مجموع الدفعات/);
      expect(sub(id).status).toBe('active');
      expect(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n).toBe(salesBefore);
      expect(db.prepare('SELECT COUNT(*) AS n FROM customer_subscriptions WHERE upgraded_from_id = ?').get(id).n).toBe(0);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(id);
    });
  });

  describe('transfer', () => {
    test('moves a running subscription, with its balance, to another member', () => {
      const id = insertSub(ahmed, monthly);
      const moved = subscriptions.transferSubscription(id, sara);
      expect(moved).toMatchObject({ customer_id: sara, customer_name: 'سارة', status: 'active' });
      expect(moved.notes).toContain('منقول من أحمد');
      expect(moved.end_date).toBe(sub(id).end_date);
      db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(id);
    });

    test('refuses an ended subscription, the same member, a missing member, and a member who already has a running one', () => {
      const ended = insertSub(ahmed, monthly, { status: 'expired', start: -60, end: -30 });
      expect(() => subscriptions.transferSubscription(ended, sara)).toThrow(/النشطة أو المجمدة/);

      const mine = insertSub(ahmed, monthly);
      expect(() => subscriptions.transferSubscription(mine, ahmed)).toThrow(/بالفعل باسم/);
      expect(() => subscriptions.transferSubscription(mine, 987654)).toThrow(/غير موجود/);

      const hers = insertSub(sara, monthly);
      expect(() => subscriptions.transferSubscription(mine, sara)).toThrow(/لديه اشتراك فعّال/);
      expect(sub(mine).customer_id).toBe(ahmed);
      [mine, hers].forEach((x) => db.prepare("UPDATE customer_subscriptions SET status = 'cancelled' WHERE id = ?").run(x));
    });
  });

  describe('member profile', () => {
    test('is empty until saved, then stores emergency contact, health notes and trainer', () => {
      expect(members.getMemberProfile(ahmed)).toMatchObject({ emergency_name: null, health_notes: null, trainer_id: null });
      const trainerId = db.prepare("INSERT INTO gym_trainers (name, specialty) VALUES ('كابتن حسام', 'قوة')").run().lastInsertRowid;

      const saved = members.saveMemberProfile(ahmed, { emergency_name: '  هند  ', emergency_phone: '0111 907 6620', health_notes: 'إصابة سابقة في الركبة', trainer_id: trainerId });
      expect(saved).toMatchObject({ emergency_name: 'هند', emergency_phone: '0111 907 6620', health_notes: 'إصابة سابقة في الركبة', trainer_id: trainerId, trainer_name: 'كابتن حسام' });

      // saving again updates, it does not duplicate
      members.saveMemberProfile(ahmed, { emergency_name: 'هند', health_notes: '' });
      expect(db.prepare('SELECT COUNT(*) AS n FROM gym_member_profiles WHERE customer_id = ?').get(ahmed).n).toBe(1);
      expect(members.getMemberProfile(ahmed)).toMatchObject({ health_notes: null, trainer_id: null });
    });

    test('rejects a missing member, a bad phone, a missing trainer and over-long notes', () => {
      expect(() => members.saveMemberProfile(424242, {})).toThrow(/العميل غير موجود/);
      expect(() => members.saveMemberProfile(ahmed, { emergency_phone: 'abc' })).toThrow(/غير صحيح/);
      expect(() => members.saveMemberProfile(ahmed, { trainer_id: 9999 })).toThrow(/المدرب/);
      expect(() => members.saveMemberProfile(ahmed, { health_notes: 'x'.repeat(1001) })).toThrow(/1000/);
    });
  });
});
