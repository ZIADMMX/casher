// foxcloud license time server (Cloudflare Worker).
//
// GET /api/license/time?device=<64 hex>&nonce=<32 hex>
//   -> { utc, trialStart, sig }
//
// trialStart is the first time this machine ever asked (kept in D1), so wiping
// the app does not start a new trial. sig is an Ed25519 signature over
// `foxcloud-time-v1:${utc}|${device}|${nonce}|${trialStart}`; the app checks it
// with the public key it ships, so a fake local server or a replayed answer
// (the nonce is fresh per request) is rejected.
//
// Secret: TIME_SIGNING_KEY = base64 PKCS#8 Ed25519 private key
// (node scripts/time-server-init.js --print-secret | npx wrangler secret put TIME_SIGNING_KEY).

const DEVICE_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;

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

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/license/time' || request.method !== 'GET') {
    return json({ error: 'not found' }, 404);
  }

  const device = url.searchParams.get('device') || '';
  const nonce = url.searchParams.get('nonce') || '';
  if (!DEVICE_PATTERN.test(device) || !NONCE_PATTERN.test(nonce)) {
    return json({ error: 'device and nonce are required' }, 400);
  }

  await env.DB.prepare('INSERT OR IGNORE INTO devices (device_id, first_seen) VALUES (?, ?)')
    .bind(device, now)
    .run();
  const row = await env.DB.prepare('SELECT first_seen FROM devices WHERE device_id = ?')
    .bind(device)
    .first();

  const utc = new Date(now).toISOString();
  const trialStart = Number(row.first_seen);
  const message = new TextEncoder().encode(`foxcloud-time-v1:${utc}|${device}|${nonce}|${trialStart}`);
  const sig = bytesToBase64(await crypto.subtle.sign({ name: 'Ed25519' }, await getSigningKey(env), message));

  return json({ utc, trialStart, sig });
}

export default {
  fetch: (request, env) => handle(request, env),
};
