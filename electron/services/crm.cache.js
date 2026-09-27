/**
 * CRM & Customer Communications Memory Cache Engine
 * Fast memory caching for customer unified timelines and daily follow-up reminders
 */

class CRMCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 30000; // 30 seconds TTL
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

const crmCache = new CRMCache();
module.exports = crmCache;
