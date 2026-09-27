/**
 * Operations & Orders Cache Engine
 * In-memory caching for stats counters, board items, and lookups
 */

class OrdersCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 30000; // 30 seconds default TTL
  }

  set(key, data, ttlMs = this.defaultTTL) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { data, expiresAt });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  invalidate(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

const ordersCache = new OrdersCache();
module.exports = ordersCache;
