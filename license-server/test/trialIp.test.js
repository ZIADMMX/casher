// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const { privateKey } = generateKeyPairSync('ed25519');
const SECRET = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const DAY = 24 * 3600 * 1000;
const dev = (c) => c.repeat(64);

function fakeD1() {
  const devices = new Map();
  const ips = new Map();
  return {
    prepare(sql) {
      return {
        bind: (...a) => ({
          run: async () => {
            if (sql.startsWith('INSERT OR IGNORE INTO devices')) {
              if (devices.has(a[0])) return { meta: { changes: 0 } };
              devices.set(a[0], a[1]);
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE devices')) devices.set(a[1], a[0]);
            if (sql.startsWith('INSERT OR REPLACE INTO trial_ips')) ips.set(a[0], a[1]);
            return { meta: { changes: 1 } };
          },
          first: async () => {
            if (sql.includes('FROM devices')) return devices.has(a[0]) ? { first_seen: devices.get(a[0]) } : null;
            if (sql.includes('FROM trial_ips')) return ips.has(a[0]) ? { first_seen: ips.get(a[0]) } : null;
            return null;
          },
        }),
      };
    },
  };
}

const ask = (device, ip, now, env) =>
  handle(
    new Request(`https://x.workers.dev/api/license/time?device=${device}&nonce=${'b'.repeat(32)}`, {
      headers: ip ? { 'CF-Connecting-IP': ip } : {},
    }),
    env,
    now
  ).then((r) => r.json());

describe('trial tied to the address', () => {
  test('a new device from the same address inherits the earlier trial start, for good', async () => {
    const env = { TIME_SIGNING_KEY: SECRET, DB: fakeD1() };
    const t0 = 1_000 * DAY;
    expect((await ask(dev('a'), '41.1.2.3', t0, env)).trialStart).toBe(t0);

    const reinstall = await ask(dev('c'), '41.1.2.3', t0 + 20 * DAY, env);
    expect(reinstall.trialStart).toBe(t0);
    // even after the address entry is old, the new device keeps the inherited start
    expect((await ask(dev('c'), '41.1.2.3', t0 + 60 * DAY, env)).trialStart).toBe(t0);
  });

  test('another address, or no address, starts its own trial', async () => {
    const env = { TIME_SIGNING_KEY: SECRET, DB: fakeD1() };
    const t0 = 1_000 * DAY;
    await ask(dev('a'), '41.1.2.3', t0, env);
    expect((await ask(dev('c'), '41.9.9.9', t0 + 20 * DAY, env)).trialStart).toBe(t0 + 20 * DAY);
    expect((await ask(dev('d'), null, t0 + 20 * DAY, env)).trialStart).toBe(t0 + 20 * DAY);
  });

  test('after 30 days a new device from that address gets a fresh trial', async () => {
    const env = { TIME_SIGNING_KEY: SECRET, DB: fakeD1() };
    const t0 = 1_000 * DAY;
    await ask(dev('a'), '41.1.2.3', t0, env);
    expect((await ask(dev('c'), '41.1.2.3', t0 + 31 * DAY, env)).trialStart).toBe(t0 + 31 * DAY);
  });

  test('pings from the shop own device never move the address clock forward', async () => {
    const env = { TIME_SIGNING_KEY: SECRET, DB: fakeD1() };
    const t0 = 1_000 * DAY;
    await ask(dev('a'), '41.1.2.3', t0, env);
    await ask(dev('a'), '41.1.2.3', t0 + 25 * DAY, env);
    expect((await ask(dev('c'), '41.1.2.3', t0 + 29 * DAY, env)).trialStart).toBe(t0);
  });

  test('IPv6 addresses count by their /64', async () => {
    const env = { TIME_SIGNING_KEY: SECRET, DB: fakeD1() };
    const t0 = 1_000 * DAY;
    await ask(dev('a'), '2001:db8:1:2:aaaa::1', t0, env);
    expect((await ask(dev('c'), '2001:db8:1:2:bbbb::9', t0 + DAY, env)).trialStart).toBe(t0);
  });
});
