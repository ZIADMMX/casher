const productsCache = require('../../electron/services/products.cache');

describe('ProductsCache Engine (Catalog, Barcodes & Penetration Defense)', () => {
  beforeEach(() => {
    productsCache.invalidate();
  });

  test('setCatalog builds in-memory catalog and O(1) barcode lookup map', () => {
    const mockCatalog = [
      {
        id: 1,
        name: 'Cotton Shirt',
        image_path: '/images/shirt.png',
        variants: [
          { id: 10, barcode: 'BAR-111', sku: 'SKU-111', size: 'L', price: 150 },
          { id: 11, barcode: 'BAR-222', sku: 'SKU-222', size: 'XL', price: 160 },
        ],
      },
    ];

    productsCache.setCatalog(mockCatalog);

    expect(productsCache.getCatalog()).toEqual(mockCatalog);

    // Test barcode lookup
    const variantByBarcode = productsCache.getByBarcode('bar-111'); // Case-insensitive
    expect(variantByBarcode).toBeDefined();
    expect(variantByBarcode.id).toBe(10);
    expect(variantByBarcode.product_name).toBe('Cotton Shirt');

    // Test sku lookup
    const variantBySku = productsCache.getByBarcode('sku-222');
    expect(variantBySku).toBeDefined();
    expect(variantBySku.id).toBe(11);
  });

  test('negative caching prevents repeated DB queries for missing barcodes (Cache Penetration Guard)', () => {
    expect(productsCache.getByBarcode('NON-EXISTENT-999')).toBeNull();

    // Record non-existent barcode
    productsCache.recordNegativeBarcode('NON-EXISTENT-999');

    const result = productsCache.getByBarcode('non-existent-999');
    expect(result).toEqual({ isNull: true });
  });

  test('getOrFetchCatalog coalesces simultaneous catalog calls into single execution', async () => {
    let callCount = 0;
    const fetchCatalog = async () => {
      callCount++;
      return [{ id: 5, name: 'Trousers', variants: [] }];
    };

    const [cat1, cat2, cat3] = await Promise.all([
      productsCache.getOrFetchCatalog(fetchCatalog),
      productsCache.getOrFetchCatalog(fetchCatalog),
      productsCache.getOrFetchCatalog(fetchCatalog),
    ]);

    expect(callCount).toBe(1);
    expect(cat1).toHaveLength(1);
    expect(cat2).toEqual(cat1);
    expect(cat3).toEqual(cat1);
  });

  test('invalidate clears both catalog, barcode index, and negative caches', () => {
    productsCache.setCatalog([{ id: 1, name: 'Item', variants: [{ id: 2, barcode: 'BAR-99' }] }]);
    productsCache.recordNegativeBarcode('INVALID-1');

    productsCache.invalidate();

    expect(productsCache.getCatalog()).toBeNull();
    expect(productsCache.getByBarcode('BAR-99')).toBeNull();
    expect(productsCache.getByBarcode('INVALID-1')).toBeNull();
  });

  describe('refreshStock (after a sale or return)', () => {
    const catalog = () => [
      {
        id: 1,
        name: 'Shirt',
        variants: [
          { id: 10, barcode: 'BAR-10', sku: 'SKU-10', stock_quantity: 5 },
          { id: 11, barcode: 'BAR-11', sku: 'SKU-11', stock_quantity: 8 },
        ],
      },
    ];

    test('updates stock in the catalog and in barcode lookups without a rebuild', () => {
      productsCache.setCatalog(catalog());

      const applied = productsCache.refreshStock([
        { id: 10, stock_quantity: 3 },
        { id: 11, stock_quantity: 8 },
      ]);

      expect(applied).toBe(true);
      expect(productsCache.getCatalog()[0].variants[0].stock_quantity).toBe(3);
      expect(productsCache.getCatalog()[0].variants[1].stock_quantity).toBe(8);
      expect(productsCache.getByBarcode('BAR-10').stock_quantity).toBe(3);
      expect(productsCache.getByBarcode('SKU-10').stock_quantity).toBe(3);
    });

    test('drops the cache when the stock rows do not match the cached variants', () => {
      productsCache.setCatalog(catalog());

      // A variant the catalog has never seen means the catalog itself changed.
      const applied = productsCache.refreshStock([
        { id: 10, stock_quantity: 3 },
        { id: 11, stock_quantity: 8 },
        { id: 12, stock_quantity: 1 },
      ]);

      expect(applied).toBe(false);
      expect(productsCache.getCatalog()).toBeNull();
    });

    test('does nothing when no catalog is cached', () => {
      expect(productsCache.refreshStock([{ id: 10, stock_quantity: 3 }])).toBe(false);
      expect(productsCache.getCatalog()).toBeNull();
    });
  });
});
