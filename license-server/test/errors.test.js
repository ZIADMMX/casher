// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const DEVICE = 'd'.repeat(64);

function fakeD1() {
  const devices = new Set([DEVICE]);
  const reports = [];
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    sql,
    args,
    first: async () => {
      if (sql.startsWith('SELECT first_seen FROM devices')) return devices.has(args[0]) ? { first_seen: 1 } : null;
      if (sql.startsWith('SELECT COUNT(*) AS n FROM error_reports')) {
        return { n: reports.filter((r) => r.device_id === args[0] && r.created_at > args[1]).length };
      }
      return null;
    },
    run: async () => {
      if (sql.startsWith('DELETE FROM error_reports')) {
        for (let i = reports.length - 1; i >= 0; i--) if (reports[i].created_at < args[0]) reports.splice(i, 1);
      }
      return { meta: { changes: 1 } };
    },
  });
  return {
    reports,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      for (const s of statements) {
        const [device_id, version, context, message, stack, count, created_at] = s.args;
        reports.push({ device_id, version, context, message, stack, count, created_at });
      }
    },
  };
}

function post(body) {
  return new Request('https://x.workers.dev/api/errors', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/errors', () => {
  test('stores the reports of a known device', async () => {
    const env = { DB: fakeD1() };
    const res = await handle(post({
      device: DEVICE,
      version: '1.0.4',
      items: [{ context: 'SalesService', message: 'boom', stack: 'Error: boom\n at x', count: 3 }],
    }), env, 1_000_000);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: 1 });
    expect(env.DB.reports[0]).toMatchObject({ device_id: DEVICE, version: '1.0.4', context: 'SalesService', message: 'boom', count: 3 });
  });

  test('refuses devices that never asked for the time', async () => {
    const res = await handle(post({ device: 'e'.repeat(64), items: [{ context: 'x' }] }), { DB: fakeD1() });
    expect(res.status).toBe(403);
  });

  test('refuses bad input', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(post('not json'), env)).status).toBe(400);
    expect((await handle(post({ device: 'short', items: [] }), env)).status).toBe(400);
    expect((await handle(post({ device: DEVICE, items: [{ message: 'x'.repeat(40_000) }] }), env)).status).toBe(413);
  });

  test('caps each device per hour', async () => {
    const env = { DB: fakeD1() };
    const items = Array.from({ length: 20 }, (_, i) => ({ context: `c${i}`, message: 'm' }));
    for (let i = 0; i < 10; i++) await handle(post({ device: DEVICE, items }), env, 5_000_000);
    expect(env.DB.reports).toHaveLength(200);
    expect((await handle(post({ device: DEVICE, items }), env, 5_000_000)).status).toBe(429);
  });

  test('drops reports older than 30 days', async () => {
    const env = { DB: fakeD1() };
    await handle(post({ device: DEVICE, items: [{ context: 'old' }] }), env, 1);
    await handle(post({ device: DEVICE, items: [{ context: 'new' }] }), env, 31 * 24 * 3600 * 1000);
    expect(env.DB.reports.map((r) => r.context)).toEqual(['new']);
  });
});
