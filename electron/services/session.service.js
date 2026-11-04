// electron/services/session.service.js
// JWT session handling for Kashiear POS Electron app.
// Requires the `jsonwebtoken` package (npm install jsonwebtoken).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Secret key – read from environment or persist in settings database
const _fallbackSecret = crypto.randomBytes(32).toString('hex');

// Bump when the stored secret must be replaced on every installation
// (v2: older builds exposed it through settings:getAll).
const SECRET_GENERATION = '2';

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const settingsRepo = require('../repositories/settings.repository');
    let saved = settingsRepo.get('system_session_secret');
    if (saved && settingsRepo.get('system_session_secret_generation') !== SECRET_GENERATION) {
      // Discard the possibly leaked secret: every token signed with it becomes invalid.
      saved = null;
      settingsRepo.set('last_active_session_token', '');
    }
    if (!saved) {
      saved = crypto.randomBytes(32).toString('hex');
      settingsRepo.set('system_session_secret', saved);
      settingsRepo.set('system_session_secret_generation', SECRET_GENERATION);
    }
    return saved;
  } catch {
    return _fallbackSecret;
  }
}

// Token expiry in seconds (default 8 hours for POS cashier shifts instead of 24h)
const DEFAULT_EXPIRE = Number(process.env.SESSION_EXPIRE_SECONDS) || (8 * 3600);

// ---------- Token Blacklist ----------
// jti -> unix second from which the token is rejected. Kept in memory and in the
// revoked_tokens table so logouts survive an app restart.
const _blacklist = new Map();

// A refreshed token stays usable briefly so requests already in flight with it
// do not fail (the LAN client drops its session on 401).
const REFRESH_GRACE_SECONDS = 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function persistRevocation(jti, revokedFrom, expiresAt) {
  try {
    const { db } = require('../database/db');
    db.prepare('DELETE FROM revoked_tokens WHERE expires_at <= ?').run(nowSeconds());
    db.prepare(`
      INSERT INTO revoked_tokens (jti, revoked_from, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(jti) DO UPDATE SET revoked_from = MIN(revoked_from, excluded.revoked_from)
    `).run(jti, revokedFrom, expiresAt);
  } catch {
    // Database unavailable (unit tests): the in-memory blacklist still applies.
  }
}

function getPersistedRevocation(jti) {
  try {
    const { db } = require('../database/db');
    return db.prepare('SELECT revoked_from FROM revoked_tokens WHERE jti = ?').get(jti)?.revoked_from ?? null;
  } catch {
    return null;
  }
}

function isRevoked(jti) {
  const revokedFrom = _blacklist.has(jti) ? _blacklist.get(jti) : getPersistedRevocation(jti);
  return revokedFrom != null && nowSeconds() >= revokedFrom;
}

function revoke(decoded, graceSeconds = 0) {
  if (!decoded?.jti) return;
  const revokedFrom = nowSeconds() + graceSeconds;
  const current = _blacklist.get(decoded.jti);
  _blacklist.set(decoded.jti, current == null ? revokedFrom : Math.min(current, revokedFrom));
  const expiresAt = decoded.exp || revokedFrom + DEFAULT_EXPIRE;
  persistRevocation(decoded.jti, revokedFrom, expiresAt);

  // Auto-clean memory once the token would have expired naturally
  const ttl = (expiresAt * 1000) - Date.now();
  if (ttl > 0) {
    const cleanupTimer = setTimeout(() => _blacklist.delete(decoded.jti), ttl);
    cleanupTimer.unref?.();
  } else {
    _blacklist.delete(decoded.jti);
  }
}

/**
 * Generate a JWT for a given user payload.
 * Payload should contain at minimum: { id, username, role }.
 */
function generateToken(payload, expiresIn = DEFAULT_EXPIRE) {
  const data = {
    ...payload,
    jti: crypto.randomUUID(), // unique token ID used for blacklisting
  };
  return jwt.sign(data, getSecret(), { expiresIn });
}

/**
 * Verify token and return decoded payload, or throw.
 * Also rejects blacklisted (logged-out) tokens.
 */
function verifyToken(token) {
  if (!token) throw new Error('TokenMissing');
  const decoded = jwt.verify(token, getSecret());
  if (decoded.jti && isRevoked(decoded.jti)) {
    throw new Error('TokenRevoked');
  }
  return decoded;
}

/**
 * Add a token to the blacklist so it can no longer be used.
 * Called on logout to instantly invalidate the current session token.
 */
function invalidateToken(token) {
  try {
    // Decode without verification so we can blacklist even if it's about to expire
    revoke(jwt.decode(token));
  } catch {
    // Silently ignore decode failures – token was probably garbage
  }
}

/**
 * Issue a fresh token carrying the same user payload.
 * The old token is revoked after a short grace period.
 */
function refreshToken(oldToken) {
  const payload = verifyToken(oldToken);
  // Strip JWT-internal fields before re-signing
  const rest = { ...payload };
  delete rest.iat;
  delete rest.exp;
  delete rest.jti;
  const newToken = generateToken(rest);
  revoke(payload, REFRESH_GRACE_SECONDS);
  return newToken;
}

/**
 * Return the remaining seconds before a token expires, or 0 if already expired.
 */
function getTokenTTL(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return 0;
    const remaining = decoded.exp - Math.floor(Date.now() / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  generateToken,
  verifyToken,
  invalidateToken,
  refreshToken,
  getTokenTTL,
};
