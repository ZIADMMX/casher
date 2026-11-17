// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const DEVICE = 'a'.repeat(64);
const KEY = 'c'.repeat(64);
const TOKEN = 'inbox_ABCDEFGHIJKLMNOP';

// Minimal D1 stand-in for the inbox queries.
function fakeD1() {
  const owners = new Map();
  const inbox = [];
  let nextId = 1;
  return {
    inbox,
    prepare(sql) {
      return {
        bind: (...a) => ({
          first: async () => {
            if (sql.includes('FROM devices')) return a[0] === DEVICE ? { first_seen: 1 } : null;
            if (sql.includes('FROM inbox_owners')) return owners.has(a[0]) ? { key_hash: owners.get(a[0]) } : null;
            if (sql.includes('COUNT(*)')) return { n: inbox.filter((r) => r.token === a[0]).length };
            return null;
          },
          all: async () => ({ results: inbox.filter((r) => r.token === a[0]).slice(0, 50).map((r) => ({ id: r.id, payload: r.payload })) }),
          run: async () => {
            if (sql.startsWith('INSERT INTO inbox_owners')) owners.set(a[0], a[1]);
            else if (sql.startsWith('INSERT INTO inbox ')) inbox.push({ id: nextId++, token: a[0], payload: a[1], created_at: a[2] });
            else if (sql.startsWith('DELETE FROM inbox WHERE token')) {
              const i = inbox.findIndex((r) => r.token === a[0] && r.id === a[1]);
              if (i >= 0) inbox.splice(i, 1);
            }
            return {};
          },
        }),
      };
    },
  };
}

const post = (path, body, method = 'POST') => new Request(`https://x.workers.dev${path}`, { method, body: typeof body === 'string' ? body : JSON.stringify(body) });
const owner = (extra = {}) => ({ device: DEVICE, key: KEY, ...extra });

describe('delivery orders inbox', () => {
  test('a registered inbox collects public posts and hands them to its owner, who confirms them', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(post(`/api/inbox/${TOKEN}`, owner(), 'PUT'), env, 1)).status).toBe(200);

    expect((await handle(post(`/d/${TOKEN}`, { id: 'A1', items: [] }), env, 2)).status).toBe(200);
    expect((await handle(post(`/d/${TOKEN}`, { id: 'A2', items: [] }), env, 3)).status).toBe(200);

    const pulled = await (await handle(post(`/api/inbox/${TOKEN}/pull`, owner()), env, 4)).json();
    expect(pulled.items.map((i) => JSON.parse(i.payload).id)).toEqual(['A1', 'A2']);

    await handle(post(`/api/inbox/${TOKEN}/ack`, owner({ ids: [pulled.items[0].id] })), env, 5);
    const again = await (await handle(post(`/api/inbox/${TOKEN}/pull`, owner()), env, 6)).json();
    expect(again.items.map((i) => JSON.parse(i.payload).id)).toEqual(['A2']);
  });

  test('posting to an unregistered or malformed address is refused', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(post(`/d/${TOKEN}`, { id: 1 }), env, 1)).status).toBe(404);
    expect((await handle(post('/d/short', { id: 1 }), env, 1)).status).toBe(404);
  });

  test('bad or oversized bodies are refused', async () => {
    const env = { DB: fakeD1() };
    await handle(post(`/api/inbox/${TOKEN}`, owner(), 'PUT'), env, 1);
    expect((await handle(post(`/d/${TOKEN}`, 'not json'), env, 2)).status).toBe(400);
    expect((await handle(post(`/d/${TOKEN}`, JSON.stringify({ blob: 'x'.repeat(70_000) })), env, 2)).status).toBe(413);
  });

  test('only the key that registered the inbox can read or confirm it', async () => {
    const env = { DB: fakeD1() };
    await handle(post(`/api/inbox/${TOKEN}`, owner(), 'PUT'), env, 1);
    await handle(post(`/d/${TOKEN}`, { id: 1 }), env, 2);
    const other = owner({ key: 'd'.repeat(64) });
    expect((await handle(post(`/api/inbox/${TOKEN}/pull`, other), env, 3)).status).toBe(403);
    expect((await handle(post(`/api/inbox/${TOKEN}`, other, 'PUT'), env, 3)).status).toBe(403);
    expect((await handle(post(`/api/inbox/${TOKEN}/ack`, { ...other, ids: [1] }), env, 3)).status).toBe(403);
  });

  test('an unknown device cannot register an inbox', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(post(`/api/inbox/${TOKEN}`, { device: 'b'.repeat(64), key: KEY }, 'PUT'), env, 1)).status).toBe(403);
  });
});
