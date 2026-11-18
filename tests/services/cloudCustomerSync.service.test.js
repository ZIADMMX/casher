const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
mockDb.exec(`
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    loyalty_points INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    tier TEXT,
    rating INTEGER,
    is_synced INTEGER DEFAULT 0,
    synced_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

jest.mock('../../electron/database/db', () => ({ db: mockDb }));

const mockSettings = new Map();
jest.mock('../../electron/repositories/settings.repository', () => ({
  get: (key) => mockSettings.get(key) || null,
  set: (key, value) => mockSettings.set(key, value),
}));

jest.mock('../../electron/security/deviceId', () => ({
  getDeviceId: () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
}));

const cloudCustomerSync = require('../../electron/services/cloudCustomerSync.service');

const LICENSE = 'FOX1-ABCDE-FGHJK-MNPQR';

// No real network: the Worker is replaced by a fetch that records what the desktop sent.
let calls = [];
let pullPayload = { success: true, customers: [] };

beforeEach(() => {
  calls = [];
  mockSettings.clear();
  mockSettings.set('license_key', LICENSE);
  mockDb.prepare('DELETE FROM customers').run();
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const body = options.method === 'GET' || !options.method
      ? pullPayload
      : { success: true, count: JSON.parse(options.body).customers.length };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
});

describe('Cloud Customer Sync Service', () => {
  test('pushes local customers to cloud endpoint with an auth key', async () => {
    const info = mockDb.prepare(`
      INSERT INTO customers (uuid, name, phone, email, is_active, is_synced)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run('u-1', 'عميل سحابي تجريبي', '01012345678', 'sync-test@example.com', 1);

    const result = await cloudCustomerSync.pushCustomersToCloud();
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].options.headers.Authorization).toBe(`Bearer ${LICENSE}`);
    expect(JSON.parse(calls[0].options.body).customers[0].uuid).toBe('u-1');

    const updated = mockDb.prepare('SELECT is_synced FROM customers WHERE id = ?').get(info.lastInsertRowid);
    expect(updated.is_synced).toBe(1);
  });

  test('a trial copy syncs too, with a key of its own that it keeps', async () => {
    mockSettings.clear();
    mockDb.prepare('INSERT INTO customers (uuid, name) VALUES (?, ?)').run('u-2', 'عميل');

    expect((await cloudCustomerSync.pushCustomersToCloud()).success).toBe(true);
    const first = calls[0].options.headers.Authorization;
    expect(first).toMatch(/^Bearer [0-9a-f]{64}$/);
    expect(first).not.toContain('FOX1');

    await cloudCustomerSync.pushCustomersToCloud({ onlyUnsynced: false });
    expect(calls[1].options.headers.Authorization).toBe(first);
  });

  test('activating switches the credential to the licence key', async () => {
    mockSettings.clear();
    mockDb.prepare('INSERT INTO customers (uuid, name) VALUES (?, ?)').run('u-5', 'عميل');
    await cloudCustomerSync.pushCustomersToCloud();

    mockSettings.set('license_key', LICENSE);
    await cloudCustomerSync.pushCustomersToCloud({ onlyUnsynced: false });
    expect(calls[1].options.headers.Authorization).toBe(`Bearer ${LICENSE}`);
  });

  test('pulls customers from cloud and writes them locally', async () => {
    pullPayload = {
      success: true,
      customers: [
        { uuid: 'cloud-1', name: 'عميل من السحابة', phone: '01099887766', email: 'c@example.com', loyalty_points: 10, is_active: 1 },
      ],
    };

    const result = await cloudCustomerSync.pullCustomersFromCloud();
    expect(result.success).toBe(true);
    expect(result.inserted).toBe(1);
    expect(calls[0].options.headers.Authorization).toMatch(/^Bearer /);

    const row = mockDb.prepare('SELECT name, phone, is_synced FROM customers WHERE uuid = ?').get('cloud-1');
    expect(row.name).toBe('عميل من السحابة');
    expect(row.is_synced).toBe(1);
  });

  test('a failed push leaves the customer unsynced', async () => {
    const info = mockDb.prepare('INSERT INTO customers (uuid, name) VALUES (?, ?)').run('u-3', 'عميل');
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => 'forbidden' }));

    const result = await cloudCustomerSync.pushCustomersToCloud();
    expect(result.success).toBe(false);
    const row = mockDb.prepare('SELECT is_synced FROM customers WHERE id = ?').get(info.lastInsertRowid);
    expect(row.is_synced).toBe(0);
  });

  test('syncs a single customer on save', async () => {
    const info = mockDb.prepare('INSERT INTO customers (uuid, name) VALUES (?, ?)').run('u-4', 'عميل مفرد');
    const ok = await cloudCustomerSync.syncSingleCustomer(info.lastInsertRowid);
    expect(ok).toBe(true);
    const row = mockDb.prepare('SELECT is_synced FROM customers WHERE id = ?').get(info.lastInsertRowid);
    expect(row.is_synced).toBe(1);
  });
});
