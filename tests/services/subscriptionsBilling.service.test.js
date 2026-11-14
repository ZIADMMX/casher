const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const subscriptions = require('../../electron/services/subscriptions.service');

describe('subscription billing and freeze cap', () => {
  let customerId;
  let pkgId;
  let cappedPkgId;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    customerId = db.prepare("INSERT INTO customers (name, phone) VALUES ('سمير', '01000000001')").run().lastInsertRowid;
    pkgId = db.prepare("INSERT INTO packages (name, type, price, duration_days) VALUES ('شهري', 'time_based', 600, 30)").run().lastInsertRowid;
    cappedPkgId = db.prepare("INSERT INTO packages (name, type, price, duration_days, max_freeze_days) VALUES ('شهري محدود', 'time_based', 600, 30, 7)").run().lastInsertRowid;
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  const openShift = () => {
    const userId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('reception', 'x', 'cashier')").run().lastInsertRowid;
    return db.prepare("INSERT INTO shifts (user_id, opening_cash, status) VALUES (?, 0, 'open')").run(userId).lastInsertRowid;
  };

  test('refuses to sell a subscription with no open shift', () => {
    expect(() => subscriptions.subscribeCustomer({ customer_id: customerId, package_id: pkgId }))
      .toThrow(/وردية مفتوحة/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customer_subscriptions').get().n).toBe(0);
  });

  test('records the package price as a sale on the open shift', () => {
    const shiftId = openShift();
    const sub = subscriptions.subscribeCustomer({ customer_id: customerId, package_id: pkgId, payment_method: 'cash' });
    expect(sub.status).toBe('active');

    const sale = db.prepare('SELECT * FROM sales WHERE shift_id = ? ORDER BY id DESC LIMIT 1').get(shiftId);
    expect(sale).toMatchObject({ total_amount: 600, payment_method: 'cash', customer_id: customerId });

    subscriptions.renewSubscription(sub.id, {}, { payment_method: 'card' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM sales WHERE shift_id = ? AND payment_method = 'card'").get(shiftId).n).toBe(1);
  });

  test('split and installment payments become one sale per payment, adding up to the price', () => {
    const shiftId = db.prepare('SELECT id FROM shifts ORDER BY id DESC LIMIT 1').get().id;
    const salesBefore = db.prepare('SELECT COUNT(*) AS n FROM sales WHERE shift_id = ?').get(shiftId).n;

    subscriptions.subscribeCustomer({
      customer_id: customerId,
      package_id: pkgId,
      payments: [
        { method: 'cash', amount: 250 },
        { method: 'card', amount: 150 },
        { method: 'credit', amount: 200, due_date: '2030-01-01' },
      ],
    });

    const rows = db.prepare('SELECT payment_method, total_amount, due_date FROM sales WHERE shift_id = ? ORDER BY id DESC LIMIT 3').all(shiftId).reverse();
    expect(rows.map((r) => [r.payment_method, r.total_amount])).toEqual([['cash', 250], ['card', 150], ['credit', 200]]);
    expect(rows[2].due_date).toBeTruthy();
    expect(rows[0].due_date).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE shift_id = ?').get(shiftId).n).toBe(salesBefore + 3);
  });

  test('rejects payments that do not add up to the package price, and rolls the subscription back', () => {
    const subsBefore = db.prepare('SELECT COUNT(*) AS n FROM customer_subscriptions').get().n;
    expect(() => subscriptions.subscribeCustomer({
      customer_id: customerId,
      package_id: pkgId,
      payments: [{ method: 'cash', amount: 100 }, { method: 'card', amount: 100 }],
    })).toThrow(/مجموع الدفعات/);
    expect(() => subscriptions.subscribeCustomer({
      customer_id: customerId,
      package_id: pkgId,
      payments: [{ method: 'wallet', amount: 600 }],
    })).toThrow(/طريقة الدفع/);
    expect(() => subscriptions.subscribeCustomer({
      customer_id: customerId,
      package_id: pkgId,
      payments: [{ method: 'cash', amount: 0 }, { method: 'card', amount: 600 }],
    })).toThrow(/أكبر من صفر/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customer_subscriptions').get().n).toBe(subsBefore);
  });

  test('credit needs a due date', () => {
    expect(() => subscriptions.subscribeCustomer({ customer_id: customerId, package_id: pkgId, payment_method: 'credit' }))
      .toThrow(/تاريخ الاستحقاق/);
  });

  test('freezing stops at the days the package allows', () => {
    const sub = subscriptions.subscribeCustomer({ customer_id: customerId, package_id: cappedPkgId });
    subscriptions.freezeSubscription(sub.id);
    // Pretend the member stayed frozen for 20 days, past the 7 the package allows.
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString();
    db.prepare('UPDATE subscription_freeze_logs SET freeze_date = ? WHERE subscription_id = ?').run(twentyDaysAgo, sub.id);

    const unfrozen = subscriptions.unfreezeSubscription(sub.id);
    expect(unfrozen.frozen_days_used).toBe(7);
    expect(() => subscriptions.freezeSubscription(sub.id)).toThrow(/أيام التجميد/);
  });
});
