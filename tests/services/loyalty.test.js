/**
 * @file loyalty.test.js
 * @description نقاط الولاء: الكسب، الاستبدال بخصم (محسوب على السيرفر)، عكس النقاط في المرتجع، والتعديل اليدوي.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAuth: jest.fn(() => ({ id: 1 })) }));
const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();

const SettingsRepository = require('../../electron/repositories/settings.repository');
const loyalty = require('../../electron/services/loyalty.service');

let customerId;
const setup = (values) => Object.entries({ loyalty_enabled: '1', loyalty_earn_per_100: '10', loyalty_redeem_value_per_100: '10', loyalty_min_redeem: '100', ...values })
  .forEach(([k, v]) => SettingsRepository.set(k, v));
const points = () => db.prepare('SELECT loyalty_points AS p FROM customers WHERE id = ?').get(customerId).p;

beforeAll(() => {
  db.exec("DELETE FROM loyalty_ledger WHERE customer_id IN (SELECT id FROM customers WHERE phone = '01055550000')");
  db.exec("DELETE FROM customers WHERE phone = '01055550000'");
  customerId = Number(db.prepare("INSERT INTO customers (name, phone) VALUES ('عميل ولاء', '01055550000')").run().lastInsertRowid);
});
afterAll(() => {
  db.prepare('DELETE FROM loyalty_ledger WHERE customer_id = ?').run(customerId);
  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  for (const key of ['loyalty_enabled', 'loyalty_earn_per_100', 'loyalty_redeem_value_per_100', 'loyalty_min_redeem']) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
});
beforeEach(() => {
  db.prepare('DELETE FROM loyalty_ledger WHERE customer_id = ?').run(customerId);
  db.prepare('UPDATE customers SET loyalty_points = 0 WHERE id = ?').run(customerId);
  setup();
});

describe('earning', () => {
  test('nothing happens while the program is off', () => {
    setup({ loyalty_enabled: '0' });
    expect(loyalty.recordSale({ customerId, saleId: 1, earnBase: 500, paymentMethod: 'cash' })).toMatchObject({ earned: 0 });
    expect(points()).toBe(0);
  });

  test('earns points on what was paid for goods, rounded down', () => {
    expect(loyalty.recordSale({ customerId, saleId: 1, earnBase: 259, paymentMethod: 'cash' })).toMatchObject({ earned: 25, balance: 25 });
    expect(points()).toBe(25);
  });

  test('a credit sale earns nothing yet, and a sale with no customer is ignored', () => {
    expect(loyalty.recordSale({ customerId, saleId: 2, earnBase: 1000, paymentMethod: 'credit' }).earned).toBe(0);
    expect(loyalty.recordSale({ customerId: null, saleId: 3, earnBase: 1000, paymentMethod: 'cash' }).earned).toBe(0);
    expect(points()).toBe(0);
  });
});

describe('redeeming', () => {
  beforeEach(() => loyalty.adjust(customerId, 500, 'رصيد افتتاحي'));

  test('points become a discount at the configured rate', () => {
    expect(loyalty.planRedemption(customerId, 200, 1000)).toEqual({ points: 200, discount: 20 });
  });

  test('refuses what the customer cannot use', () => {
    expect(() => loyalty.planRedemption(customerId, 50, 1000)).toThrow('أقل عدد');
    expect(() => loyalty.planRedemption(customerId, 900, 1000)).toThrow('رصيد');
    expect(() => loyalty.planRedemption(null, 200, 1000)).toThrow('اختار العميل');
    expect(() => loyalty.planRedemption(customerId, 1.5, 1000)).toThrow();
    setup({ loyalty_enabled: '0' });
    expect(() => loyalty.planRedemption(customerId, 200, 1000)).toThrow('مش مفعّلة');
  });

  test('never pays for more than the invoice: only the points needed are used', () => {
    expect(loyalty.planRedemption(customerId, 500, 30)).toEqual({ points: 300, discount: 30 });
  });

  test('no request means no discount and no checks', () => {
    expect(loyalty.planRedemption(customerId, 0, 100)).toEqual({ points: 0, discount: 0 });
    expect(loyalty.planRedemption(customerId, undefined, 100)).toEqual({ points: 0, discount: 0 });
  });

  test('a sale takes the points and gives new ones, with ledger rows', () => {
    const result = loyalty.recordSale({ customerId, saleId: 9, redeemPoints: 200, earnBase: 180, paymentMethod: 'cash' });
    expect(result).toMatchObject({ earned: 18, redeemed: 200, balance: 318 });
    expect(points()).toBe(318);
    const rows = db.prepare("SELECT reason, points FROM loyalty_ledger WHERE sale_id = 9 ORDER BY id").all();
    expect(rows).toEqual([{ reason: 'redeem', points: -200 }, { reason: 'earn', points: 18 }]);
  });

  test('refuses to redeem points the customer no longer has', () => {
    expect(() => loyalty.recordSale({ customerId, saleId: 10, redeemPoints: 900, earnBase: 100, paymentMethod: 'cash' })).toThrow('اتغيّر');
    expect(points()).toBe(500);
  });
});

describe('returns', () => {
  test('take back earned points in proportion, and never twice', () => {
    loyalty.recordSale({ customerId, saleId: 20, earnBase: 400, paymentMethod: 'cash' }); // 40 points
    expect(loyalty.reverseForReturn(20, 100)).toBe(10); // a quarter returned
    expect(loyalty.reverseForReturn(20, 100)).toBe(0); // same quarter again: already reversed
    expect(loyalty.reverseForReturn(20, 400)).toBe(30); // whole sale returned: the rest
    expect(points()).toBe(0);
  });

  test('the balance never goes below zero when the points were already spent', () => {
    loyalty.recordSale({ customerId, saleId: 21, earnBase: 400, paymentMethod: 'cash' }); // 40
    db.prepare('UPDATE customers SET loyalty_points = 5 WHERE id = ?').run(customerId); // spent 35 elsewhere
    expect(loyalty.reverseForReturn(21, 400)).toBe(5);
    expect(points()).toBe(0);
  });

  test('a sale that earned nothing has nothing to reverse', () => {
    expect(loyalty.reverseForReturn(99999, 50)).toBe(0);
  });
});

describe('manual adjustment', () => {
  test('needs a reason and cannot take more than the balance', () => {
    expect(() => loyalty.adjust(customerId, 50, '')).toThrow('سبب');
    expect(() => loyalty.adjust(customerId, -10, 'خطأ إدخال')).toThrow('أكبر من رصيد');
    expect(() => loyalty.adjust(99999999, 10, 'هدية')).toThrow('غير موجود');
    expect(loyalty.adjust(customerId, 50, 'هدية')).toBe(50);
    expect(loyalty.getHistory(customerId)[0]).toMatchObject({ points: 50, reason: 'adjust', balance_after: 50 });
  });

  test('the till sees the balance and what it is worth', () => {
    loyalty.adjust(customerId, 250, 'رصيد');
    expect(loyalty.getCustomerPoints(customerId)).toMatchObject({ enabled: true, points: 250, value: 25, minRedeem: 100 });
  });
});
