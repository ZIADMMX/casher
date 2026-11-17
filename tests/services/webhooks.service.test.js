const crypto = require('node:crypto');

jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  return { db: new Database(':memory:') };
});
jest.mock('../../electron/security/vault', () => ({
  encryptSecret: (v) => `enc:${v}`,
  decryptSecret: (v) => String(v).replace(/^enc:/, ''),
}));

const { db } = require('../../electron/database/db');
const { ensureWebhooks } = require('../../electron/database/migrations/webhooks');
const webhooks = require('../../electron/services/webhooks.service');

describe('webhooks service', () => {
  beforeAll(() => ensureWebhooks(db));
  beforeEach(() => {
    db.exec('DELETE FROM webhook_outbox; DELETE FROM webhooks');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  test('rejects bad input', () => {
    expect(() => webhooks.create({ name: '', url: 'https://a.test', events: ['sale.created'] })).toThrow('اسم');
    expect(() => webhooks.create({ name: 'x', url: 'ftp://a.test', events: ['sale.created'] })).toThrow('http');
    expect(() => webhooks.create({ name: 'x', url: 'https://a.test', events: ['nope'] })).toThrow('حدث');
  });

  describe('retry outbox', () => {
    const tick = () => new Promise((r) => setImmediate(r));
    const queued = () => db.prepare('SELECT * FROM webhook_outbox').all();
    const makeDue = () => db.exec("UPDATE webhook_outbox SET next_at = datetime('now', '-1 minute')");

    test('a dropped connection is queued and sent again later with the same body', async () => {
      webhooks.create({ name: 'shop', url: 'https://a.test/hook', events: ['sale.created'] });
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      webhooks.dispatch('sale.created', { id: 7 });
      await tick();
      expect(queued()).toHaveLength(1);
      const firstBody = global.fetch.mock.calls[0][1].body;

      await webhooks.retryPending();
      expect(global.fetch).toHaveBeenCalledTimes(1); // not due yet

      makeDue();
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      await webhooks.retryPending();
      expect(global.fetch.mock.calls[0][1].body).toBe(firstBody);
      expect(queued()).toHaveLength(0);
    });

    test('a server error is retried, a refusal (4xx) is not', async () => {
      webhooks.create({ name: 'shop', url: 'https://a.test/hook', events: ['sale.created'] });
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      webhooks.dispatch('sale.created', { id: 1 });
      await tick();
      expect(queued()).toHaveLength(1);

      db.exec('DELETE FROM webhook_outbox');
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
      webhooks.dispatch('sale.created', { id: 2 });
      await tick();
      expect(queued()).toHaveLength(0);
    });

    test('gives up after the fifth failed delivery', async () => {
      webhooks.create({ name: 'shop', url: 'https://a.test/hook', events: ['sale.created'] });
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      webhooks.dispatch('sale.created', { id: 7 });
      await tick();
      for (let i = 0; i < 3; i++) { makeDue(); await webhooks.retryPending(); expect(queued()).toHaveLength(1); }
      makeDue();
      await webhooks.retryPending();
      expect(queued()).toHaveLength(0);
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    test('a deleted or switched-off hook drops its queued deliveries', async () => {
      const hook = webhooks.create({ name: 'shop', url: 'https://a.test/hook', events: ['sale.created'] });
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      webhooks.dispatch('sale.created', { id: 7 });
      await tick();
      webhooks.update(hook.id, { name: 'shop', url: 'https://a.test/hook', events: ['sale.created'], is_active: false });
      makeDue();
      await webhooks.retryPending();
      expect(queued()).toHaveLength(0);
    });
  });

  test('dispatch posts a signed body only to active hooks subscribed to the event', async () => {
    const hook = webhooks.create({ name: 'shop', url: 'https://a.test/hook', events: ['sale.created'] });
    webhooks.create({ name: 'off', url: 'https://b.test', events: ['sale.created'], is_active: false });
    webhooks.create({ name: 'other', url: 'https://c.test', events: ['customer.created'] });
    expect(hook.secret).toMatch(/^whsec_/);

    webhooks.dispatch('sale.created', { id: 7 });
    await new Promise((r) => setImmediate(r));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://a.test/hook');
    expect(JSON.parse(init.body)).toMatchObject({ event: 'sale.created', data: { id: 7 } });
    const expected = `sha256=${crypto.createHmac('sha256', hook.secret).update(init.body).digest('hex')}`;
    expect(init.headers['X-Fox-Signature']).toBe(expected);
    expect(webhooks.list().find((h) => h.id === hook.id).last_status).toBe(200);
  });

  test('a failing endpoint is recorded, not thrown', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const hook = webhooks.create({ name: 'dead', url: 'http://localhost:1', events: ['sale.created'] });
    await expect(webhooks.test(hook.id)).resolves.toMatchObject({ ok: false, error: 'ECONNREFUSED' });
    expect(webhooks.list()[0].last_error).toBe('ECONNREFUSED');
  });
});
