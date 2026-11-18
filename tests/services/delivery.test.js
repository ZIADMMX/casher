/**
 * @file delivery.test.js
 * @description طلبات تطبيقات الدليفري: الاستقبال بدون تكرار، ربط الأصناف بالمنيو، القبول كفاتورة توصيل، الرفض، وسحب الصندوق.
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAuth: jest.fn(() => ({ id: 1 })) }));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/sales.service', () => ({ createSale: jest.fn(() => ({ saleId: 501, totalAmount: 120 })) }));
jest.mock('../../electron/services/licenseClock.service', () => ({ getTimeEndpoint: jest.fn(() => 'https://fox.example.workers.dev/api/license/time') }));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const sales = require('../../electron/services/sales.service');
const delivery = require('../../electron/services/delivery.service');

let burgerVariant;
const order = (extra = {}) => ({
  id: 'T-1001', source: 'Talabat', customer: { name: 'سارة', phone: '01011112222', address: '5 شارع النيل' }, total: 150,
  items: [{ sku: 'DLV-BURGER', name: 'برجر', quantity: 2 }], ...extra,
});

beforeAll(() => {
  db.exec("DELETE FROM delivery_orders; DELETE FROM product_variants WHERE sku = 'DLV-BURGER'; DELETE FROM products WHERE name = 'برجر دليفري'");
  const productId = Number(db.prepare("INSERT INTO products (name) VALUES ('برجر دليفري')").run().lastInsertRowid);
  burgerVariant = Number(db.prepare("INSERT INTO product_variants (product_id, sku, purchase_price, selling_price, stock_quantity) VALUES (?, 'DLV-BURGER', 20, 60, 50)").run(productId).lastInsertRowid);
});
afterAll(() => {
  db.exec("DELETE FROM delivery_orders; DELETE FROM product_variants WHERE sku = 'DLV-BURGER'; DELETE FROM products WHERE name = 'برجر دليفري'");
});
beforeEach(() => {
  jest.clearAllMocks();
  db.exec('DELETE FROM delivery_orders');
});

describe('receiving orders', () => {
  test('saves an order and matches its items to the menu by SKU, then by exact name', () => {
    const { id, created } = delivery.receive(order({ items: [{ sku: 'DLV-BURGER', name: 'x', quantity: 2 }, { name: 'برجر دليفري', quantity: 1 }, { name: 'صنف مجهول', quantity: 1 }] }));
    expect(created).toBe(true);
    const saved = delivery.getOrders('new').find((o) => o.id === id);
    expect(saved).toMatchObject({ source: 'talabat', external_id: 'T-1001', customer_name: 'سارة', status: 'new', app_total: 150 });
    expect(saved.items.map((i) => i.variant_id)).toEqual([burgerVariant, burgerVariant, null]);
  });

  test('the same order again is ignored, so a re-delivery never doubles it', () => {
    delivery.receive(order());
    expect(delivery.receive(order())).toMatchObject({ created: false });
    expect(delivery.getOrders()).toHaveLength(1);
  });

  test('accepts the order as JSON text too, and refuses malformed orders', () => {
    expect(delivery.receive(JSON.stringify(order({ id: 'J-1' }))).created).toBe(true);
    expect(() => delivery.receive(order({ id: '' }))).toThrow('رقم الطلب');
    expect(() => delivery.receive(order({ items: [] }))).toThrow('أصناف');
    expect(() => delivery.receive(order({ items: [{ name: 'برجر', quantity: 0 }] }))).toThrow('صنف');
    expect(() => delivery.receive(order({ items: [{ name: 'برجر', quantity: 1.5 }] }))).toThrow('صنف');
    expect(() => delivery.receive(order({ total: -5 }))).toThrow('إجمالي');
    expect(() => delivery.receive('not json')).toThrow();
  });
});

describe('deciding', () => {
  test('accepting creates a delivery sale from the menu and closes the order', () => {
    const { id } = delivery.receive(order());
    const result = delivery.accept(id);
    expect(sales.createSale).toHaveBeenCalledWith({
      items: [{ variantId: burgerVariant, quantity: 2 }], paymentMethod: 'card', orderMode: 'delivery',
      delivery: { name: 'سارة', phone: '01011112222', address: '5 شارع النيل' },
    });
    expect(result.order).toMatchObject({ status: 'accepted', sale_id: 501 });
    expect(() => delivery.accept(id)).toThrow('اتقرر');
  });

  test('an unmatched item must be mapped to a menu item first', () => {
    const { id } = delivery.receive(order({ id: 'T-2', items: [{ name: 'صنف مجهول', quantity: 1 }] }));
    expect(() => delivery.accept(id)).toThrow('اربط الصنف');
    expect(sales.createSale).not.toHaveBeenCalled();
    delivery.accept(id, { 0: burgerVariant });
    expect(sales.createSale).toHaveBeenCalledWith(expect.objectContaining({ items: [{ variantId: burgerVariant, quantity: 1 }] }));
  });

  test('a delivery needs a phone and an address, which can be completed before accepting', () => {
    const { id } = delivery.receive(order({ id: 'T-3', customer: { name: 'كريم' } }));
    expect(() => delivery.accept(id)).toThrow('الموبايل والعنوان');
    delivery.updateDetails(id, { phone: '01022223333', address: '9 شارع الجمهورية' });
    expect(delivery.accept(id).order.status).toBe('accepted');
  });

  test('a failing sale (no shift, no stock) leaves the order waiting', () => {
    const { id } = delivery.receive(order({ id: 'T-4' }));
    sales.createSale.mockImplementationOnce(() => { throw new Error('افتح الوردية أولاً'); });
    expect(() => delivery.accept(id)).toThrow('الوردية');
    expect(delivery.getOrders('new').map((o) => o.id)).toContain(id);
  });

  test('rejecting records the reason and cannot be repeated', () => {
    const { id } = delivery.receive(order({ id: 'T-5' }));
    expect(delivery.reject(id, 'المطبخ مغلق')).toMatchObject({ status: 'rejected', reject_reason: 'المطبخ مغلق' });
    expect(() => delivery.reject(id)).toThrow('اتقرر');
    expect(sales.createSale).not.toHaveBeenCalled();
  });
});

describe('the Worker inbox', () => {
  const SettingsRepository = require('../../electron/repositories/settings.repository');
  const reply = (body) => ({ ok: true, json: async () => body });

  afterEach(() => jest.restoreAllMocks());

  test('write keys are stored encrypted but read back as the original value', () => {
    SettingsRepository.set('eta_client_secret', 'plain-secret-123');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'eta_client_secret'").get().value).toMatch(/^enc:/);
    expect(SettingsRepository.get('eta_client_secret')).toBe('plain-secret-123');
    expect(SettingsRepository.getAll()).not.toHaveProperty('eta_client_secret');
    db.prepare("DELETE FROM settings WHERE key = 'eta_client_secret'").run();
  });

  test('registers the inbox once and gives the public address', async () => {
    db.prepare("DELETE FROM settings WHERE key = 'delivery_inbox_token'").run();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(reply({ ok: true }));
    const info = await delivery.getInboxInfo();
    expect(info.url).toMatch(/^https:\/\/fox\.example\.workers\.dev\/d\/[A-Za-z0-9_-]{22}$/);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/inbox/');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    const again = await delivery.getInboxInfo();
    expect(again.url).toBe(info.url);
  });

  test('pulls waiting orders, saves them, and confirms only after saving', async () => {
    SettingsRepository.set('delivery_inbox_token', 'tok_ABCDEFGHIJKLMNOP');
    const calls = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      if (String(url).endsWith('/pull')) return reply({ items: [{ id: 11, payload: JSON.stringify(order({ id: 'W-1' })) }, { id: 12, payload: 'garbage' }] });
      return reply({ ok: true });
    });
    expect(await delivery.pollInbox()).toBe(2);
    expect(delivery.getOrders().map((o) => o.external_id)).toEqual(['W-1']);
    const ack = calls.find(([url]) => String(url).endsWith('/ack'));
    expect(ack[1].ids).toEqual([11, 12]);
    expect(ack[1].key).toMatch(/^[0-9a-f]{64}$/);
  });

  test('an unreachable Worker raises, so the next round simply tries again', async () => {
    SettingsRepository.set('delivery_inbox_token', 'tok_ABCDEFGHIJKLMNOP');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(delivery.pollInbox()).rejects.toThrow('offline');
  });

  test('a slow round does not let the next one pile up', async () => {
    SettingsRepository.set('delivery_inbox_token', 'tok_ABCDEFGHIJKLMNOP');
    let release;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(reply({ items: [] })); }),
    );
    const first = delivery.pollInbox();
    const second = delivery.pollInbox();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(0);
    expect(await second).toBe(0);
  });

  test('does nothing until an inbox exists', async () => {
    db.prepare("DELETE FROM settings WHERE key = 'delivery_inbox_token'").run();
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(await delivery.pollInbox()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
