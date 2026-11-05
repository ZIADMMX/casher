/**
 * Industrial-Grade Process Cache Engine with Protection against:
 * 1. LRU Eviction (Least Recently Used) with Bounded Max-Size
 * 2. Cache Stampede (Single-Flight Promise Lock + Random TTL Jitter)
 * 3. Cache Penetration (Negative/Null Caching for non-existent items)
 * 4. Stale Data (Event-Driven Active Invalidation + Tuned TTLs)
 */

const LRUCache = require('./lru.cache');

class ProductsCache {
  constructor() {
    this.catalogCache = null;
    this.catalogExpiresAt = 0;
    // LRU-bounded barcode index (Max 5,000 items in active cache)
    this.barcodeCache = new LRUCache({ maxSize: 5000, defaultTTL: 120000 });
    // LRU-bounded negative cache for non-existent barcodes (Max 1,000 items, 10s TTL)
    this.negativeBarcodeCache = new LRUCache({ maxSize: 1000, defaultTTL: 10000 });
    this.inFlightFetches = new Map();
    this.defaultTTL = 60 * 1000;
  }

  _computeJitteredTTL(baseTTL) {
    const jitter = Math.floor(Math.random() * (baseTTL * 0.2));
    return baseTTL + jitter;
  }

  getCatalog() {
    if (this.catalogCache && Date.now() < this.catalogExpiresAt) {
      return this.catalogCache;
    }
    return null;
  }

  setCatalog(catalogData, ttlMs = this.defaultTTL) {
    this.catalogCache = catalogData;
    this.catalogExpiresAt = Date.now() + this._computeJitteredTTL(ttlMs);

    this.barcodeCache.invalidate();
    this.negativeBarcodeCache.invalidate();
    // variant id -> { variant (the catalog object), codes (barcode/SKU keys) }
    this.variantIndex = new Map();

    if (Array.isArray(catalogData)) {
      for (const product of catalogData) {
        if (Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            const codes = [];
            if (variant.barcode) {
              const clean = String(variant.barcode).trim().toUpperCase();
              this.barcodeCache.set(clean, { ...variant, product_name: product.name, image_path: product.image_path });
              codes.push(clean);
            }
            if (variant.sku) {
              const cleanSku = String(variant.sku).trim().toUpperCase();
              this.barcodeCache.set(cleanSku, { ...variant, product_name: product.name, image_path: product.image_path });
              codes.push(cleanSku);
            }
            this.variantIndex.set(variant.id, { variant, codes });
          }
        }
      }
    }
  }

  /**
   * Apply fresh stock numbers after a sale or return, instead of rebuilding the
   * whole catalog. `rows` must hold every active variant ({ id, stock_quantity }).
   * If they do not match the cached variants one-to-one, the catalog itself has
   * changed, so the cache is dropped and rebuilt on the next read.
   * @returns {boolean} true when the cache was updated in place.
   */
  refreshStock(rows) {
    if (!this.catalogCache || !this.variantIndex) return false;
    if (!Array.isArray(rows) || rows.length !== this.variantIndex.size
      || !rows.every((row) => this.variantIndex.has(row.id))) {
      this.invalidate();
      return false;
    }

    for (const row of rows) {
      const entry = this.variantIndex.get(row.id);
      if (entry.variant.stock_quantity === row.stock_quantity) continue;
      entry.variant.stock_quantity = row.stock_quantity;
      for (const code of entry.codes) {
        const cached = this.barcodeCache.get(code);
        if (cached) cached.stock_quantity = row.stock_quantity;
      }
    }
    return true;
  }

  /**
   * Barcode Lookup with LRU promotion & Negative Cache (Penetration Guard)
   */
  getByBarcode(barcode) {
    if (!barcode) return null;
    const clean = String(barcode).trim().toUpperCase();

    // Check Negative Cache (Cache Penetration Guard)
    if (this.negativeBarcodeCache.get(clean)) {
      return { isNull: true };
    }

    // LRU Promoted lookup
    return this.barcodeCache.get(clean) || null;
  }

  /**
   * Record non-existent barcode in LRU negative cache
   */
  recordNegativeBarcode(barcode) {
    if (!barcode) return;
    const clean = String(barcode).trim().toUpperCase();
    this.negativeBarcodeCache.set(clean, true, 10000);
  }

  /**
   * Single-Flight Fetch Coalescing (Cache Stampede Mutex)
   */
  async getOrFetchCatalog(fetchFn) {
    const cached = this.getCatalog();
    if (cached) return cached;

    const flightKey = 'catalog_fetch';
    if (this.inFlightFetches.has(flightKey)) {
      return this.inFlightFetches.get(flightKey);
    }

    const fetchPromise = (async () => {
      try {
        const data = await fetchFn();
        this.setCatalog(data);
        return data;
      } finally {
        this.inFlightFetches.delete(flightKey);
      }
    })();

    this.inFlightFetches.set(flightKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Event-Driven Active Invalidation (Stale Data Guard)
   */
  invalidate() {
    this.catalogCache = null;
    this.catalogExpiresAt = 0;
    this.variantIndex = null;
    this.barcodeCache.invalidate();
    this.negativeBarcodeCache.invalidate();
    this.inFlightFetches.clear();
  }
}

const productsCache = new ProductsCache();

/**
 * After a sale or return only stock numbers change. Re-read them (one light
 * query) and patch the cached catalog instead of rebuilding it. Any stock the
 * sale moved indirectly (recipe ingredients, bundles) is covered too, since
 * every active variant is re-read. Falls back to a full invalidation on error.
 */
productsCache.refreshStockFromDatabase = function refreshStockFromDatabase() {
  if (!this.catalogCache) return false;
  try {
    const variantsRepo = require('../repositories/productVariants.repository');
    return this.refreshStock(variantsRepo.getActiveStock());
  } catch {
    this.invalidate();
    return false;
  }
};

module.exports = productsCache;
