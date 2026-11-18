// @vitest-environment node
import { describe, expect, test } from 'vitest';
import crypto from 'node:crypto';
import { handle } from '../src/index.js';

const DEVICE = 'a'.repeat(64);
const OTHER_DEVICE = 'b'.repeat(64);

// A throwaway vendor key pair: the test signs licences the Worker then verifies.
const vendor = crypto.generateKeyPairSync('ed25519');
const PUBLIC_KEY = vendor.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// The same key the desktop builds: version, the device's HWID, an expiry, Ed25519 signature.
function licenceFor(device, { privateKey = vendor.privateKey, expirySeconds = 4_000_000_000 } = {}) {
  const payload = Buffer.alloc(9);
  payload.writeUInt8(1, 0);
  Buffer.from(device.slice(0, 8), 'hex').copy(payload, 1);
  payload.writeUInt32BE(expirySeconds, 5);
  const signature = crypto.sign(null, Buffer.concat([Buffer.from('foxcloud-license-v1:'), payload]), privateKey);
  return `FOX1-${base32Encode(Buffer.concat([payload, signature]))}`;
}

// Minimal D1 stand-in for the customer-sync queries.
function fakeD1() {
  const rows = new Map(); // `${device}|${uuid}` -> row
  const owners = new Map();
  const run = (sql, a) => {
    if (sql.includes('INTO customer_sync_owners')) {
      if (sql.includes('DO UPDATE') || !owners.has(a[0])) owners.set(a[0], a[1]);
    } else if (sql.includes('INTO cloud_customers')) {
      rows.set(`${a[1]}|${a[0]}`, {
        uuid: a[0], device_id: a[1], name: a[2], phone: a[3], email: a[4],
        loyalty_points: a[5], is_active: a[6], tier: a[7], rating: a[8], extra_json: a[9], updated_at: a[10],
      });
    }
    return {};
  };
  return {
    rows,
    owners,
    prepare(sql) {
      return {
        bind: (...a) => ({
          first: async () => {
            if (sql.includes('FROM devices')) return a[0] === DEVICE ? { first_seen: 1 } : null;
            if (sql.includes('FROM customer_sync_owners')) return owners.has(a[0]) ? { key_hash: owners.get(a[0]) } : null;
            return null;
          },
          all: async () => ({ results: [...rows.values()].filter((r) => r.device_id === a[0] && r.updated_at >= a[1]) }),
          run: async () => run(sql, a),
          _run: () => run(sql, a),
        }),
      };
    },
    batch: async (statements) => statements.map((s) => s._run()),
  };
}

const envWith = (DB = fakeD1()) => ({ DB, LICENSE_PUBLIC_KEY: PUBLIC_KEY });

const push = (body, licence) => new Request('https://x.workers.dev/api/sync/customers', {
  method: 'POST',
  headers: licence ? { Authorization: `Bearer ${licence}` } : {},
  body: JSON.stringify(body),
});

const pull = (device, licence) => new Request(
  `https://x.workers.dev/api/sync/customers?device=${device}&since=0`,
  { method: 'GET', headers: licence ? { Authorization: `Bearer ${licence}` } : {} }
);

const customer = (uuid, name) => ({ uuid, name, phone: '01012345678', email: 'c@example.com', updated_at: 5 });

describe('cloud customer sync', () => {
  test('a licensed device pushes its customers and pulls them back', async () => {
    const env = envWith();
    const licence = licenceFor(DEVICE);

    const pushed = await handle(push({ device: DEVICE, customers: [customer('u-1', 'عميل')] }, licence), env, 10);
    expect(pushed.status).toBe(200);
    expect((await pushed.json()).count).toBe(1);

    const body = await (await handle(pull(DEVICE, licence), env, 11)).json();
    expect(body.customers.map((c) => c.uuid)).toEqual(['u-1']);
    expect(body.customers[0].phone).toBe('01012345678');
  });

  test('an expired licence can still pull its own customers back', async () => {
    const env = envWith();
    await handle(push({ device: DEVICE, customers: [customer('u-1', 'عميل')] }, licenceFor(DEVICE)), env, 10);

    const expired = licenceFor(DEVICE, { expirySeconds: 1 });
    expect((await handle(pull(DEVICE, expired), env, 11)).status).toBe(200);
  });

  test('with no credential at all nobody can push or read customer data', async () => {
    const env = envWith();
    expect((await handle(push({ device: DEVICE, customers: [customer('u-1', 'x')] }, ''), env, 10)).status).toBe(401);
    expect((await handle(pull(DEVICE, ''), env, 11)).status).toBe(401);
    expect((await handle(pull(DEVICE, 'FOX1-NOTAREALKEY'), env, 12)).status).toBe(401);
    expect((await handle(pull(DEVICE, 'not-a-key'), env, 13)).status).toBe(401);
  });

  // A shop on trial has no licence yet, but its customers must still reach the cloud.
  test('a trial copy claims its device and keeps syncing with the same key', async () => {
    const env = envWith();
    const trialKey = 'a1b2c3d4'.repeat(8);

    expect((await handle(push({ device: DEVICE, customers: [customer('t-1', 'تجريبي')] }, trialKey), env, 10)).status).toBe(200);
    const body = await (await handle(pull(DEVICE, trialKey), env, 11)).json();
    expect(body.customers.map((c) => c.uuid)).toEqual(['t-1']);

    // Someone else who knows the device id cannot read or overwrite what it claimed.
    const intruder = 'f'.repeat(64);
    expect((await handle(pull(DEVICE, intruder), env, 12)).status).toBe(403);
    expect((await handle(push({ device: DEVICE, customers: [customer('t-2', 'دخيل')] }, intruder), env, 13)).status).toBe(403);
    expect([...env.DB.rows.keys()]).toEqual([`${DEVICE}|t-1`]);
  });

  // The claim must never lock the real shop out of its own data.
  test('activating overrides whoever claimed the device', async () => {
    const env = envWith();
    const squatter = 'd'.repeat(64);
    await handle(push({ device: DEVICE, customers: [customer('s-1', 'محجوز')] }, squatter), env, 10);

    const licence = licenceFor(DEVICE);
    expect((await handle(pull(DEVICE, licence), env, 11)).status).toBe(200);

    // And the squatter is out for good.
    expect((await handle(pull(DEVICE, squatter), env, 12)).status).toBe(403);
  });

  // The land grab: knowing a device id is no longer enough to claim or read its store.
  test('a forged or borrowed licence cannot take over a device', async () => {
    const env = envWith();
    await handle(push({ device: DEVICE, customers: [customer('u-1', 'عميل')] }, licenceFor(DEVICE)), env, 10);

    const attacker = crypto.generateKeyPairSync('ed25519');
    const forged = licenceFor(DEVICE, { privateKey: attacker.privateKey });
    expect((await handle(push({ device: DEVICE, customers: [customer('u-2', 'دخيل')] }, forged), env, 11)).status).toBe(403);
    expect((await handle(pull(DEVICE, forged), env, 12)).status).toBe(403);

    // A genuine licence signed for a different machine is refused just the same.
    const elsewhere = licenceFor(OTHER_DEVICE);
    expect((await handle(pull(DEVICE, elsewhere), env, 13)).status).toBe(403);

    expect([...env.DB.rows.keys()]).toEqual([`${DEVICE}|u-1`]);
  });

  test('an unknown or malformed device is refused', async () => {
    const env = envWith();
    expect((await handle(pull(OTHER_DEVICE, licenceFor(OTHER_DEVICE)), env, 10)).status).toBe(403);
    expect((await handle(pull('short', licenceFor(DEVICE)), env, 10)).status).toBe(400);
  });
});
