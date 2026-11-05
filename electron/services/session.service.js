// electron/services/session.service.js
// JWT session handling for Kashiear POS Electron app.
// Requires the `jsonwebtoken` package (npm install jsonwebtoken).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const sessionStore = require('../repositories/sessionStore.repository');

// Used only for in-memory databases (tests), where there is no data folder.
const _fallbackSecret = crypto.randomBytes(32).toString('hex');

// The signing secret is kept in a file next to the database, never inside it:
// backups copy only the .db file, so a backup cannot be used to forge tokens.
const SECRET_FILE = 'session.key';
// Older builds stored the secret in the settings table; those rows are discarded.
const LEGACY_SETTING_KEYS = ['system_session_secret', 'system_session_secret_generation'];

let cachedSecret = null;

function getSecretFilePath() {
  const { dbPath } = require('../database/db');
  if (!dbPath || dbPath === ':memory:') return null;
  return path.join(path.dirname(dbPath), SECRET_FILE);
}

function discardLegacySecret() {
  try {
    sessionStore.deleteLegacySecretSettings(LEGACY_SETTING_KEYS);
  } catch {
    // No settings table yet (fresh or test database).
  }
}

function readOrCreateSecretFile(filePath) {
  try {
    const saved = fs.readFileSync(filePath, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(saved)) return saved;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(filePath, secret, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return secret;
  } catch (error) {
    // Another process (e.g. api-server) created it first: use that one.
    if (error.code === 'EEXIST') return fs.readFileSync(filePath, 'utf8').trim();
    throw error;
  }
}

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const filePath = getSecretFilePath();
  if (!filePath) return _fallbackSecret;
  discardLegacySecret();
  cachedSecret = readOrCreateSecretFile(filePath);
  return cachedSecret;
}

/** Replace the signing secret: every token issued so far stops working. */
function rotateSecret() {
  cachedSecret = null;
  const filePath = getSecretFilePath();
  if (filePath) fs.rmSync(filePath, { force: true });
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
    sessionStore.saveRevocation(jti, revokedFrom, expiresAt, nowSeconds());
  } catch {
    // Database unavailable (unit tests): the in-memory blacklist still applies.
  }
}

function getPersistedRevocation(jti) {
  try {
    return sessionStore.getRevokedFrom(jti);
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
  return jwt.sign(data, getSecret(), { algorithm: 'HS256', expiresIn });
}

/**
 * Verify token and return decoded payload, or throw.
 * Also rejects blacklisted (logged-out) tokens.
 */
function verifyToken(token) {
  if (!token) throw new Error('TokenMissing');
  const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
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
  rotateSecret,
};
