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

async function trackingRoutes(request, env, url, now) {
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
    if (page[2]) return new Response(row.data, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    return new Response(trackingPage.renderTrackingHtml(JSON.parse(row.data), { pollUrl: `/t/${page[1]}/data` }), { headers: PAGE_HEADERS });
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
