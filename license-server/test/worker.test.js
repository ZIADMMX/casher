// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const env = {
  TIME_SIGNING_KEY: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  DB: fakeD1(),
};
const DEVICE = 'a'.repeat(64);
const NONCE = 'b'.repeat(32);

function fakeD1() {
  const rows = new Map();
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => {
              if (!rows.has(args[0])) rows.set(args[0], args[1]);
            },
            first: async () => (rows.has(args[0]) ? { first_seen: rows.get(args[0]) } : null),
          };
        },
      };
    },
  };
}

function ask(device = DEVICE, nonce = NONCE) {
  return new Request(`https://x.workers.dev/api/license/time?device=${device}&nonce=${nonce}`);
}

describe('license time server', () => {
  test('signs the time and trial start for this device and nonce', async () => {
    const res = await handle(ask(), env, 1_000_000);
    const body = await res.json();

    expect(body.trialStart).toBe(1_000_000);
    const message = Buffer.from(`foxcloud-time-v1:${body.utc}|${DEVICE}|${NONCE}|${body.trialStart}`);
    expect(verify(null, message, publicKey, Buffer.from(body.sig, 'base64'))).toBe(true);
  });

  test('remembers the first run, so a reinstall gets the old trial start', async () => {
    await handle(ask('c'.repeat(64)), env, 5_000);
    const later = await (await handle(ask('c'.repeat(64)), env, 9_000_000)).json();

    expect(later.trialStart).toBe(5_000);
  });

  test('rejects requests without a valid device and nonce', async () => {
    const res = await handle(new Request('https://x.workers.dev/api/license/time'), env);
    expect(res.status).toBe(400);
  });
});
