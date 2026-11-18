// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { handle } from '../src/index.js';

const DEVICE = 'd'.repeat(64);

function fakeD1() {
  const rows = new Map();
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    args,
    first: async () => (sql.startsWith('SELECT first_seen FROM devices') && args[0] === DEVICE ? { first_seen: 1 } : null),
    all: async () => ({
      results: [...rows.values()]
        .filter((r) => r.consent === 1 && r.rating >= 4)
        .sort((a, b) => b.updated_at - a.updated_at),
    }),
  });
  return {
    rows,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      for (const s of statements) {
        const [device_id, tenant_id, user_id, rating, tags, comment, consent, sector, app_version, business_name, business_logo, updated_at] = s.args;
        rows.set(`${device_id}|${tenant_id}|${user_id}`, { device_id, tenant_id, user_id, rating, tags, comment, consent, sector, app_version, business_name, business_logo, updated_at });
      }
    },
  };
}

function post(body) {
  return new Request('https://x.workers.dev/api/reviews', { method: 'POST', body: JSON.stringify(body) });
}

const review = (extra = {}) => ({ tenantId: 'local', userId: 3, rating: 5, tags: ['سهولة الاستخدام'], comment: 'ممتاز', consent: true, businessName: 'متجر النور', ...extra });

describe('reviews', () => {
  test('stores a review and replaces it when the same person rates again', async () => {
    const env = { DB: fakeD1() };
    expect(await (await handle(post({ device: DEVICE, reviews: [review()] }), env, 1000)).json()).toEqual({ ok: true, stored: 1 });
    await handle(post({ device: DEVICE, reviews: [review({ rating: 3, consent: false })] }), env, 2000);

    expect(env.DB.rows.size).toBe(1);
    expect([...env.DB.rows.values()][0]).toMatchObject({ rating: 3, consent: 0, business_name: null });
  });

  test('refuses unknown devices and skips invalid ratings', async () => {
    const env = { DB: fakeD1() };
    expect((await handle(post({ device: 'e'.repeat(64), reviews: [review()] }), env)).status).toBe(403);
    expect(await (await handle(post({ device: DEVICE, reviews: [review({ rating: 9 })] }), env)).json()).toEqual({ ok: true, stored: 0 });
  });

  test('keeps a logo only when it is a small data:image with consent', async () => {
    const env = { DB: fakeD1() };
    await handle(post({ device: DEVICE, reviews: [review({ userId: 1, businessLogo: 'data:image/png;base64,AAAA' })] }), env, 1);
    await handle(post({ device: DEVICE, reviews: [review({ userId: 2, businessLogo: 'javascript:alert(1)' })] }), env, 1);
    const logos = [...env.DB.rows.values()].map((r) => r.business_logo);
    expect(logos).toEqual(['data:image/png;base64,AAAA', null]);
  });

  test('the public list has consented 4-5 star reviews only, without device ids', async () => {
    const env = { DB: fakeD1() };
    await handle(post({ device: DEVICE, reviews: [review({ userId: 1 }), review({ userId: 2, consent: false }), review({ userId: 3, rating: 2 })] }), env, 5);

    const res = await handle(new Request('https://x.workers.dev/api/reviews/public'), env);
    const { reviews } = await res.json();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ rating: 5, businessName: 'متجر النور', tags: ['سهولة الاستخدام'] });
    expect(JSON.stringify(reviews)).not.toContain(DEVICE);
  });
});
