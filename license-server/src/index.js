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

// Public half of the vendor's Ed25519 licence signing key, the same one the desktop ships
// (electron/security/license-public-key.js). It verifies licence keys, it cannot mint them.
const LICENSE_PUBLIC_KEY = 'MCowBQYDK2VwAyEA8Gr3qbGT4lKKbU3nsqmOin2uCMF5HaJGt4qfPtX/Q4k=';
const LICENSE_PREFIX = 'FOX1';
const LICENSE_DOMAIN = new TextEncoder().encode('foxcloud-license-v1:');
const LICENSE_PAYLOAD_BYTES = 9; // version (1) + HWID (4) + expiry seconds (4)
const LICENSE_SIGNATURE_BYTES = 64;
// Crockford base32, as the desktop encodes keys (O reads as 0, I and L as 1).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of text) {
    let digit = CROCKFORD.indexOf(ch);
    if (digit < 0) digit = ch === 'O' ? 0 : (ch === 'I' || ch === 'L') ? 1 : -1;
    if (digit < 0) return null;
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

// Customer rows carry names, phones and emails, so the caller proves it owns the device's
// store: with the licence key the vendor signed for that machine, or, before activation, with
// a key of its own that claims the device on first sync. Every copy backs its customers up,
// activated or not. Expiry is deliberately not checked — a shop whose licence ran out must
// still be able to pull its own customers back. The key travels in a header, never in the URL.
// Returns an error Response, or null when the caller may proceed.
async function customerSyncOwner(request, env, device) {
  if (!device || !DEVICE_PATTERN.test(device)) return json({ error: 'invalid device id' }, 400);

  const raw = (request.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '').trim().toUpperCase().replace(/[\s-]/g, '');

  const licensed = raw.startsWith(LICENSE_PREFIX);
  if (licensed) {
    const bytes = base32Decode(raw.slice(LICENSE_PREFIX.length));
    if (!bytes || bytes.length !== LICENSE_PAYLOAD_BYTES + LICENSE_SIGNATURE_BYTES || bytes[0] !== 1) {
      return json({ error: 'malformed licence key' }, 401);
    }
    const payload = bytes.subarray(0, LICENSE_PAYLOAD_BYTES);
    const signature = bytes.subarray(LICENSE_PAYLOAD_BYTES);

    // A licence is bound to the HWID: the first 4 bytes of the device id.
    const hwid = [...payload.subarray(1, 5)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hwid !== device.slice(0, 8)) return json({ error: 'licence is for another device' }, 403);

    const verifier = await crypto.subtle.importKey(
      'spki', base64ToBytes(env.LICENSE_PUBLIC_KEY || LICENSE_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']
    );
    const message = new Uint8Array([...LICENSE_DOMAIN, ...payload]);
    if (!(await crypto.subtle.verify({ name: 'Ed25519' }, verifier, signature, message))) {
      return json({ error: 'invalid licence signature' }, 403);
    }
  } else if (!KEY_PATTERN.test(raw.toLowerCase())) {
    return json({ error: 'sync key required' }, 401);
  }

  // Registering happens at /api/license/time, which every copy calls. Doing it here instead
  // would let a sync start a stranger's trial clock.
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(device).first();
  if (!known) return json({ error: 'unknown device' }, 403);

  // Two ways to own a store. A licence is proof: it is signed for this machine and nobody
  // else can produce it, so it always takes the device over. A trial copy has no licence, so
  // it claims the device with a key of its own on first sync and must keep presenting it.
  // The claim is not a lock-out: the moment the shop activates, its licence overrides whoever
  // claimed the device.
  const keyHash = await sha256Hex(raw);
  const owner = await env.DB.prepare('SELECT key_hash FROM customer_sync_owners WHERE device_id = ?').bind(device).first();
  if (licensed) {
    if (!owner || owner.key_hash !== keyHash) {
      await env.DB.prepare(
        'INSERT INTO customer_sync_owners (device_id, key_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET key_hash = excluded.key_hash'
      ).bind(device, keyHash, Date.now()).run();
    }
    return null;
  }
  if (owner) return owner.key_hash === keyHash ? null : json({ error: 'forbidden' }, 403);
  await env.DB.prepare('INSERT OR IGNORE INTO customer_sync_owners (device_id, key_hash, created_at) VALUES (?, ?, ?)')
    .bind(device, keyHash, Date.now()).run();
  return null;
}

async function customerSyncRoutes(request, env, url, now) {
  if (url.pathname !== '/api/sync/customers') return null;

  // POST: Push customers to cloud
  if (request.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ error: 'bad json' }, 400);
    }

    const { device, customers } = body || {};
    const denied = await customerSyncOwner(request, env, device);
    if (denied) return denied;
    if (!Array.isArray(customers) || customers.length === 0) {
      return json({ success: true, count: 0, syncedAt: now });
    }

    const batch = customers.slice(0, 500);
    const statements = batch.map((c) => {
      const uuid = String(c.uuid || c.sync_uuid || '').trim();
      const name = String(c.name || 'عميل').slice(0, 150);
      const phone = c.phone ? String(c.phone).slice(0, 50) : null;
      const email = c.email ? String(c.email).slice(0, 150) : null;
      const loyalty = Number(c.loyalty_points) || 0;
      const active = c.is_active === 0 ? 0 : 1;
      const tier = c.tier ? String(c.tier).slice(0, 50) : null;
      const rating = Number(c.rating) || 5;
      const extraJson = c.extra_json ? String(c.extra_json) : null;
      const updatedAt = Number(c.updated_at) || now;

      return env.DB.prepare(`
        INSERT INTO cloud_customers (
          uuid, device_id, name, phone, email, loyalty_points, is_active, tier, rating, extra_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id, uuid) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          email = excluded.email,
          loyalty_points = excluded.loyalty_points,
          is_active = excluded.is_active,
          tier = excluded.tier,
          rating = excluded.rating,
          extra_json = excluded.extra_json,
          updated_at = excluded.updated_at
      `).bind(uuid, device, name, phone, email, loyalty, active, tier, rating, extraJson, updatedAt);
    });

    await env.DB.batch(statements);
    return json({ success: true, count: statements.length, syncedAt: now });
  }

  // GET: Pull customers from cloud
  if (request.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    const denied = await customerSyncOwner(request, env, device);
    if (denied) return denied;
    const since = Number(url.searchParams.get('since')) || 0;

    const { results } = await env.DB.prepare(`
      SELECT uuid, name, phone, email, loyalty_points, is_active, tier, rating, extra_json, updated_at
      FROM cloud_customers
      WHERE device_id = ? AND updated_at >= ?
      ORDER BY updated_at ASC
      LIMIT 1000
    `).bind(device, since).all();

    return json({ success: true, customers: results || [], syncedAt: now });
  }

  return json({ error: 'method not allowed' }, 405);
}

async function subscriptionRoutes(request, env, url, now) {
  if (url.pathname !== '/api/sync/subscription') return null;

  if (request.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ error: 'bad json' }, 400);
    }

    const {
      device, hwid, store_name, owner_name, phone, business_type,
      plan_type, license_key, activated_at, expires_at, certificate_number, certificate_data
    } = body || {};

    const denied = await customerSyncOwner(request, env, device);
    if (denied) return denied;

    await env.DB.prepare(`
      INSERT INTO cloud_subscriptions (
        device_id, hwid, store_name, owner_name, phone, business_type,
        plan_type, license_key, activated_at, expires_at, certificate_number, certificate_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        hwid = excluded.hwid,
        store_name = excluded.store_name,
        owner_name = excluded.owner_name,
        phone = excluded.phone,
        business_type = excluded.business_type,
        plan_type = excluded.plan_type,
        license_key = excluded.license_key,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at,
        certificate_number = excluded.certificate_number,
        certificate_data = excluded.certificate_data,
        updated_at = excluded.updated_at
    `).bind(
      device,
      String(hwid || device.slice(0, 8)).toUpperCase(),
      String(store_name || 'متجر جديد').slice(0, 150),
      owner_name ? String(owner_name).slice(0, 150) : null,
      phone ? String(phone).slice(0, 50) : null,
      business_type ? String(business_type).slice(0, 50) : null,
      String(plan_type || 'lifetime'),
      license_key ? String(license_key).slice(0, 200) : null,
      Number(activated_at) || now,
      expires_at ? Number(expires_at) : null,
      certificate_number ? String(certificate_number).slice(0, 100) : null,
      certificate_data ? (typeof certificate_data === 'string' ? certificate_data : JSON.stringify(certificate_data)) : null,
      now
    ).run();

    return json({ success: true, message: 'تم حفظ وتوثيق شهادة الترخيص في السحابة بنجاح', syncedAt: now });
  }

  if (request.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    const certNum = url.searchParams.get('cert') || '';

    let row;
    if (certNum) {
      row = await env.DB.prepare('SELECT * FROM cloud_subscriptions WHERE certificate_number = ?').bind(certNum).first();
    } else if (device) {
      const denied = await customerSyncOwner(request, env, device);
      if (denied) return denied;
      row = await env.DB.prepare('SELECT * FROM cloud_subscriptions WHERE device_id = ?').bind(device).first();
    }

    if (!row) {
      return json({ success: false, error: 'الشهادة أو الاشتراك غير موجود' }, 404);
    }

    return json({ success: true, subscription: row });
  }

  return json({ error: 'method not allowed' }, 405);
}

// Error reports from installed copies, so a crash reaches the vendor before the shop calls.
//   POST /api/errors   body { device, version, items: [{ context, message, stack, count, at }] }
// The device must already be known (it asked for the time), the body is capped, and each device
// gets at most MAX_ERRORS_PER_HOUR rows an hour. Rows older than KEEP_ERRORS_MS are dropped.
// Read them: npx wrangler d1 execute foxcloud-license --remote --command
//   "SELECT substr(device_id,1,8) AS hwid, version, context, message, count, datetime(created_at/1000,'unixepoch') AS at FROM error_reports ORDER BY id DESC LIMIT 50"
const MAX_ERROR_BYTES = 32_000;
const MAX_ERROR_ITEMS = 20;
const MAX_ERRORS_PER_HOUR = 200;
const KEEP_ERRORS_MS = 30 * 24 * 3600 * 1000;

async function errorRoutes(request, env, url, now) {
  if (url.pathname !== '/api/errors') return null;
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const raw = await request.text();
  if (raw.length > MAX_ERROR_BYTES) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }

  const device = String(body?.device || '');
  if (!DEVICE_PATTERN.test(device)) return json({ error: 'device is required' }, 400);
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(device).first();
  if (!known) return json({ error: 'unknown device' }, 403);

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ERROR_ITEMS) : [];
  if (items.length === 0) return json({ ok: true, stored: 0 });

  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM error_reports WHERE device_id = ? AND created_at > ?')
    .bind(device, now - 3600 * 1000).first();
  const room = MAX_ERRORS_PER_HOUR - Number(recent?.n || 0);
  if (room <= 0) return json({ error: 'rate limited' }, 429);

  const version = String(body.version || '').slice(0, 32);
  const insert = env.DB.prepare(
    'INSERT INTO error_reports (device_id, version, context, message, stack, count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const rows = items.slice(0, room).map((item) => insert.bind(
    device,
    version,
    String(item?.context || 'unknown').slice(0, 120),
    String(item?.message || '').slice(0, 1000),
    String(item?.stack || '').slice(0, 6000),
    Math.max(1, Math.min(Number(item?.count) || 1, 100000)),
    now,
  ));
  await env.DB.batch(rows);
  await env.DB.prepare('DELETE FROM error_reports WHERE created_at < ?').bind(now - KEEP_ERRORS_MS).run();
  return json({ ok: true, stored: rows.length });
}

// "Rate Fox" reviews from installed copies.
//   POST /api/reviews          body { device, reviews: [{ tenantId, userId, rating, tags, comment, consent,
//                                     sector, appVersion, businessName, businessLogo }] }
//        One row per (device, tenant, user): a new review from the same person replaces the old one.
//        The device must already be known. Business name and logo are kept only with consent and rating >= 4.
//   GET  /api/reviews/public   consented 4-5 star reviews for the website (no device ids), newest first.
// Read all: npx wrangler d1 execute foxcloud-license --remote --command
//   "SELECT substr(device_id,1,8) AS hwid, rating, tags, comment, consent, business_name, sector, app_version, datetime(updated_at/1000,'unixepoch') AS at FROM fox_reviews ORDER BY updated_at DESC"
const MAX_REVIEW_BYTES = 1_000_000;
const MAX_REVIEWS_PER_REQUEST = 20;
const MAX_LOGO_CHARS = 400_000;
const LOGO_PATTERN = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

async function reviewRoutes(request, env, url, now) {
  if (url.pathname === '/api/reviews/public' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT rating, tags, comment, business_name, business_logo, sector, updated_at FROM fox_reviews '
      + 'WHERE consent = 1 AND rating >= 4 ORDER BY updated_at DESC LIMIT 50'
    ).all();
    const reviews = (rows?.results || []).map((row) => ({
      rating: row.rating,
      tags: safeJsonArray(row.tags),
      comment: row.comment,
      businessName: row.business_name,
      businessLogo: row.business_logo,
      sector: row.sector,
      updatedAt: row.updated_at,
    }));
    return new Response(JSON.stringify({ reviews }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (url.pathname !== '/api/reviews') return null;
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);

  const raw = await request.text();
  if (raw.length > MAX_REVIEW_BYTES) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }

  const device = String(body?.device || '');
  if (!DEVICE_PATTERN.test(device)) return json({ error: 'device is required' }, 400);
  const known = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?').bind(device).first();
  if (!known) return json({ error: 'unknown device' }, 403);

  const incoming = Array.isArray(body.reviews) ? body.reviews.slice(0, MAX_REVIEWS_PER_REQUEST) : [];
  const upsert = env.DB.prepare(
    'INSERT INTO fox_reviews (device_id, tenant_id, user_id, rating, tags, comment, consent, sector, app_version, '
    + 'business_name, business_logo, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
    + 'ON CONFLICT(device_id, tenant_id, user_id) DO UPDATE SET rating = excluded.rating, tags = excluded.tags, '
    + 'comment = excluded.comment, consent = excluded.consent, sector = excluded.sector, app_version = excluded.app_version, '
    + 'business_name = excluded.business_name, business_logo = excluded.business_logo, updated_at = excluded.updated_at'
  );
  const statements = [];
  for (const review of incoming) {
    const rating = Number(review?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    const consent = review.consent === true && rating >= 4;
    const tags = Array.isArray(review.tags) ? review.tags.slice(0, 10).map((tag) => String(tag).slice(0, 60)) : [];
    const logo = consent && typeof review.businessLogo === 'string'
      && review.businessLogo.length <= MAX_LOGO_CHARS && LOGO_PATTERN.test(review.businessLogo)
      ? review.businessLogo : null;
    statements.push(upsert.bind(
      device,
      String(review.tenantId ?? 'local').slice(0, 60),
      String(review.userId ?? '').slice(0, 60),
      rating,
      JSON.stringify(tags),
      review.comment ? String(review.comment).slice(0, 2000) : null,
      consent ? 1 : 0,
      review.sector ? String(review.sector).slice(0, 60) : null,
      review.appVersion ? String(review.appVersion).slice(0, 32) : null,
      consent && review.businessName ? String(review.businessName).slice(0, 150) : null,
      logo,
      now,
    ));
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, stored: statements.length });
}

function safeJsonArray(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const tracked = await trackingRoutes(request, env, url, now);
  if (tracked) return tracked;
  const inbox = await inboxRoutes(request, env, url, now);
  if (inbox) return inbox;
  const customers = await customerSyncRoutes(request, env, url, now);
  if (customers) return customers;
  const subscription = await subscriptionRoutes(request, env, url, now);
  if (subscription) return subscription;
  const errors = await errorRoutes(request, env, url, now);
  if (errors) return errors;
  const reviews = await reviewRoutes(request, env, url, now);
  if (reviews) return reviews;
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
