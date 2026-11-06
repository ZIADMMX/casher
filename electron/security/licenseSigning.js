// Ed25519 license keys and admin-recovery responses.
//
// The vendor signs with a private key that never leaves the vendor's machine
// (scripts/license-init.js creates it, scripts/generate-key.js uses it). The app
// only carries the public key in license-public-key.js, so a copy of the
// installer, the database or a backup cannot be used to mint keys.
const crypto = require('node:crypto');
const { LICENSE_PUBLIC_KEY } = require('./license-public-key');

const KEY_PREFIX = 'FOX1';
const KEY_VERSION = 1;
const LIFETIME_SECONDS = 0xffffffff;
// Kept for callers that compared against the old millisecond sentinel.
const LIFETIME_TIMESTAMP_MS = 9999999999000;
const SIGNATURE_BYTES = 64;
const PAYLOAD_BYTES = 9; // version (1) + HWID (4) + expiry seconds (4)

const LICENSE_DOMAIN = Buffer.from('foxcloud-license-v1:');
const RECOVERY_DOMAIN = Buffer.from('foxcloud-recovery-v1:');

// Crockford base32: no I, L, O or U, so keys survive being read aloud or retyped.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODE_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < ALPHABET.length; i++) map.set(ALPHABET[i], i);
  map.set('O', 0);
  map.set('I', 1);
  map.set('L', 1);
  return map;
})();

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of text) {
    const digit = DECODE_MAP.get(ch);
    if (digit === undefined) return null;
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function group(text, size = 5) {
  return text.match(new RegExp(`.{1,${size}}`, 'g')).join('-');
}

function normalize(text) {
  return String(text || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function loadPublicKey() {
  // Tests sign with a throwaway key pair. The override is ignored outside jest,
  // so an environment variable cannot swap the key in a shipped build.
  const override = process.env.NODE_ENV === 'test' ? process.env.FOX_LICENSE_PUBLIC_KEY : '';
  const encoded = override || LICENSE_PUBLIC_KEY;
  if (!encoded) return null;
  return crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
}

function toPrivateKey(privateKey) {
  if (privateKey && typeof privateKey === 'object' && privateKey.type === 'private') return privateKey;
  return crypto.createPrivateKey(privateKey);
}

function verifySignature(domain, message, signature) {
  const publicKey = loadPublicKey();
  if (!publicKey) return false;
  try {
    return crypto.verify(null, Buffer.concat([domain, message]), publicKey, signature);
  } catch {
    return false;
  }
}

function hwidToBytes(hwid) {
  const clean = String(hwid || '').trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(clean)) throw new Error('رمز الجهاز (HWID) يجب أن يكون 8 خانات hex');
  return Buffer.from(clean, 'hex');
}

/** Vendor side: sign a license for one machine. expiryTimestamp is ms, or >= 9e12 for lifetime. */
function signLicenseKey({ hwid, expiryTimestamp, privateKey }) {
  const expiryMs = Number(expiryTimestamp);
  if (!Number.isFinite(expiryMs) || expiryMs <= 0) throw new Error('تاريخ انتهاء الترخيص غير صالح');
  const expirySeconds = expiryMs >= 9e12 ? LIFETIME_SECONDS : Math.floor(expiryMs / 1000);
  if (expirySeconds >= LIFETIME_SECONDS && expiryMs < 9e12) throw new Error('تاريخ انتهاء الترخيص بعيد جدًا');

  const payload = Buffer.alloc(PAYLOAD_BYTES);
  payload.writeUInt8(KEY_VERSION, 0);
  hwidToBytes(hwid).copy(payload, 1);
  payload.writeUInt32BE(expirySeconds, 5);

  const signature = crypto.sign(null, Buffer.concat([LICENSE_DOMAIN, payload]), toPrivateKey(privateKey));
  return `${KEY_PREFIX}-${group(base32Encode(Buffer.concat([payload, signature])))}`;
}

/**
 * App side: decode and check a license key. Returns { valid:false, reason } or
 * { valid:true, hwid, expiryTimestamp (ms), isLifetime }. Does not check the
 * HWID or the expiry date; license.service does that against the machine.
 */
function parseLicenseKey(keyString) {
  const clean = normalize(keyString);
  if (!clean.startsWith(KEY_PREFIX)) return { valid: false, reason: 'تنسيق المفتاح غير صحيح' };

  const bytes = base32Decode(clean.slice(KEY_PREFIX.length));
  if (!bytes || bytes.length !== PAYLOAD_BYTES + SIGNATURE_BYTES || bytes[0] !== KEY_VERSION) {
    return { valid: false, reason: 'سيريال التفعيل تالف أو غير صحيح' };
  }

  const payload = bytes.subarray(0, PAYLOAD_BYTES);
  const signature = bytes.subarray(PAYLOAD_BYTES);
  if (!loadPublicKey()) return { valid: false, reason: 'مفتاح التحقق غير مهيأ في النظام' };
  if (!verifySignature(LICENSE_DOMAIN, payload, signature)) {
    return { valid: false, reason: 'توقيع المفتاح غير صحيح أو تم التلاعب به' };
  }

  const expirySeconds = payload.readUInt32BE(5);
  const isLifetime = expirySeconds === LIFETIME_SECONDS;
  return {
    valid: true,
    hwid: payload.subarray(1, 5).toString('hex').toUpperCase(),
    isLifetime,
    expiryTimestamp: isLifetime ? LIFETIME_TIMESTAMP_MS : expirySeconds * 1000,
  };
}

/** Vendor side: answer an admin-recovery challenge shown on the customer's screen. */
function signRecoveryResponse(challengeCode, privateKey) {
  const message = Buffer.from(normalize(challengeCode));
  const signature = crypto.sign(null, Buffer.concat([RECOVERY_DOMAIN, message]), toPrivateKey(privateKey));
  return group(base32Encode(signature));
}

/** App side: check the vendor's answer to a challenge this machine issued. */
function verifyRecoveryResponse(challengeCode, responseCode) {
  const signature = base32Decode(normalize(responseCode));
  if (!signature || signature.length !== SIGNATURE_BYTES) return false;
  return verifySignature(RECOVERY_DOMAIN, Buffer.from(normalize(challengeCode)), signature);
}

const TIME_DOMAIN = 'foxcloud-time-v1:';

function loadTimeServerKey() {
  const override = process.env.NODE_ENV === 'test' ? process.env.FOX_TIME_PUBLIC_KEY : '';
  const encoded = override || require('./time-server-public-key').TIME_SERVER_PUBLIC_KEY;
  if (!encoded) return null;
  return crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
}

/** App side: check a time-server answer (license-server/src/index.js) for this request's nonce. */
function verifyTimeResponse({ utc, trialStart, sig }, device, nonce) {
  const publicKey = loadTimeServerKey();
  if (!publicKey || typeof utc !== 'string' || typeof sig !== 'string' || !Number.isFinite(trialStart)) return false;
  try {
    const message = Buffer.from(`${TIME_DOMAIN}${utc}|${device}|${nonce}|${trialStart}`);
    return crypto.verify(null, message, publicKey, Buffer.from(sig, 'base64'));
  } catch {
    return false;
  }
}

module.exports = {
  TIME_DOMAIN,
  verifyTimeResponse,
  KEY_PREFIX,
  LIFETIME_TIMESTAMP_MS,
  base32Encode,
  base32Decode,
  signLicenseKey,
  parseLicenseKey,
  signRecoveryResponse,
  verifyRecoveryResponse,
};
