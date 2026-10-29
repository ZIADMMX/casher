const http = require('node:http');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');

jest.mock('../../electron/services/auth.service', () => ({
  login: jest.fn(() => ({ success: true, token: 'mock-token', user: { id: 1, role: 'admin' } })),
  runWithSession: jest.fn((session, callback) => callback()),
  setPermissionContext: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('../../electron/services/session.service', () => ({
  verifyToken: jest.fn(() => ({ id: 1, role: 'admin' })),
  invalidateToken: jest.fn(),
}));

jest.mock('../../electron/services/products.service', () => ({
  getAllProductsWithVariants: jest.fn(() => [{
    id: 1,
    name: 'T-Shirt',
    barcode: '12345',
    variants: [{ id: 1, stock_quantity: 5 }],
  }]),
  getProductByBarcode: jest.fn((barcode) => ({ id: 1, name: 'T-Shirt', barcode })),
  addProductWithVariant: jest.fn((data) => ({ success: true, id: 10, ...data })),
  addVariantToProduct: jest.fn((productId, variant) => ({ success: true, productId, variant })),
  updateProduct: jest.fn((id, data) => ({ success: true, id, ...data })),
  updateVariant: jest.fn((id, data) => ({ success: true, id, ...data })),
  deleteProduct: jest.fn((productId) => ({ success: true, productId })),
  deleteVariant: jest.fn((variantId) => ({ success: true, variantId })),
}));

jest.mock('../../electron/services/sales.service', () => ({
  createSale: jest.fn((data) => ({ success: true, saleId: 101, ...data })),
  getSaleById: jest.fn((id) => ({ id, total_amount: 150 })),
}));

jest.mock('../../electron/services/shifts.service', () => ({
  getCurrentShift: jest.fn(() => ({ id: 5, status: 'open' })),
  openShift: jest.fn((data) => ({ success: true, shift: { id: 6, ...data } })),
  closeShift: jest.fn((data) => ({ success: true, ...data })),
  addShiftExpense: jest.fn((data) => ({ success: true, ...data })),
}));

jest.mock('../../electron/services/returns.service', () => ({
  processReturn: jest.fn((data) => ({ success: true, returnId: 201, ...data })),
  getRecentReturns: jest.fn(() => []),
}));

jest.mock('../../electron/services/customers.service', () => ({
  getAllCustomersWithStats: jest.fn(() => [{ id: 1, name: 'Ahmed' }]),
  addCustomer: jest.fn((data) => ({ success: true, id: 2, ...data })),
  recordCustomerPayment: jest.fn((data) => ({ success: true, ...data })),
}));

jest.mock('../../electron/services/reports.service', () => ({
  getReports: jest.fn(() => ({ totalSales: 1000 })),
}));

jest.mock('../../electron/services/notifications.service', () => ({
  getAll: jest.fn(() => []),
}));

jest.mock('../../electron/services/categories.service', () => ({
  getAllCategories: jest.fn(() => ['Clothes', 'Shoes']),
}));

jest.mock('../../electron/services/inventory.service', () => ({
  getBranches: jest.fn(() => []),
  createBranch: jest.fn(),
  updateBranch: jest.fn(),
  getWarehouses: jest.fn(() => []),
  createWarehouse: jest.fn(),
  updateWarehouse: jest.fn(),
  getStock: jest.fn(() => []),
  getMovementHistory: jest.fn(() => []),
  getTransfers: jest.fn(() => []),
  transferStock: jest.fn(),
  adjustStock: jest.fn(),
  setReorderLevel: jest.fn(),
  countStock: jest.fn(),
}));

jest.mock('../../electron/repositories/inventory.repository', () => ({
  getWarehouses: jest.fn(() => [{ id: 1, branch_id: 1, is_active: 1, branch_active: 1 }]),
  getStockQuantity: jest.fn(() => 10),
}));

jest.mock('../../electron/services/logger.service', () => ({
  logError: jest.fn(),
}));

const lanServer = require('../../electron/services/lanServer.service');

describe('LAN Server Service (Multi-Terminal Master Hub)', () => {
  const TEST_PORT = 5899;

  beforeAll(async () => {
    await lanServer.startServer(TEST_PORT);
  });

  afterAll(async () => {
    await lanServer.stopServer();
  });

  function makeRequest(path, options = {}, body = null) {
    return new Promise((resolve, reject) => {
      const payloadStr = body ? JSON.stringify(body) : null;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
        'X-Branch-Warehouse-Id': '1',
        ...(options.headers || {}),
      };
      if (headers['X-Branch-Warehouse-Id'] === null) delete headers['X-Branch-Warehouse-Id'];
      if (payloadStr) {
        headers['Content-Length'] = Buffer.byteLength(payloadStr);
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path,
          method: options.method || 'GET',
          headers,
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: rawData ? JSON.parse(rawData) : null,
              });
            } catch {
              resolve({ statusCode: res.statusCode, data: rawData });
            }
          });
        }
      );

      req.on('error', reject);
      if (payloadStr) {
        req.write(payloadStr);
      }
      req.end();
    });
  }

  test('getLocalIpAddresses returns non-empty array with interface names and IPv4 strings', () => {
    const ips = lanServer.getLocalIpAddresses();
    expect(Array.isArray(ips)).toBe(true);
    expect(ips.length).toBeGreaterThan(0);
    expect(ips[0]).toHaveProperty('interface');
    expect(ips[0]).toHaveProperty('address');
  });

  test('getStatus accurately reflects running server state', () => {
    const status = lanServer.getStatus();
    expect(status.isRunning).toBe(true);
    expect(status.port).toBe(TEST_PORT);
    expect(status.localIps.length).toBeGreaterThan(0);
  });

  test('responds to /api/health and OPTIONS preflight', async () => {
    // Test health endpoint
    const res = await makeRequest('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.data.status).toBe('online');
    expect(res.data.name).toContain('Kashiear POS');

    // Test CORS preflight (OPTIONS)
    const optionsRes = await makeRequest('/api/health', { method: 'OPTIONS' });
    expect(optionsRes.statusCode).toBe(204);
  });

  test('startServer resolves gracefully when already running', async () => {
    const secondStart = await lanServer.startServer(TEST_PORT);
    expect(secondStart.success).toBe(true);
    expect(secondStart.alreadyRunning).toBe(true);
  });

  test('REST API: /api/auth/login routes correctly', async () => {
    const res = await makeRequest('/api/auth/login', { method: 'POST' }, { username: 'admin', password: '123' });
    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.token).toBe('mock-token');
  });

  test('REST API: Products, Barcode, Categories endpoints', async () => {
    const prodRes = await makeRequest('/api/products');
    expect(prodRes.statusCode).toBe(200);
    expect(prodRes.data).toHaveLength(1);

    const barcodeRes = await makeRequest('/api/products/barcode/12345');
    expect(barcodeRes.statusCode).toBe(200);
    expect(barcodeRes.data.barcode).toBe('12345');

    const catRes = await makeRequest('/api/categories');
    expect(catRes.statusCode).toBe(200);
    expect(catRes.data).toContain('Clothes');
  });

  test('rejects catalog requests without a valid bearer token', async () => {
    const response = await makeRequest('/api/products', { headers: { Authorization: '' } });
    expect(response.statusCode).toBe(401);
  });

  test('requires a warehouse assignment before returning branch product stock', async () => {
    const response = await makeRequest('/api/products', {
      headers: { 'X-Branch-Warehouse-Id': null },
    });
    expect(response.statusCode).toBe(409);
    expect(response.data.error).toContain('تخصيص مخزن هذا الفرع');
  });

  test('REST API: Sales, Shifts, Returns, and Customers endpoints', async () => {
    const saleRes = await makeRequest('/api/sales/create', { method: 'POST' }, { total: 100, items: [] });
    expect(saleRes.statusCode).toBe(201);
    expect(saleRes.data.saleId).toBe(101);

    const shiftRes = await makeRequest('/api/shifts/current');
    expect(shiftRes.statusCode).toBe(200);
    expect(shiftRes.data.id).toBe(5);

    const custRes = await makeRequest('/api/customers');
    expect(custRes.statusCode).toBe(200);
    expect(custRes.data[0].name).toBe('Ahmed');
  });

  test('REST API: 404 on unknown routes', async () => {
    const res = await makeRequest('/api/non-existent-route');
    expect(res.statusCode).toBe(404);
    expect(res.data.error).toContain('Route not found');
  });

  if (process.env.RUN_LAN_STRESS === '1') {
    test('handles a sustained 10-terminal read load without server or event-loop stalls', async () => {
      jest.setTimeout(330000);
      const durationMs = 5 * 60 * 1000;
      const deadline = Date.now() + durationMs;
      const paths = [
        '/api/health',
        '/api/products',
        '/api/categories',
        '/api/shifts/current',
      ];
      const latencies = [];
      let successfulRequests = 0;
      const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
      const initialHeapBytes = process.memoryUsage().heapUsed;
      eventLoopDelay.enable();

      try {
        await Promise.all(Array.from({ length: 10 }, async () => {
          let requestIndex = 0;
          while (Date.now() < deadline) {
            const startedAt = performance.now();
            const response = await makeRequest(paths[requestIndex % paths.length]);
            latencies.push(performance.now() - startedAt);
            expect(response.statusCode).toBe(200);
            successfulRequests += 1;
            requestIndex += 1;
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }));
      } finally {
        eventLoopDelay.disable();
      }

      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95LatencyMs = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      const maxLatencyMs = sortedLatencies[sortedLatencies.length - 1];
      const eventLoopP99Ms = eventLoopDelay.percentile(99) / 1e6;
      const heapGrowthMb = (process.memoryUsage().heapUsed - initialHeapBytes) / (1024 * 1024);
      const finalStatus = lanServer.getStatus();

      console.info('LAN stress metrics:', JSON.stringify({
        terminals: 10,
        durationSeconds: 300,
        successfulRequests,
        p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
        maxLatencyMs: Number(maxLatencyMs.toFixed(2)),
        eventLoopP99Ms: Number(eventLoopP99Ms.toFixed(2)),
        heapGrowthMb: Number(heapGrowthMb.toFixed(2)),
        serverRunning: finalStatus.isRunning,
      }));

      expect(successfulRequests).toBeGreaterThanOrEqual(5000);
      expect(p95LatencyMs).toBeLessThan(500);
      expect(maxLatencyMs).toBeLessThan(2000);
      expect(eventLoopP99Ms).toBeLessThan(250);
      expect(finalStatus.isRunning).toBe(true);
      expect(finalStatus.totalRequests).toBeGreaterThanOrEqual(successfulRequests);
    }, 330000);
  }
});
