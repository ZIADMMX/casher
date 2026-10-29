// electron/services/session.service.js
// JWT session handling for Kashiear POS Electron app.
// Requires the `jsonwebtoken` package (npm install jsonwebtoken).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Secret key – read from environment or persist in settings database
const _fallbackSecret = crypto.randomBytes(32).toString('hex');

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const settingsRepo = require('../repositories/settings.repository');
    let saved = settingsRepo.get('system_session_secret');
    if (!saved) {
      saved = crypto.randomBytes(32).toString('hex');
      settingsRepo.set('system_session_secret', saved);
    }
    return saved;
  } catch {
    return _fallbackSecret;
  }
}

// Token expiry in seconds (default 8 hours for POS cashier shifts instead of 24h)
const DEFAULT_EXPIRE = Number(process.env.SESSION_EXPIRE_SECONDS) || (8 * 3600);

// ---------- Token Blacklist ----------
// In-memory set of invalidated JTI (JWT ID) values.
// Tokens added here are treated as revoked even if they haven't expired yet.
const _blacklist = new Set();

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
  if (decoded.jti && _blacklist.has(decoded.jti)) {
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
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti) {
      _blacklist.add(decoded.jti);

      // Auto-clean: schedule removal once the token would have expired naturally
      if (decoded.exp) {
        const ttl = (decoded.exp * 1000) - Date.now();
        if (ttl > 0) {
          const cleanupTimer = setTimeout(() => _blacklist.delete(decoded.jti), ttl);
          cleanupTimer.unref?.();
        } else {
          // Already expired, no need to keep in blacklist
          _blacklist.delete(decoded.jti);
        }
      }
    }
  } catch {
    // Silently ignore decode failures – token was probably garbage
  }
}

/**
 * Issue a fresh token carrying the same user payload.
 * The old token remains valid until it naturally expires (or is blacklisted).
 */
function refreshToken(oldToken) {
  const payload = verifyToken(oldToken);
  // Strip JWT-internal fields before re-signing
  const rest = { ...payload };
  delete rest.iat;
  delete rest.exp;
  delete rest.jti;
  return generateToken(rest);
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
