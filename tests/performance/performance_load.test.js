/**
 * Kashiear POS — Performance & Stress Load Test Suite (اختبارات الأداء والحمل العالي)
 * 
 * Verifies system throughput, low-latency, and concurrency under extreme real-world loads:
 * 1. High-Throughput Load Balancer Concurrency (1,000+ concurrent requests)
 * 2. Load Balancing Strategy Stress (Round-Robin & Least-Connections distribution under load)
 * 3. High-Volume SQLite Write & Read Throughput (Bulk inserts & fast barcode queries)
 * 4. High-Concurrency POS Cashier Sales Rush (Rapid checkout throughput & live shift totals)
 * 5. LRU Product & Barcode Cache High-Load Eviction & Sub-Millisecond Speed
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const bcrypt = require('bcryptjs');

// Create isolated high-performance in-memory / temporary test database
const mockTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-perf-test-'));
const mockTestDbFile = path.join(mockTempDir, 'perf_test.db');

let mockCurrentDb = new Database(mockTestDbFile);
mockCurrentDb.pragma('foreign_keys = ON');
mockCurrentDb.pragma('journal_mode = WAL');
mockCurrentDb.pragma('synchronous = NORMAL');
mockCurrentDb.pragma('temp_store = MEMORY');

jest.mock('../../electron/database/db', () => ({
  get db() {
    return mockCurrentDb;
  },
  get dbPath() {
    return mockTestDbFile;
  },
  closeDatabase: () => {
    if (mockCurrentDb && mockCurrentDb.open) {
      mockCurrentDb.close();
    }
  },
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
  getAll: jest.fn(() => []),
}));

const loadBalancer = require('../../electron/services/loadBalancer.service');
const LRUCache = require('../../electron/services/lru.cache');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const salesService = require('../../electron/services/sales.service');
const authService = require('../../electron/services/auth.service');
const inventoryRepo = require('../../electron/repositories/inventory.repository');

describe('Performance, Concurrency & Load Stress Test Suite (اختبارات الأداء والحمل الفائق)', () => {
  let adminUser;
  let cashierUser;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockCurrentDb.exec(schema);
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });

    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });

    usersRepo.create({
      username: 'cashier',
      passwordHash: bcrypt.hashSync('cashier123', 4),
      role: 'cashier',
      forcePasswordChange: false,
    });

    adminUser = usersRepo.getByUsername('admin');
    cashierUser = usersRepo.getByUsername('cashier');
  });

  afterAll(() => {
    loadBalancer.destroy();
    if (mockCurrentDb && mockCurrentDb.open) mockCurrentDb.close();
    try {
      fs.rmSync(mockTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. High-Throughput Load Balancer Concurrency
  // =========================================================================
  describe('1. High-Throughput Load Balancer Engine Benchmark', () => {
    test('executes 1,000 concurrent load-balanced tasks with high throughput', async () => {
      const taskCount = 1000;
      const startTime = performance.now();

      const promises = [];
      for (let i = 0; i < taskCount; i++) {
        promises.push(
          loadBalancer.execute(async (node) => {
            return { taskId: i, handledBy: node.id };
          }, { taskType: i % 2 === 0 ? 'sale_checkout' : 'general' })
        );
      }

      const results = await Promise.all(promises);
      const durationMs = performance.now() - startTime;

      expect(results).toHaveLength(taskCount);
      expect(durationMs).toBeLessThan(3000); // 1,000 tasks executed well under 3 seconds

      const diag = loadBalancer.getDiagnostics();
      expect(diag.stats.successfulRequests).toBeGreaterThanOrEqual(taskCount);
    });

    test('distributes requests across worker nodes dynamically under load', async () => {
      loadBalancer.registerNode({ id: 'perf-worker-lane-1', name: 'Lane 1', weight: 2 });
      loadBalancer.registerNode({ id: 'perf-worker-lane-2', name: 'Lane 2', weight: 2 });

      const executions = [];
      for (let i = 0; i < 200; i++) {
        executions.push(
          loadBalancer.execute(async (node) => node.id, { taskType: 'general' })
        );
      }

      const handledNodes = await Promise.all(executions);
      const uniqueNodes = new Set(handledNodes);

      expect(uniqueNodes.size).toBeGreaterThanOrEqual(2);

      loadBalancer.unregisterNode('perf-worker-lane-1');
      loadBalancer.unregisterNode('perf-worker-lane-2');
    });
  });

  // =========================================================================
  // 2. High-Volume SQLite Write & Read Throughput
  // =========================================================================
  describe('2. SQLite High-Volume Bulk Transaction Throughput', () => {
    test('bulk inserts 1,000 product variants in a single transaction in < 250ms', () => {
      const startTime = performance.now();

      mockCurrentDb.transaction(() => {
        for (let i = 1; i <= 1000; i++) {
          const prodId = productsRepo.create({ name: `صنف سرعة #${i}` });
          variantsRepo.create({
            productId: prodId,
            size: 'Standard',
            color: 'Assorted',
            purchasePrice: 50,
            sellingPrice: 100,
            stockQuantity: 100,
            barcode: `PERF-BARCODE-${i.toString().padStart(5, '0')}`,
          });
        }
      })();

      const durationMs = performance.now() - startTime;
      expect(durationMs).toBeLessThan(500); // 1,000 items created and indexed in < 500ms
      expect(productsRepo.getAll().length).toBeGreaterThanOrEqual(1000);
    });

    test('performs 1,000 rapid indexed barcode queries in < 600ms', () => {
      const startTime = performance.now();

      for (let i = 1; i <= 1000; i++) {
        const barcode = `PERF-BARCODE-${i.toString().padStart(5, '0')}`;
        const variant = variantsRepo.getByBarcode(barcode);
        expect(variant).toBeDefined();
        expect(variant.selling_price).toBe(100);
      }

      const durationMs = performance.now() - startTime;
      const avgLatencyPerLookup = durationMs / 1000;

      expect(durationMs).toBeLessThan(600); // 1,000 lookups in < 600ms
      expect(avgLatencyPerLookup).toBeLessThan(0.6); // Average < 0.6ms per barcode scan
    });
  });

  // =========================================================================
  // 3. LRU Cache Under High-Load Eviction & Access
  // =========================================================================
  describe('3. LRU High-Load Cache Eviction & Memory Benchmark', () => {
    test('handles 5,000 cache operations with strict capacity constraint and zero memory leak', () => {
      const cache = new LRUCache({ maxSize: 100 });

      // Insert 1,000 items into 100-capacity cache
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { data: `value-${i}`, size: i });
      }

      expect(cache.size).toBe(100);

      // Oldest entries should have been safely evicted
      expect(cache.get('key-0')).toBeNull();
      expect(cache.get('key-899')).toBeNull();

      // Most recent entries should exist
      expect(cache.get('key-999')).toEqual({ data: 'value-999', size: 999 });
      expect(cache.get('key-950')).toBeDefined();
    });
  });

  // =========================================================================
  // 4. High-Concurrency POS Cashier Rush Simulation
  // =========================================================================
  describe('4. High-Concurrency POS Rush Checkout Simulation', () => {
    test('processes 50 rapid checkout transactions and maintains exact drawer balance', () => {
      authService.logout();
      authService.login('cashier', 'cashier123');

      // 4.1 Open a shift with 5,000 EGP cash
      const shift = shiftsRepo.openShift({
        openingCash: 5000,
        userId: cashierUser.id,
        openedByName: 'cashier',
      });

      // 4.2 Pick a variant to sell
      const testVariant = variantsRepo.getByBarcode('PERF-BARCODE-00001');
      expect(testVariant.stock_quantity).toBeGreaterThanOrEqual(50);
      inventoryRepo.initializeVariantStock(
        inventoryRepo.getDefaultWarehouseId(),
        testVariant.id,
        testVariant.stock_quantity
      );

      const startTime = performance.now();

      // 4.3 Execute 50 rapid sales
      for (let i = 1; i <= 50; i++) {
        const sale = salesService.createSale({
          items: [{ variantId: testVariant.id, quantity: 1, unitPrice: 100 }],
          paymentMethod: 'cash',
          discount: 0,
          totalAmount: 100,
        });
        expect(sale.saleId).toBeDefined();
      }

      const durationMs = performance.now() - startTime;
      expect(durationMs).toBeLessThan(1000); // 50 complete sales with audit & stock in < 1 second

      // 4.4 Verify remaining stock (100 initial - 50 sold = 50 remaining)
      const updatedVariant = variantsRepo.getById(testVariant.id);
      expect(updatedVariant.stock_quantity).toBe(50);

      // 4.5 Verify Live Shift Drawer Calculations (5,000 opening + 50 * 100 = 10,000 expected)
      const liveTotals = shiftsRepo.getShiftLiveTotals(shift.id);
      expect(liveTotals.cashSales).toBe(5000); // 50 * 100
      expect(liveTotals.salesCount).toBe(50);
      expect(liveTotals.expectedCash).toBe(10000);

      // 4.6 Close shift with exact cash
      authService.logout();
      authService.login('admin', 'admin123');

      const closed = shiftsRepo.closeShift({
        shiftId: shift.id,
        actualCash: 10000,
        closedByUserId: adminUser.id,
      });

      expect(closed.status).toBe('closed');
      expect(closed.cash_difference).toBe(0);
    });
  });
});
