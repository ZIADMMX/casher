const LRUCache = require('../../electron/services/lru.cache');

describe('LRUCache Engine (High-Performance Process Caching)', () => {
  test('basic set and get operations work as expected', () => {
    const cache = new LRUCache({ maxSize: 3, defaultTTL: 10000, enableJitter: false });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('nonexistent')).toBeNull();
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('evicts least recently used (LRU) item when exceeding maxSize', () => {
    const cache = new LRUCache({ maxSize: 3, defaultTTL: 0, enableJitter: false });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' so 'a' becomes MRU (Most Recently Used), leaving 'b' as oldest
    expect(cache.get('a')).toBe(1);

    // Add 'd' which should evict 'b'
    cache.set('d', 4);

    expect(cache.get('b')).toBeNull(); // 'b' was evicted
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  test('TTL expiration removes stale items', () => {
    const cache = new LRUCache({ maxSize: 5, defaultTTL: 50, enableJitter: false });
    cache.set('quick', 'data', 10); // expires in 10ms

    // Force expiration in test by overriding Date.now or wait
    const realNow = Date.now;
    try {
      expect(cache.get('quick')).toBe('data');
      Date.now = () => realNow() + 100; // Fast-forward time
      expect(cache.get('quick')).toBeNull();
      expect(cache.has('quick')).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('delete and invalidate operations', () => {
    const cache = new LRUCache({ maxSize: 10, defaultTTL: 10000, enableJitter: false });
    cache.set('product_1', 'Apple');
    cache.set('product_2', 'Banana');
    cache.set('customer_1', 'John');

    expect(cache.delete('product_1')).toBe(true);
    expect(cache.get('product_1')).toBeNull();

    // Invalidate by substring pattern
    cache.invalidate('product');
    expect(cache.get('product_2')).toBeNull();
    expect(cache.get('customer_1')).toBe('John');

    // Invalidate all
    cache.invalidate();
    expect(cache.size).toBe(0);
  });

  test('getOrFetch coalesces concurrent requests (Single-Flight Lock / Stampede Guard)', async () => {
    const cache = new LRUCache({ maxSize: 10, defaultTTL: 10000, enableJitter: false });
    let fetchCount = 0;

    const slowFetcher = async () => {
      fetchCount++;
      return { id: 99, name: 'Expensive Calculation' };
    };

    // 10 concurrent requests at the same instant
    const promises = Array.from({ length: 10 }, () => cache.getOrFetch('calc_key', slowFetcher));
    const results = await Promise.all(promises);

    expect(fetchCount).toBe(1); // Only 1 DB/compute hit
    for (const res of results) {
      expect(res).toEqual({ id: 99, name: 'Expensive Calculation' });
    }
  });
});
