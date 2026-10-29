const Redis = require('ioredis');

// 100 requests per minute per IP
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;
const PREFIX = 'rl';

// In-memory fallback if Redis is down/unavailable
const memoryStore = new Map();

// Periodic cleanup of expired entries in memory
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000).unref();

function checkMemoryRateLimit(ip) {
  const now = Date.now();
  const record = memoryStore.get(ip);

  if (!record || now > record.resetTime) {
    memoryStore.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  record.count += 1;
  return record.count <= MAX_REQUESTS;
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
        return null; // Stop spamming reconnection if Redis is offline
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

  redis.connect().catch(() => {
    redisAvailable = false;
  });
} catch {
  redisAvailable = false;
}

/**
 * Returns true if the request is within the allowed limit.
 * Uses Redis INCR when available, with immediate in-memory fallback.
 */
async function checkRateLimit(ip) {
  if (!redisAvailable || !redis) {
    return checkMemoryRateLimit(ip);
  }

  try {
    const key = `${PREFIX}:${ip}`;
    const ttlSec = Math.ceil(WINDOW_MS / 1000);
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, ttlSec);
    }
    return current <= MAX_REQUESTS;
  } catch {
    redisAvailable = false;
    return checkMemoryRateLimit(ip);
  }
}

module.exports = { checkRateLimit };
