const crypto = require('node:crypto');
const Redis = require('ioredis');

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 600;
const ACTION_WINDOW_MS = 40 * 1000;
const ACTION_MAX_REQUESTS = 5;
const MAX_CONCURRENT_REQUESTS = 50;
const MAX_MEMORY_ACTION_KEYS = 10000;
const PREFIX = 'rl';
// The till repeats these with every customer; 5 per 40s would stop a busy cashier mid-queue.
// They stay under the global per-IP limit and the concurrency cap.
const HIGH_VOLUME_ACTIONS = new Set([
  'sales:create',
  'sales:updateKitchenOrderStatus',
  'tables:openTab',
  'POST /api/sales/create',
  'POST /api/sales/kitchen-orders/status',
]);
const memoryStore = new Map();
const actionMemoryStore = new Map();
let activeRequests = 0;

const ACTION_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local maximum = tonumber(ARGV[3])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local count = redis.call('ZCARD', key)
  if count >= maximum then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    return {0, math.max(1, tonumber(oldest[2]) + window - now)}
  end
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, window)
  return {1, 0}
`;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore) {
    if (now > record.resetTime) memoryStore.delete(key);
  }
  for (const [key, timestamps] of actionMemoryStore) {
    const active = timestamps.filter((timestamp) => now - timestamp < ACTION_WINDOW_MS);
    if (active.length) actionMemoryStore.set(key, active);
    else actionMemoryStore.delete(key);
  }
}, 60 * 1000).unref();

function checkMemoryRateLimit(key) {
  const now = Date.now();
  const record = memoryStore.get(key);
  if (!record || now > record.resetTime) {
    memoryStore.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }
  record.count += 1;
  return record.count <= MAX_REQUESTS;
}

function checkMemoryActionRateLimit(key, now = Date.now()) {
  const timestamps = (actionMemoryStore.get(key) || [])
    .filter((timestamp) => now - timestamp < ACTION_WINDOW_MS);
  if (timestamps.length >= ACTION_MAX_REQUESTS) {
    actionMemoryStore.set(key, timestamps);
    return {
      allowed: false,
      retryAfterMs: Math.max(1, timestamps[0] + ACTION_WINDOW_MS - now),
    };
  }
  if (!actionMemoryStore.has(key) && actionMemoryStore.size >= MAX_MEMORY_ACTION_KEYS) {
    const oldestKey = actionMemoryStore.keys().next().value;
    if (oldestKey !== undefined) actionMemoryStore.delete(oldestKey);
  }
  timestamps.push(now);
  actionMemoryStore.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

let redis = null;
let redisAvailable = false;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 500,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 2) {
        redisAvailable = false;
        return null;
      }
      return 10000;
    },
  });

  redis.on('connect', () => {
    redisAvailable = true;
  });
  redis.on('error', () => {
    redisAvailable = false;
  });
  redis.connect().then(() => {
    redisAvailable = true;
  }).catch(() => {
    redisAvailable = false;
  });
} catch {
  redisAvailable = false;
}

async function checkRateLimit(key) {
  if (!redisAvailable || !redis) return checkMemoryRateLimit(key);

  try {
    const redisKey = `${PREFIX}:${key}`;
    const ttlSec = Math.ceil(WINDOW_MS / 1000);
    const current = await redis.incr(redisKey);
    if (current === 1) await redis.expire(redisKey, ttlSec);
    return current <= MAX_REQUESTS;
  } catch {
    redisAvailable = false;
    return checkMemoryRateLimit(key);
  }
}

async function checkActionRateLimit(identity, action) {
  const digest = crypto
    .createHash('sha256')
    .update(`${identity}:${action}`)
    .digest('hex');
  const key = `${PREFIX}:action:${digest}`;
  if (!redisAvailable || !redis) return checkMemoryActionRateLimit(key);

  const now = Date.now();
  try {
    const [allowed, retryAfterMs] = await redis.eval(
      ACTION_LIMIT_SCRIPT,
      1,
      key,
      now,
      ACTION_WINDOW_MS,
      ACTION_MAX_REQUESTS,
      `${now}:${crypto.randomUUID()}`
    );
    return { allowed: allowed === 1, retryAfterMs: Number(retryAfterMs) || 0 };
  } catch {
    redisAvailable = false;
    return checkMemoryActionRateLimit(key, now);
  }
}

function normalizeActionPath(route) {
  return String(route || '/')
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Client address for rate limiting. X-Forwarded-For is client-controlled, so it is
 * honoured only with trustProxy and only when the request comes from the local
 * load balancer, which overwrites the header with the real peer address.
 */
function getClientIp(req, { trustProxy = false } = {}) {
  const peer = req.socket?.remoteAddress || 'unknown';
  if (!trustProxy || !LOOPBACK_ADDRESSES.has(peer)) return peer;
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || peer;
}

async function checkRequestActionRateLimit(req, userId = null, options = {}) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const identity = userId != null
    ? `user:${userId}`
    : `ip:${getClientIp(req, options)}`;
  const action = `${method} ${normalizeActionPath(req.url)}`;
  if (HIGH_VOLUME_ACTIONS.has(action)) return null;
  return checkActionRateLimit(identity, action);
}

function tryAcquireRequestSlot() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) return null;
  activeRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRequests -= 1;
  };
}

module.exports = {
  checkRateLimit,
  checkActionRateLimit,
  checkRequestActionRateLimit,
  getClientIp,
  normalizeActionPath,
  tryAcquireRequestSlot,
  ACTION_MAX_REQUESTS,
  ACTION_WINDOW_MS,
  HIGH_VOLUME_ACTIONS,
  MAX_CONCURRENT_REQUESTS,
  MAX_REQUESTS,
};
