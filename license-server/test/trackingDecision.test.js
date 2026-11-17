// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const DEVICE = 'a'.repeat(64);
const KEY = 'c'.repeat(64);
const TOKEN = 'trk_ABCDEFGHIJKLMNOPQ';

// Minimal D1 stand-in for the tracking and decision queries.
function fakeD1() {
  const tracking = new Map();
  const decisions = new Map();
  return {
    prepare(sql) {
      return {
        bind: (...a) => ({
          first: async () => {
            if (sql.includes('FROM devices')) return a[0] === DEVICE ? { first_seen: 1 } : null;
            if (sql.includes('FROM tracking_decisions')) return decisions.get(a[0]) || null;
            if (sql.includes('FROM tracking')) return tracking.get(a[0]) || null;
            return null;
          },
          run: async () => {
            if (sql.startsWith('INSERT INTO tracking ')) tracking.set(a[0], { key_hash: a[1], data: a[2], updated_at: a[3] });
            else if (sql.startsWith('DELETE FROM tracking_decisions')) decisions.delete(a[0]);
            else if (sql.startsWith('DELETE FROM tracking WHERE token')) tracking.delete(a[0]);
            else if (sql.startsWith('INSERT OR IGNORE INTO tracking_decisions')) { if (!decisions.has(a[0])) decisions.set(a[0], { decision: a[1], decided_at: a[2] }); }
            return {};
          },
        }),
      };
    },
  };
}

const req = (path, method, body) => new Request(`https://x.workers.dev${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const owner = (extra = {}) => ({ device: DEVICE, key: KEY, ...extra });
const publish = (env, status) => handle(req(`/api/track/${TOKEN}`, 'PUT', { ...owner(), data: { order: { number: '1', status }, vehicle: {}, shop: {}, lines: [] } }), env, 1);

describe('customer decision on the quote', () => {
  test('the customer approves while the order waits for approval, and the page then shows it', async () => {
    const env = { DB: fakeD1() };
    await publish(env, 'awaiting_approval');

    const page = await (await handle(req(`/t/${TOKEN}`, 'GET'), env, 2)).text();
    expect(page).toContain(`data-decision="/t/${TOKEN}/decision"`);

    const res = await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'approve' }), env, 3);
    expect(await res.json()).toMatchObject({ ok: true, decision: 'approve' });
    const data = await (await handle(req(`/t/${TOKEN}/data`, 'GET'), env, 4)).json();
    expect(data.decision).toBe('approve');
  });

  test('the first answer stands; a later one cannot change it', async () => {
    const env = { DB: fakeD1() };
    await publish(env, 'awaiting_approval');
    await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'decline' }), env, 2);
    const second = await (await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'approve' }), env, 3)).json();
    expect(second.decision).toBe('decline');
  });

  test('refused when the order is not waiting for approval, for a bad answer, or an unknown page', async () => {
    const env = { DB: fakeD1() };
    await publish(env, 'in_progress');
    expect((await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'approve' }), env, 2)).status).toBe(409);
    await publish(env, 'awaiting_approval');
    expect((await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'maybe' }), env, 3)).status).toBe(400);
    expect((await handle(req('/t/unknown_token_value_x/decision', 'POST', { decision: 'approve' }), env, 3)).status).toBe(404);
  });

  test('the workshop reads the answer with its key and confirms it, and nobody else can', async () => {
    const env = { DB: fakeD1() };
    await publish(env, 'awaiting_approval');
    await handle(req(`/t/${TOKEN}/decision`, 'POST', { decision: 'approve' }), env, 2);

    expect((await handle(req(`/api/track/${TOKEN}/decision`, 'POST', owner({ key: 'd'.repeat(64) })), env, 3)).status).toBe(403);
    expect(await (await handle(req(`/api/track/${TOKEN}/decision`, 'POST', owner()), env, 3)).json()).toMatchObject({ decision: 'approve' });
    expect(await (await handle(req(`/api/track/${TOKEN}/decision`, 'POST', owner()), env, 4)).json()).toMatchObject({ decision: 'approve' }); // still there until confirmed
    await handle(req(`/api/track/${TOKEN}/decision`, 'POST', owner({ consume: true })), env, 5);
    expect(await (await handle(req(`/api/track/${TOKEN}/decision`, 'POST', owner()), env, 6)).json()).toMatchObject({ decision: null });
  });
});

describe('revoking a link', () => {
  test('the owner deletes the page, and the old address stops working', async () => {
    const env = { DB: fakeD1() };
    await publish(env, 'in_progress');
    expect((await handle(req(`/t/${TOKEN}`, 'GET'), env, 2)).status).toBe(200);
    expect((await handle(req(`/api/track/${TOKEN}`, 'DELETE', owner({ key: 'd'.repeat(64) })), env, 3)).status).toBe(403);
    expect((await handle(req(`/api/track/${TOKEN}`, 'DELETE', owner()), env, 3)).status).toBe(200);
    expect((await handle(req(`/t/${TOKEN}`, 'GET'), env, 4)).status).toBe(404);
    expect((await handle(req(`/t/${TOKEN}/data`, 'GET'), env, 4)).status).toBe(404);
  });
});
