// foxcloud license time server (Cloudflare Worker).
//
// GET /api/license/time?device=<64 hex>&nonce=<32 hex>
//   -> { utc, trialStart, sig }
//
// trialStart is the first time this machine ever asked (kept in D1), so wiping
// the app does not start a new trial. A new machine that shows up from an address (hashed)
// that started a trial in the last 30 days inherits that earlier start: reinstalling Windows or
// changing the device id from the same shop does not buy a fresh trial. sig is an Ed25519 signature over
// `foxcloud-time-v1:${utc}|${device}|${nonce}|${trialStart}`; the app checks it
// with the public key it ships, so a fake local server or a replayed answer
// (the nonce is fresh per request) is rejected.
//
//
// Customer car tracking (public page, no account):
//   PUT /api/track/<token>   body { device, key, data }  -> the desktop app publishes a snapshot of one work order.
//        The first write binds the token to sha256(key); later writes must present the same key.
//        The device must already be known (it asked for the time at least once), which keeps strangers from filling D1.
//   GET /t/<token>           -> the page the customer opens (QR/link on the check-in receipt)
//   GET /t/<token>/data      -> latest snapshot as JSON (the page polls it)
//
// Delivery-app orders inbox (the desktop cannot be reached from the internet, so this holds the orders until it asks):
//   POST /d/<token>                 public webhook an app / integrator posts an order JSON to (<= 64 KB)
//   PUT  /api/inbox/<token>         the desktop registers its inbox (device + key, like the tracking pages)
//   POST /api/inbox/<token>/pull    the desktop takes the waiting orders  { device, key }
//   POST /api/inbox/<token>/ack     the desktop confirms what it saved   { device, key, ids }
//
// Secret: TIME_SIGNING_KEY = base64 PKCS#8 Ed25519 private key
// (node scripts/time-server-init.js --print-secret | npx wrangler secret put TIME_SIGNING_KEY).

import trackingPage from '../../shared/trackingPage.js';

const DEVICE_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,40}$/;
const KEY_PATTERN = /^[0-9a-f]{32,128}$/;
const MAX_TRACK_BYTES = 1_500_000;
// shortcut: shared addresses (mobile carriers, CGNAT) can make an honest new shop inherit a stranger's trial;
// clear the table to reset: wrangler d1 execute foxcloud-license --remote --command "DELETE FROM trial_ips".
const IP_WINDOW_MS = 30 * 24 * 3600 * 1000;
const MAX_INBOX_BYTES = 64_000;
const MAX_INBOX_WAITING = 500;
const KEEP_INBOX_MS = 7 * 24 * 3600 * 1000;
const KEEP_TRACK_MS = 90 * 24 * 3600 * 1000;

let signingKey = null;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function base64ToBytes(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function getSigningKey(env) {
  if (!signingKey) {
    signingKey = await crypto.subtle.importKey(
      'pkcs8',
      base64ToBytes(env.TIME_SIGNING_KEY),
      { name: 'Ed25519' },
      false,
      ['sign']
    );
  }
  return signingKey;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function notFoundPage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px Tahoma,sans-serif;text-align:center;padding:60px 20px;background:#FFF6EA;color:#2A1D14" dir="rtl"><h2>الرابط غير صحيح أو انتهت صلاحيته</h2><p>تواصل مع الورشة للحصول على رابط جديد.</p>',
    { status: 404, headers: PAGE_HEADERS }
  );
}

async function publishTracking(request, env, token, now) {
  const raw = await request.text();
  if (raw.length > MAX_TRACK_BYTES) return json({ error: 'too large' }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { device, key, data } = body || {};
  if (!DEVICE_PATTERN.test(String(device)) || !KEY_PATTERN.test(String(key)) || !data || typeof data !== 'object' || !data.order?.number) {
    return json({ error: 'device, key and data are required' }, 400);
  }
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(device).first();
  if (!known) return json({ error: 'unknown device' }, 403);

  const keyHash = await sha256Hex(key);
  const existing = await env.DB.prepare('SELECT key_hash FROM tracking WHERE token = ?').bind(token).first();
  if (existing && existing.key_hash !== keyHash) return json({ error: 'forbidden' }, 403);

  data.updated_at = String(now);
  await env.DB.prepare(
    'INSERT INTO tracking (token, key_hash, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(token, keyHash, JSON.stringify(data), now).run();
  await env.DB.prepare('DELETE FROM tracking WHERE updated_at < ?').bind(now - KEEP_TRACK_MS).run();
  return json({ ok: true });
}

// The desktop proves it owns an inbox the same way it owns a tracking page: its device is known and it holds the key.
async function inboxOwner(env, token, body) {
  if (!DEVICE_PATTERN.test(String(body?.device)) || !KEY_PATTERN.test(String(body?.key))) return json({ error: 'device and key are required' }, 400);
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(body.device).first();
  if (!known) return json({ error: 'unknown device' }, 403);
  const owner = await env.DB.prepare('SELECT key_hash FROM inbox_owners WHERE token = ?').bind(token).first();
  return { owner, keyHash: await sha256Hex(body.key) };
}

async function inboxRoutes(request, env, url, now) {
  const hook = url.pathname.match(/^\/d\/([^/]+)$/);
  if (hook && request.method === 'POST') {
    if (!TOKEN_PATTERN.test(hook[1])) return json({ error: 'not found' }, 404);
    const raw = await request.text();
    if (raw.length > MAX_INBOX_BYTES) return json({ error: 'too large' }, 413);
    try { JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
    const owner = await env.DB.prepare('SELECT key_hash FROM inbox_owners WHERE token = ?').bind(hook[1]).first();
    if (!owner) return json({ error: 'not found' }, 404);
    const waiting = await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox WHERE token = ?').bind(hook[1]).first();
    if (Number(waiting?.n) >= MAX_INBOX_WAITING) return json({ error: 'inbox full' }, 429);
    await env.DB.prepare('INSERT INTO inbox (token, payload, created_at) VALUES (?, ?, ?)').bind(hook[1], raw, now).run();
    await env.DB.prepare('DELETE FROM inbox WHERE created_at < ?').bind(now - KEEP_INBOX_MS).run();
    return json({ ok: true });
  }

  const api = url.pathname.match(/^\/api\/inbox\/([^/]+)(\/pull|\/ack)?$/);
  if (!api) return null;
  const token = api[1];
  if (!TOKEN_PATTERN.test(token)) return json({ error: 'bad token' }, 400);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  const checked = await inboxOwner(env, token, body);
  if (checked instanceof Response) return checked;
  const { owner, keyHash } = checked;

  if (!api[2] && request.method === 'PUT') {
    if (owner && owner.key_hash !== keyHash) return json({ error: 'forbidden' }, 403);
    if (!owner) await env.DB.prepare('INSERT INTO inbox_owners (token, key_hash, created_at) VALUES (?, ?, ?)').bind(token, keyHash, now).run();
    return json({ ok: true });
  }
  if (!owner || owner.key_hash !== keyHash) return json({ error: 'forbidden' }, 403);
  if (api[2] === '/pull' && request.method === 'POST') {
    const rows = await env.DB.prepare('SELECT id, payload FROM inbox WHERE token = ? ORDER BY id LIMIT 50').bind(token).all();
    return json({ items: (rows.results || []).map((r) => ({ id: r.id, payload: r.payload })) });
  }
  if (api[2] === '/ack' && request.method === 'POST') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isSafeInteger).slice(0, 50);
    for (const id of ids) await env.DB.prepare('DELETE FROM inbox WHERE token = ? AND id = ?').bind(token, id).run();
    return json({ ok: true, acked: ids.length });
  }
  return json({ error: 'not found' }, 404);
}

// The customer's answer to a quote, kept apart from the snapshot so republishing never erases it.
async function decisionFor(env, token) {
  const row = await env.DB.prepare('SELECT decision, decided_at FROM tracking_decisions WHERE token = ?').bind(token).first();
  return row || null;
}

async function trackingOwner(env, token, body) {
  if (!DEVICE_PATTERN.test(String(body?.device)) || !KEY_PATTERN.test(String(body?.key))) return json({ error: 'device and key are required' }, 400);
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(body.device).first();
  if (!known) return json({ error: 'unknown device' }, 403);
  const row = await env.DB.prepare('SELECT key_hash FROM tracking WHERE token = ?').bind(token).first();
  if (!row || row.key_hash !== (await sha256Hex(body.key))) return json({ error: 'forbidden' }, 403);
  return null;
}

async function trackingRoutes(request, env, url, now) {
  // the workshop revokes a link, or reads (and confirms) what the customer answered
  const owned = url.pathname.match(/^\/api\/track\/([^/]+)(\/decision)?$/);
  if (owned && ((owned[2] && request.method === 'POST') || (!owned[2] && request.method === 'DELETE'))) {
    if (!TOKEN_PATTERN.test(owned[1])) return json({ error: 'bad token' }, 400);
    let body;
    try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
    const denied = await trackingOwner(env, owned[1], body);
    if (denied) return denied;
    if (!owned[2]) {
      await env.DB.prepare('DELETE FROM tracking WHERE token = ?').bind(owned[1]).run();
      await env.DB.prepare('DELETE FROM tracking_decisions WHERE token = ?').bind(owned[1]).run();
      return json({ ok: true });
    }
    const decision = await decisionFor(env, owned[1]);
    if (decision && body.consume) await env.DB.prepare('DELETE FROM tracking_decisions WHERE token = ?').bind(owned[1]).run();
    return json({ decision: decision?.decision || null, decided_at: decision?.decided_at || null });
  }

  const answer = url.pathname.match(/^\/t\/([^/]+)\/decision$/);
  if (answer && request.method === 'POST') {
    if (!TOKEN_PATTERN.test(answer[1])) return json({ error: 'not found' }, 404);
    let body;
    try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
    if (!['approve', 'decline'].includes(body?.decision)) return json({ error: 'bad decision' }, 400);
    const row = await env.DB.prepare('SELECT data FROM tracking WHERE token = ?').bind(answer[1]).first();
    if (!row) return json({ error: 'not found' }, 404);
    // only while the workshop is really waiting for the answer
    if (JSON.parse(row.data).order?.status !== 'awaiting_approval') return json({ error: 'not waiting for approval' }, 409);
    await env.DB.prepare('INSERT OR IGNORE INTO tracking_decisions (token, decision, decided_at) VALUES (?, ?, ?)').bind(answer[1], body.decision, now).run();
    const saved = await decisionFor(env, answer[1]);
    return json({ ok: true, decision: saved?.decision || body.decision });
  }

  const put = url.pathname.match(/^\/api\/track\/([^/]+)$/);
  if (put && request.method === 'PUT') {
    if (!TOKEN_PATTERN.test(put[1])) return json({ error: 'bad token' }, 400);
    return publishTracking(request, env, put[1], now);
  }
  const page = url.pathname.match(/^\/t\/([^/]+)(\/data)?$/);
  if (page && request.method === 'GET') {
    if (!TOKEN_PATTERN.test(page[1])) return notFoundPage();
    const row = await env.DB.prepare('SELECT data FROM tracking WHERE token = ?').bind(page[1]).first();
    if (!row) return page[2] ? json({ error: 'not found' }, 404) : notFoundPage();
    const data = JSON.parse(row.data);
    const decision = await decisionFor(env, page[1]);
    if (decision) data.decision = decision.decision;
    if (page[2]) return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    return new Response(trackingPage.renderTrackingHtml(data, { pollUrl: `/t/${page[1]}/data`, decisionUrl: `/t/${page[1]}/decision` }), { headers: PAGE_HEADERS });
  }
  return null;
}

// IPv4 as is; IPv6 cut to its /64 (the address changes inside it all the time).
function ipGroup(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  return [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b].slice(0, 4).join(':');
}

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const tracked = await trackingRoutes(request, env, url, now);
  if (tracked) return tracked;
  const inbox = await inboxRoutes(request, env, url, now);
  if (inbox) return inbox;
  if (url.pathname !== '/api/license/time' || request.method !== 'GET') {
    return json({ error: 'not found' }, 404);
  }

  const device = url.searchParams.get('device') || '';
  const nonce = url.searchParams.get('nonce') || '';
  if (!DEVICE_PATTERN.test(device) || !NONCE_PATTERN.test(nonce)) {
    return json({ error: 'device and nonce are required' }, 400);
  }

  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO devices (device_id, first_seen) VALUES (?, ?)')
    .bind(device, now)
    .run();
  const row = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?')
    .bind(device)
    .first();

  const utc = new Date(now).toISOString();
  let trialStart = Number(row.first_seen);

  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) {
    const ipHash = await sha256Hex(`ip|${env.TIME_SIGNING_KEY}|${ipGroup(ip)}`);
    const seen = await env.DB.prepare('SELECT first_seen FROM trial_ips WHERE ip_hash = ?').bind(ipHash).first();
    const recent = seen && now - Number(seen.first_seen) < IP_WINDOW_MS;
    if (recent && Number(seen.first_seen) < trialStart) {
      trialStart = Number(seen.first_seen);
      await env.DB.prepare('UPDATE devices SET first_seen = ? WHERE device_id = ?').bind(trialStart, device).run();
    }
    // Only a brand-new machine (re)starts the address's clock, so a shop's own pings never push it forward.
    if (inserted?.meta?.changes === 1 && !recent) {
      await env.DB.prepare('INSERT OR REPLACE INTO trial_ips (ip_hash, first_seen) VALUES (?, ?)').bind(ipHash, now).run();
    }
  }
  const message = new TextEncoder().encode(`foxcloud-time-v1:${utc}|${device}|${nonce}|${trialStart}`);
  const sig = bytesToBase64(await crypto.subtle.sign({ name: 'Ed25519' }, await getSigningKey(env), message));

  return json({ utc, trialStart, sig });
}

export default {
  fetch: (request, env) => handle(request, env),
};
