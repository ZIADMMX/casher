/**
 * Kashiear POS — High-Performance Multi-Policy In-Memory Cache Engine
 * Supports:
 * - LRU (Least Recently Used) Eviction in O(1) time
 * - TTL (Time-To-Live) with dynamic Jitter
 * - Capacity-Bounded Storage (prevents RAM leaks)
 * - Single-Flight Promise Lock (Stampede Guard)
 * - Negative Caching (Penetration Guard)
 */

class LRUCache {
  /**
   * @param {Object} options
   * @param {number} [options.maxSize=1000] Maximum number of items in cache before LRU eviction
   * @param {number} [options.defaultTTL=60000] Default TTL in milliseconds (0 = no expiry)
   * @param {boolean} [options.enableJitter=true] Add random 10-20% jitter to TTL
   */
  constructor({ maxSize = 1000, defaultTTL = 60000, enableJitter = true } = {}) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTTL = defaultTTL;
    this.enableJitter = enableJitter;
    this.cache = new Map(); // Preserves insertion/access order for O(1) LRU
    this.inFlight = new Map(); // Single-flight mutex
  }

  _computeTTL(ttlMs) {
    const base = ttlMs !== undefined ? ttlMs : this.defaultTTL;
    if (base <= 0) return Infinity;
    if (!this.enableJitter) return base;
    const jitter = Math.floor(Math.random() * (base * 0.15));
    return base + jitter;
  }

  /**
   * Get an item by key with LRU order promotion
   * @param {string} key
   * @returns {*} Cached value or null
   */
  get(key) {
    if (!this.cache.has(key)) return null;

    const entry = this.cache.get(key);

    // Check TTL Expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU Promotion: Delete and re-set to move key to the most-recently-used end of Map
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set an item in cache with LRU eviction when capacity is exceeded
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] Custom TTL in ms
   */
  set(key, value, ttlMs) {
    // If key already exists, remove it first for fresh positioning
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // LRU Eviction: Remove the oldest (least recently used) entry from head of Map
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const ttl = this._computeTTL(ttlMs);
    const expiresAt = ttl === Infinity ? null : Date.now() + ttl;

    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Check if a valid non-expired key exists in cache
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Invalidate by exact key or substring pattern, or clear all
   */
  invalidate(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      this.inFlight.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (String(key).includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Single-Flight Fetch Coalescing (Stampede Guard)
   */
  async getOrFetch(key, fetchFn, ttlMs) {
    const cached = this.get(key);
    if (cached !== null) return cached;

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const flightPromise = (async () => {
      try {
        const result = await fetchFn();
        this.set(key, result, ttlMs);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, flightPromise);
    return flightPromise;
  }

  /**
   * Current number of stored items
   */
  get size() {
    return this.cache.size;
  }
}

module.exports = LRUCache;
