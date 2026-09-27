/**
 * Kashiear POS - Postman Test HTTP Server
 * Exposes all backend services via a REST API on http://localhost:5000
 */

const http = require('node:http');
const url = require('node:url');

// Database initialization
const { initDatabase, migrateSalesTable, migrateUsersTable, migrateSuppliersTable, migrateShiftsTable, migrateReturnsTable, migrateSettingsTable, migrateNotificationsTable, migrateOrdersTables, migrateSubscriptionsTables, migrateCommissionsTables } = require('./electron/database/db');
initDatabase();
migrateSalesTable();
migrateUsersTable();
migrateSuppliersTable();
migrateShiftsTable();
migrateReturnsTable();
migrateSettingsTable();
migrateNotificationsTable();
migrateOrdersTables();
migrateSubscriptionsTables();
migrateCommissionsTables();

// Services
const authService = require('./electron/services/auth.service');
const productsService = require('./electron/services/products.service');
const salesService = require('./electron/services/sales.service');
const shiftsService = require('./electron/services/shifts.service');
const returnsService = require('./electron/services/returns.service');
const reportsService = require('./electron/services/reports.service');
const customersService = require('./electron/services/customers.service');
const purchasesService = require('./electron/services/purchases.service');
const suppliersRepo = require('./electron/repositories/suppliers.repository');
const notificationsService = require('./electron/services/notifications.service');
const settingsRepo = require('./electron/repositories/settings.repository');
const ordersService = require('./electron/services/orders.service');
const subscriptionsService = require('./electron/services/subscriptions.service');
const commissionsService = require('./electron/services/commissions.service');
const { getAllCategories } = require('./electron/services/categories.service');
const resilienceService = require('./electron/services/resilience.service');

resilienceService.startSystemBackbone().catch((err) => {
  console.error('Failed to start resilience workers:', err.message);
});

// Helper to send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data, null, 2));
}

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON Body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();
  const query = parsedUrl.query;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // -------------------------------------------------------------
    // Health / Root
    // -------------------------------------------------------------
    if (pathname === '/' || pathname === '/api') {
      return sendJSON(res, 200, {
        status: 'online',
        name: 'Kashiear POS REST API for Postman',
        version: '1.0.0',
        activeSession: authService.getCurrentSession(),
        endpoints: [
          'POST /api/auth/login',
          'POST /api/auth/logout',
          'GET  /api/auth/session',
          'GET  /api/products',
          'POST /api/products',
          'GET  /api/products/barcode/:barcode',
          'GET  /api/categories',
          'POST /api/sales',
          'GET  /api/sales/:id',
          'GET  /api/shifts/current',
          'POST /api/shifts/open',
          'POST /api/shifts/close',
          'POST /api/shifts/expenses',
          'GET  /api/shifts/kpis',
          'GET  /api/shifts',
          'GET  /api/returns/find-sale/:saleId',
          'POST /api/returns/process',
          'GET  /api/returns/recent',
          'GET  /api/customers',
          'POST /api/customers',
          'GET  /api/suppliers',
          'POST /api/suppliers',
          'GET  /api/purchases',
          'POST /api/purchases',
          'POST /api/purchases/payment',
          'GET  /api/reports?period=today',
          'GET  /api/notifications',
          'GET  /api/settings'
        ]
      });
    }

    // -------------------------------------------------------------
    // Auth & Users
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const session = authService.login(body.username, body.password);
      return sendJSON(res, 200, { success: true, session });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      authService.logout();
      return sendJSON(res, 200, { success: true, message: 'Logged out successfully' });
    }

    if (pathname === '/api/auth/session' && method === 'GET') {
      return sendJSON(res, 200, { session: authService.getCurrentSession() });
    }

    if (pathname === '/api/users' && method === 'GET') {
      return sendJSON(res, 200, authService.getAllUsers());
    }

    // -------------------------------------------------------------
    // Products & Categories
    // -------------------------------------------------------------
    if (pathname === '/api/products' && method === 'GET') {
      const products = productsService.getAllProductsWithVariants();
      return sendJSON(res, 200, products);
    }

    if (pathname === '/api/products' && method === 'POST') {
      const body = await parseBody(req);
      const result = productsService.addProductWithVariant(body);
      return sendJSON(res, 201, { success: true, productId: result });
    }

    if (pathname.startsWith('/api/products/barcode/') && method === 'GET') {
      const barcode = decodeURIComponent(pathname.replace('/api/products/barcode/', ''));
      const product = productsService.getProductByBarcode(barcode);
      if (!product) return sendJSON(res, 404, { error: 'Product not found' });
      return sendJSON(res, 200, product);
    }

    if (pathname === '/api/categories' && method === 'GET') {
      return sendJSON(res, 200, getAllCategories());
    }

    // -------------------------------------------------------------
    // Sales & POS
    // -------------------------------------------------------------
    if (pathname === '/api/sales' && method === 'POST') {
      const body = await parseBody(req);
      const result = salesService.createSale(body);
      return sendJSON(res, 201, { success: true, ...result });
    }

    if (pathname.startsWith('/api/sales/') && method === 'GET') {
      const saleId = Number(pathname.replace('/api/sales/', ''));
      const sale = salesService.getSaleById(saleId);
      if (!sale) return sendJSON(res, 404, { error: 'Sale not found' });
      return sendJSON(res, 200, sale);
    }

    // -------------------------------------------------------------
    // Shifts & Cash Drawer
    // -------------------------------------------------------------
    if (pathname === '/api/shifts/current' && method === 'GET') {
      const shift = shiftsService.getCurrentShift();
      return sendJSON(res, 200, shift || { message: 'No open shift currently' });
    }

    if (pathname === '/api/shifts/open' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.openShift(body);
      return sendJSON(res, 201, { success: true, shift: result });
    }

    if (pathname === '/api/shifts/close' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.closeShift(body);
      return sendJSON(res, 200, { success: true, result });
    }

    if (pathname === '/api/shifts/expenses' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.addShiftExpense(body);
      return sendJSON(res, 201, { success: true, expenseId: result });
    }

    if (pathname === '/api/shifts/kpis' && method === 'GET') {
      return sendJSON(res, 200, shiftsService.getShiftsKPIs());
    }

    if (pathname === '/api/shifts' && method === 'GET') {
      return sendJSON(res, 200, shiftsService.getAllShifts(query));
    }

    // -------------------------------------------------------------
    // Returns & Exchanges
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/returns/find-sale/') && method === 'GET') {
      const saleId = Number(pathname.replace('/api/returns/find-sale/', ''));
      const data = returnsService.findSale(saleId);
      return sendJSON(res, 200, data);
    }

    if (pathname === '/api/returns/process' && method === 'POST') {
      const body = await parseBody(req);
      const result = returnsService.processReturn(body);
      return sendJSON(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/returns/recent' && method === 'GET') {
      return sendJSON(res, 200, returnsService.getRecentReturns());
    }

    // -------------------------------------------------------------
    // Customers & Debts
    // -------------------------------------------------------------
    if (pathname === '/api/customers' && method === 'GET') {
      return sendJSON(res, 200, customersService.getAllCustomersWithStats());
    }

    if (pathname === '/api/customers' && method === 'POST') {
      const body = await parseBody(req);
      const id = customersService.addCustomer(body);
      return sendJSON(res, 201, { success: true, customerId: id });
    }

    // -------------------------------------------------------------
    // Suppliers & Purchases
    // -------------------------------------------------------------
    if (pathname === '/api/suppliers' && method === 'GET') {
      return sendJSON(res, 200, suppliersRepo.getAllWithStats());
    }

    if (pathname === '/api/suppliers' && method === 'POST') {
      const body = await parseBody(req);
      const id = suppliersRepo.create(body);
      return sendJSON(res, 201, { success: true, supplierId: id });
    }

    if (pathname === '/api/purchases' && method === 'GET') {
      return sendJSON(res, 200, purchasesService.getAllPurchases(query));
    }

    if (pathname === '/api/purchases' && method === 'POST') {
      const body = await parseBody(req);
      const result = purchasesService.createPurchase(body);
      return sendJSON(res, 201, { success: true, ...result });
    }

    if (pathname === '/api/purchases/payment' && method === 'POST') {
      const body = await parseBody(req);
      const result = purchasesService.recordPayment(body);
      return sendJSON(res, 200, { success: true, ...result });
    }

    // -------------------------------------------------------------
    // Reports & Analytics
    // -------------------------------------------------------------
    if (pathname === '/api/reports' && method === 'GET') {
      const period = query.period || 'today';
      if (!authService.getCurrentSession()) {
        return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      }
      return sendJSON(res, 200, reportsService.getFullReport(period));
    }

    // -------------------------------------------------------------
    // Notifications & Settings
    // -------------------------------------------------------------
    if (pathname === '/api/notifications' && method === 'GET') {
      return sendJSON(res, 200, notificationsService.getAll({ limit: Number(query.limit) || 20 }));
    }

    if (pathname === '/api/settings' && method === 'GET') {
      return sendJSON(res, 200, settingsRepo.getAll());
    }

    // -------------------------------------------------------------
    // Operations & Orders Center Endpoints
    // -------------------------------------------------------------
    if (pathname === '/api/orders' && method === 'GET') {
      return sendJSON(res, 200, ordersService.getOrders(query));
    }

    if (pathname === '/api/orders/stats' && method === 'GET') {
      return sendJSON(res, 200, ordersService.getOrderStats());
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = await parseBody(req);
      const { orderData, items } = body;
      const newOrder = ordersService.createOrder(orderData, items);
      return sendJSON(res, 201, { success: true, order: newOrder });
    }

    if (pathname === '/api/orders/status' && method === 'PATCH') {
      const body = await parseBody(req);
      const { orderId, status, description } = body;
      const updatedOrder = ordersService.updateOrderStatus(orderId, status, {}, description);
      return sendJSON(res, 200, { success: true, order: updatedOrder });
    }

    // -------------------------------------------------------------
    // Subscriptions & Packages Endpoints
    // -------------------------------------------------------------
    if (pathname === '/api/packages' && method === 'GET') {
      return sendJSON(res, 200, subscriptionsService.getAllPackages());
    }

    if (pathname === '/api/packages' && method === 'POST') {
      const body = await parseBody(req);
      const newPackage = subscriptionsService.createPackage(body);
      return sendJSON(res, 201, { success: true, package: newPackage });
    }

    if (pathname === '/api/subscriptions' && method === 'GET') {
      return sendJSON(res, 200, subscriptionsService.getAllSubscriptions(query));
    }

    if (pathname === '/api/subscriptions/stats' && method === 'GET') {
      return sendJSON(res, 200, subscriptionsService.getSubscriptionStats());
    }

    if (pathname === '/api/subscriptions' && method === 'POST') {
      const body = await parseBody(req);
      const sub = subscriptionsService.subscribeCustomer(body);
      return sendJSON(res, 201, { success: true, subscription: sub });
    }

    if (pathname === '/api/subscriptions/freeze' && method === 'POST') {
      const body = await parseBody(req);
      const { subscriptionId, reason } = body;
      const result = subscriptionsService.freezeSubscription(subscriptionId, reason);
      return sendJSON(res, 200, { success: true, subscription: result });
    }

    // -------------------------------------------------------------
    // Commissions & Incentives Endpoints
    // -------------------------------------------------------------
    if (pathname === '/api/commissions/rules' && method === 'GET') {
      return sendJSON(res, 200, commissionsService.getAllRules());
    }

    if (pathname === '/api/commissions/rules' && method === 'POST') {
      const body = await parseBody(req);
      const rule = commissionsService.createRule(body);
      return sendJSON(res, 201, { success: true, rule });
    }

    if (pathname === '/api/commissions/earnings' && method === 'GET') {
      return sendJSON(res, 200, commissionsService.getAllEarnings(query));
    }

    if (pathname === '/api/commissions/summary' && method === 'GET') {
      return sendJSON(res, 200, commissionsService.getSummaryKPIs());
    }

    if (pathname === '/api/commissions/payout' && method === 'POST') {
      const body = await parseBody(req);
      const { userId, amount, paymentMethod, notes } = body;
      const payoutId = commissionsService.payoutEarnings(userId, amount, paymentMethod, notes);
      return sendJSON(res, 200, { success: true, payoutId });
    }

    // -------------------------------------------------------------
    // System Central Nervous Backbone & Health Endpoints
    // -------------------------------------------------------------
    if (pathname === '/api/system/health' && method === 'GET') {
      return sendJSON(res, 200, resilienceService.getSystemBackboneHealth());
    }

    // Route Not Found
    return sendJSON(res, 404, { error: `Endpoint '${method} ${pathname}' not found` });

  } catch (err) {
    console.error('API Error:', err.message);
    return sendJSON(res, 400, { error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Kashiear POS REST API Server is running for Postman!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📑 Health Check: http://localhost:${PORT}/api`);
  console.log(`======================================================\n`);
});

server.on('close', () => {
  resilienceService.shutdownSystemBackbone();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await resilienceService.shutdownSystemBackbone();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
