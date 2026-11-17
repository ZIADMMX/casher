// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const DEVICE = 'a'.repeat(64);
const TOKEN = 'tok_ABCDEFGHIJKLMNOP';
const KEY = 'c'.repeat(64);

// Minimal D1 stand-in: just enough for the queries the tracking routes run.
function fakeD1({ devices = [DEVICE] } = {}) {
  const tracking = new Map();
  return {
    tracking,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            first: async () => {
              if (sql.includes('FROM devices')) return devices.includes(a[0]) ? { first_seen: 1 } : null;
              const row = tracking.get(a[0]);
              return row || null;
            },
            run: async () => {
              if (sql.startsWith('INSERT INTO tracking')) tracking.set(a[0], { key_hash: a[1], data: a[2], updated_at: a[3] });
              if (sql.startsWith('DELETE FROM tracking')) for (const [k, v] of tracking) if (v.updated_at < a[0]) tracking.delete(k);
            },
          };
        },
      };
    },
  };
}

const snapshot = () => ({ order: { number: '24399', status: 'in_progress' }, vehicle: { plate: 'ل م ر 5570' }, shop: { name: 'ورشة' }, lines: [] });
const put = (body, token = TOKEN) =>
  new Request(`https://x.workers.dev/api/track/${token}`, { method: 'PUT', body: JSON.stringify(body) });

describe('customer tracking', () => {
  test('publishes a snapshot and serves the page and its data without any login', async () => {
    const env = { DB: fakeD1() };
    const res = await handle(put({ device: DEVICE, key: KEY, data: snapshot() }), env, 5_000);
    expect(res.status).toBe(200);

    const page = await handle(new Request(`https://x.workers.dev/t/${TOKEN}`), env, 6_000);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
    const html = await page.text();
    expect(html).toContain(`data-poll="/t/${TOKEN}/data"`);
    expect(html).toContain('24399');

    const data = await (await handle(new Request(`https://x.workers.dev/t/${TOKEN}/data`), env, 6_000)).json();
    expect(data.order.number).toBe('24399');
    expect(data.updated_at).toBe('5000');
  });

  test('another write key cannot overwrite a published token', async () => {
    const env = { DB: fakeD1() };
    await handle(put({ device: DEVICE, key: KEY, data: snapshot() }), env, 1);
    const res = await handle(put({ device: DEVICE, key: 'd'.repeat(64), data: snapshot() }), env, 2);
    expect(res.status).toBe(403);
  });

  test('an unknown device cannot publish', async () => {
    const env = { DB: fakeD1({ devices: [] }) };
    expect((await handle(put({ device: DEVICE, key: KEY, data: snapshot() }), env, 1)).status).toBe(403);
  });

  test('rejects malformed tokens and bodies, and unknown pages are 404', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(put({ device: DEVICE, key: KEY, data: snapshot() }, 'short'), env, 1)).status).toBe(400);
    expect((await handle(put({ device: DEVICE, key: KEY, data: {} }), env, 1)).status).toBe(400);
    expect((await handle(new Request('https://x.workers.dev/t/nothing_here_at_all_x'), env, 1)).status).toBe(404);
  });

  test('a script tag in the data cannot break out of the page', async () => {
    const env = { DB: fakeD1() };
    const bad = snapshot();
    bad.shop.name = '</script><script>alert(1)</script>';
    await handle(put({ device: DEVICE, key: KEY, data: bad }), env, 1);
    const html = await (await handle(new Request(`https://x.workers.dev/t/${TOKEN}`), env, 2)).text();
    expect(html).not.toContain('</script><script>alert(1)');
  });
});
