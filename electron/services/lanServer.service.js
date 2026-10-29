/**
 * Kashiear POS - High-Performance Multi-Terminal LAN Server
 * Powered by Node.js native HTTP module (Zero external dependencies).
 * Allows Kashiear to act as a Master Server for multiple Cashier Terminals on the local network.
 */

const http = require('node:http');
const os = require('node:os');
const { exec } = require('node:child_process');

const authService = require('./auth.service');
const { getPermissionForApi } = require('../security/permissions');
const productsService = require('./products.service');
const salesService = require('./sales.service');
const shiftsService = require('./shifts.service');
const returnsService = require('./returns.service');
const reportsService = require('./reports.service');
const customersService = require('./customers.service');
const notificationsService = require('./notifications.service');
const { getAllCategories } = require('./categories.service');
const { logError } = require('./logger.service');
const inventoryService = require('./inventory.service');
const inventoryRepo = require('../repositories/inventory.repository');
const appointmentsService = require('./appointments.service');

let httpServer = null;
let serverStartTime = null;
let requestCount = 0;
let serverPort = 5000;

/**
 * Retrieve all local IPv4 addresses for LAN connection
 */
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          interface: name,
          address: iface.address,
        });
      }
    }
  }

  if (ips.length === 0) {
    ips.push({ interface: 'loopback', address: '127.0.0.1' });
  }

  return ips;
}

/**
 * Helper to send JSON responses with CORS headers for local LAN clients
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  });
  res.end(JSON.stringify(data));
}

/**
 * Parse incoming JSON request body
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Protection against huge payloads (> 10MB)
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Extract and verify bearer token from Authorization header
 */
function authenticateRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const sessionService = require('./session.service');
    try {
      return sessionService.verifyToken(token);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Core Request Dispatcher for REST API
 */
async function handleApiRequest(req, res) {
  requestCount++;
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname || '';
  const method = req.method.toUpperCase();
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    });
    return res.end();
  }

  try {
    // -------------------------------------------------------------
    // Health & System Information
    // -------------------------------------------------------------
    if (pathname === '/api/health' || pathname === '/api/ping') {
      return sendJSON(res, 200, {
        status: 'online',
        name: 'Kashiear POS LAN Master Server',
        version: '1.0.0',
        uptime: serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) : 0,
        requestCount,
      });
    }

    // -------------------------------------------------------------
    // Authentication
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const result = authService.login(body.username, body.password);
      let defaultWarehouseId = null;
      try {
        defaultWarehouseId = inventoryRepo.getDefaultWarehouseId();
      } catch {}
      return sendJSON(res, 200, {
        ...result,
        defaultWarehouseId,
      });
    }

    if (pathname === '/api/auth/session' && method === 'GET') {
      const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
      const session = token ? authService.getCurrentSession(token) : null;
      let defaultWarehouseId = null;
      try {
        defaultWarehouseId = inventoryRepo.getDefaultWarehouseId();
      } catch {}
      return sendJSON(res, 200, { session, defaultWarehouseId });
    }

    if (pathname === '/api/auth/refresh' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
      const session = authenticateRequest(req);
      if (!token || !session) {
        return sendJSON(res, 401, { error: 'انتهت الجلسة أو بيانات الدخول غير صالحة' });
      }
      const refreshedToken = require('./session.service').refreshToken(token);
      return sendJSON(res, 200, {
        token: refreshedToken,
        user: authService.getCurrentSession(refreshedToken),
      });
    }

    if (pathname === '/api/auth/profile' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
      if (!token || !authenticateRequest(req)) {
        return sendJSON(res, 401, { error: 'انتهت الجلسة أو بيانات الدخول غير صالحة' });
      }
      const result = authService.updateProfile(await parseBody(req), token);
      require('./session.service').invalidateToken(token);
      return sendJSON(res, 200, result);
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
      if (!token || !authenticateRequest(req)) {
        return sendJSON(res, 401, { error: 'انتهت الجلسة أو بيانات الدخول غير صالحة' });
      }
      const body = await parseBody(req);
      const result = authService.changePassword(body.password, token);
      require('./session.service').invalidateToken(token);
      return sendJSON(res, 200, result);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
      if (!token || !authenticateRequest(req)) {
        return sendJSON(res, 401, { error: 'انتهت الجلسة أو بيانات الدخول غير صالحة' });
      }
      require('./session.service').invalidateToken(token);
      return sendJSON(res, 200, { success: true });
    }

    const session = authenticateRequest(req);
    if (!session) {
      return sendJSON(res, 401, { error: 'يلزم تسجيل الدخول عبر الخادم المركزي' });
    }

    const requestedWarehouseId = req.headers['x-branch-warehouse-id'];
    let requestSession = { ...session, centralRequest: true };
    const permission = getPermissionForApi(pathname, method);
    if (requestedWarehouseId != null) {
      const warehouseId = Number(requestedWarehouseId);
      if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
        return sendJSON(res, 400, { error: 'معرف مخزن الفرع غير صالح' });
      }
      const warehouse = inventoryRepo.getWarehouses().find((item) => (
        item.id === warehouseId && item.is_active && item.branch_active
      ));
      if (!warehouse) {
        return sendJSON(res, 403, { error: 'المخزن المخصص لهذا الجهاز غير نشط أو غير موجود' });
      }
      requestSession = {
        ...requestSession,
        warehouseId,
        branchId: warehouse.branch_id,
      };
    }

    return await authService.runWithSession(requestSession, async () => {
    authService.setPermissionContext(permission);
    authService.requirePermission(permission);
    // -------------------------------------------------------------
    // Products & Inventory Catalog
    // -------------------------------------------------------------
    if (pathname === '/api/products' && method === 'GET') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'يجب تخصيص مخزن هذا الفرع من صفحة إدارة الفروع قبل عرض الأصناف' });
      }
      const products = productsService.getAllProductsWithVariants().map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({
          ...variant,
          stock_quantity: inventoryRepo.getStockQuantity(requestSession.warehouseId, variant.id),
        })),
      }));
      return sendJSON(res, 200, products);
    }

    if (pathname.startsWith('/api/products/barcode/') && method === 'GET') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'يجب تخصيص مخزن هذا الفرع قبل البيع' });
      }
      const barcode = decodeURIComponent(pathname.replace('/api/products/barcode/', ''));
      const product = productsService.getProductByBarcode(barcode);
      if (product) {
        product.stock_quantity = inventoryRepo.getStockQuantity(requestSession.warehouseId, product.id);
      }
      return sendJSON(res, 200, product);
    }

    if (pathname === '/api/categories' && method === 'GET') {
      const categories = getAllCategories();
      return sendJSON(res, 200, categories);
    }

    if (pathname === '/api/returns/find-sale/' && method === 'GET') {
      return sendJSON(res, 400, { error: 'رقم الفاتورة مطلوب' });
    }

    if (pathname.startsWith('/api/returns/find-sale/') && method === 'GET') {
      const saleId = Number(pathname.replace('/api/returns/find-sale/', ''));
      return sendJSON(res, 200, returnsService.findSale(saleId));
    }

    if (pathname === '/api/products/add' && method === 'POST') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'عيّن مخزن هذا الجهاز قبل إضافة رصيد أصناف' });
      }
      const body = await parseBody(req);
      const result = productsService.addProductWithVariant(body);
      return sendJSON(res, 201, result);
    }

    if (pathname === '/api/products/add-variant' && method === 'POST') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'عيّن مخزن هذا الجهاز قبل إضافة رصيد أصناف' });
      }
      const body = await parseBody(req);
      return sendJSON(res, 201, productsService.addVariantToProduct(body.productId, body.variant));
    }

    if (pathname === '/api/products/update' && method === 'POST') {
      const body = await parseBody(req);
      const result = productsService.updateProduct(body.productId, body.data);
      return sendJSON(res, 200, result);
    }

    if (pathname === '/api/products/update-variant' && method === 'POST') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'عيّن مخزن هذا الجهاز قبل تعديل رصيد صنف' });
      }
      const body = await parseBody(req);
      return sendJSON(res, 200, productsService.updateVariant(body.variantId, body.data));
    }

    if (pathname === '/api/products/delete' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, productsService.deleteProduct(body.productId));
    }

    if (pathname === '/api/products/delete-variant' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, productsService.deleteVariant(body.variantId));
    }

    // -------------------------------------------------------------
    // Sales & Checkout
    // -------------------------------------------------------------
    if (pathname === '/api/sales/create' && method === 'POST') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'عيّن مخزن هذا الجهاز قبل البيع' });
      }
      const body = await parseBody(req);
      const result = salesService.createSale(body);
      return sendJSON(res, 201, result);
    }

    if (pathname === '/api/purchases/create' && method === 'POST') {
      if (!requestSession.warehouseId) {
        return sendJSON(res, 409, { error: 'عيّن مخزن هذا الجهاز قبل تسجيل فاتورة شراء' });
      }
      const body = await parseBody(req);
      body.warehouseId = requestSession.warehouseId;
      return sendJSON(res, 201, require('./purchases.service').createPurchase(body));
    }

    if (pathname.startsWith('/api/sales/') && method === 'GET') {
      const saleId = parseInt(pathname.replace('/api/sales/', ''), 10);
      const sale = salesService.getSaleById(saleId);
      return sendJSON(res, 200, sale);
    }

    // -------------------------------------------------------------
    // Shifts & Drawer Management (X/Z Reports)
    // -------------------------------------------------------------
    if (pathname === '/api/shifts/current' && method === 'GET') {
      const shift = shiftsService.getCurrentShift();
      return sendJSON(res, 200, shift);
    }

    if (pathname === '/api/shifts/open' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.openShift(body);
      return sendJSON(res, 201, result);
    }

    if (pathname === '/api/shifts/close' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.closeShift(body);
      return sendJSON(res, 200, result);
    }

    if (pathname === '/api/shifts/expense' && method === 'POST') {
      const body = await parseBody(req);
      const result = shiftsService.addShiftExpense(body);
      return sendJSON(res, 201, result);
    }

    // -------------------------------------------------------------
    // Returns & Refunds
    // -------------------------------------------------------------
    if (pathname === '/api/returns/process' && method === 'POST') {
      const body = await parseBody(req);
      const result = returnsService.processReturn(body);
      return sendJSON(res, 201, result);
    }

    if (pathname === '/api/returns/recent' && method === 'GET') {
      const returns = returnsService.getRecentReturns();
      return sendJSON(res, 200, returns);
    }

    // -------------------------------------------------------------
    // Customers & Ledger
    // -------------------------------------------------------------
    if (pathname === '/api/customers' && method === 'GET') {
      const customers = customersService.getAllCustomersWithStats();
      return sendJSON(res, 200, customers);
    }

    // -------------------------------------------------------------
    // Branches & Warehouses
    // -------------------------------------------------------------
    if (pathname === '/api/inventory/branches' && method === 'GET') {
      return sendJSON(res, 200, inventoryService.getBranches());
    }

    if (pathname === '/api/inventory/branches' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 201, inventoryService.createBranch(body));
    }

    const branchMatch = pathname.match(/^\/api\/inventory\/branches\/(\d+)$/);
    if (branchMatch && method === 'PUT') {
      const body = await parseBody(req);
      return sendJSON(res, 200, inventoryService.updateBranch(Number(branchMatch[1]), body));
    }

    if (pathname === '/api/inventory/warehouses' && method === 'GET') {
      const branchId = query.branchId == null ? null : Number(query.branchId);
      return sendJSON(res, 200, inventoryService.getWarehouses(branchId));
    }

    if (pathname === '/api/inventory/warehouses' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 201, inventoryService.createWarehouse(body));
    }

    const warehouseMatch = pathname.match(/^\/api\/inventory\/warehouses\/(\d+)$/);
    if (warehouseMatch && method === 'PUT') {
      const body = await parseBody(req);
      return sendJSON(res, 200, inventoryService.updateWarehouse(Number(warehouseMatch[1]), body));
    }

    if (pathname === '/api/inventory/stock' && method === 'GET') {
      return sendJSON(res, 200, inventoryService.getStock({
        warehouseId: query.warehouseId == null ? null : Number(query.warehouseId),
        lowStockOnly: query.lowStockOnly === 'true',
        search: query.search || '',
      }));
    }

    if (pathname === '/api/inventory/movements' && method === 'GET') {
      return sendJSON(res, 200, inventoryService.getMovementHistory({
        warehouseId: query.warehouseId == null ? null : Number(query.warehouseId),
        variantId: query.variantId == null ? null : Number(query.variantId),
        limit: query.limit == null ? undefined : Number(query.limit),
      }));
    }

    if (pathname === '/api/inventory/transfers' && method === 'GET') {
      return sendJSON(res, 200, inventoryService.getTransfers());
    }

    if (pathname === '/api/inventory/transfers' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 201, inventoryService.transferStock(body));
    }

    if (pathname === '/api/inventory/adjust' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, inventoryService.adjustStock(body));
    }

    if (pathname === '/api/inventory/reorder-level' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, inventoryService.setReorderLevel(body));
    }

    if (pathname === '/api/inventory/count' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 201, inventoryService.countStock(body));
    }

    if (pathname === '/api/appointments/resources' && method === 'GET') {
      return sendJSON(res, 200, appointmentsService.getResources({ activeOnly: query.activeOnly === 'true' }));
    }

    if (pathname === '/api/appointments/resources' && method === 'POST') {
      return sendJSON(res, 200, appointmentsService.saveResource(await parseBody(req)));
    }

    const appointmentResourceMatch = pathname.match(/^\/api\/appointments\/resources\/(\d+)$/);
    if (appointmentResourceMatch && method === 'GET') {
      return sendJSON(res, 200, appointmentsService.getResource(Number(appointmentResourceMatch[1])));
    }

    if (pathname === '/api/appointments/services' && method === 'GET') {
      return sendJSON(res, 200, appointmentsService.getServices({ activeOnly: query.activeOnly === 'true' }));
    }

    if (pathname === '/api/appointments/services' && method === 'POST') {
      return sendJSON(res, 200, appointmentsService.saveService(await parseBody(req)));
    }

    if (pathname === '/api/appointments/holidays' && method === 'GET') {
      return sendJSON(res, 200, appointmentsService.getHolidays({
        fromDate: query.fromDate,
        toDate: query.toDate,
      }));
    }

    if (pathname === '/api/appointments/holidays' && method === 'POST') {
      return sendJSON(res, 201, appointmentsService.saveHoliday(await parseBody(req)));
    }

    if (pathname === '/api/appointments/holidays/delete' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, appointmentsService.removeHoliday(body.id));
    }

    if (pathname === '/api/appointments/list' && method === 'GET') {
      return sendJSON(res, 200, appointmentsService.getAppointments({
        from: query.from,
        to: query.to,
        status: query.status,
      }));
    }

    if (pathname === '/api/appointments/create' && method === 'POST') {
      return sendJSON(res, 201, appointmentsService.createAppointment(await parseBody(req)));
    }

    if (pathname === '/api/appointments/status' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, appointmentsService.updateAppointmentStatus(body.id, body.status));
    }

    if (pathname === '/api/appointments/reschedule' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 200, appointmentsService.rescheduleAppointment(body.id, body.data));
    }

    if (pathname === '/api/appointments/convert' && method === 'POST') {
      const body = await parseBody(req);
      return sendJSON(res, 201, appointmentsService.convertToServiceOrder(body.id));
    }

    if (pathname === '/api/customers/add' && method === 'POST') {
      const body = await parseBody(req);
      const result = customersService.addCustomer(body);
      return sendJSON(res, 201, result);
    }

    if (pathname === '/api/customers/payment' && method === 'POST') {
      const body = await parseBody(req);
      const result = customersService.recordCustomerPayment(body);
      return sendJSON(res, 201, result);
    }

    // -------------------------------------------------------------
    // Reports & Analytics
    // -------------------------------------------------------------
    if (pathname === '/api/reports' && method === 'GET') {
      const period = query.period || 'today';
      const report = reportsService.getReports(period);
      return sendJSON(res, 200, report);
    }

    // -------------------------------------------------------------
    // Notifications
    // -------------------------------------------------------------
    if (pathname === '/api/notifications' && method === 'GET') {
      const notifications = notificationsService.getAll();
      return sendJSON(res, 200, notifications);
    }

    // Fallback 404
    return sendJSON(res, 404, { error: 'Route not found: ' + pathname });
    });
  } catch (err) {
    logError('LANServerAPI', err);
    return sendJSON(res, 400, { error: err.message || 'Internal Server Error' });
  }
}

/**
 * Start the LAN Server
 */
function startServer(port = 5000) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return Promise.resolve({
      success: false,
      message: 'رقم المنفذ غير صالح (يجب أن يكون رقماً صحيحاً بين 1 و 65535)',
    });
  }

  return new Promise((resolve, reject) => {
    if (httpServer) {
      return resolve({
        success: true,
        alreadyRunning: true,
        port: serverPort,
        ips: getLocalIpAddresses(),
      });
    }

    serverPort = numericPort;
    httpServer = http.createServer(handleApiRequest);

    httpServer.on('error', (err) => {
      logError('LANServerStart', err);
      httpServer = null;
      reject(err);
    });

    httpServer.listen(numericPort, '0.0.0.0', () => {
      serverStartTime = Date.now();
      resolve({
        success: true,
        port: numericPort,
        ips: getLocalIpAddresses(),
      });
    });
  });
}

/**
 * Stop the LAN Server
 */
function stopServer() {
  return new Promise((resolve) => {
    if (!httpServer) {
      return resolve({ success: true, notRunning: true });
    }

    httpServer.close(() => {
      httpServer = null;
      serverStartTime = null;
      resolve({ success: true });
    });
  });
}

/**
 * Automatically open or check Windows Firewall for LAN server port
 */
function openWindowsFirewallPort(port = 5000) {
  // تحقق دفاعي على مستوى الخدمة لمنع حقن الأوامر عبر المنفذ
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return Promise.resolve({
      success: false,
      message: 'رقم المنفذ غير صالح (يجب أن يكون رقماً صحيحاً بين 1 و 65535)',
    });
  }

  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({
        success: true,
        message: 'فتح جدار الحماية التلقائي مخصص لنظام Windows فقط',
      });
    }

    const ruleName = 'Kashiear POS Local Server';
    const checkCmd = `netsh advfirewall firewall show rule name="${ruleName}"`;

    exec(checkCmd, (_checkErr, checkStdout) => {
      // If rule already exists and is enabled
      if (checkStdout && checkStdout.includes(ruleName)) {
        return resolve({
          success: true,
          alreadyConfigured: true,
          message: 'قاعدة المنفذ مضافة ومفعلة بالفعل في جدار حماية Windows.',
        });
      }

      // Try adding rule directly
      const addCmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${numericPort} profile=any`;
      exec(addCmd, (err, _stdout, stderr) => {
        if (!err && (!stderr || !stderr.includes('elevation'))) {
          return resolve({
            success: true,
            message: `تم فتح المنفذ ${numericPort} بنجاح في جدار حماية Windows.`,
          });
        }

        // If requires elevation, invoke PowerShell with RunAs (shows UAC prompt)
        const elevatedCmd = `powershell -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\\"${ruleName}\\" dir=in action=allow protocol=TCP localport=${numericPort} profile=any' -Verb RunAs -Wait"`;
        exec(elevatedCmd, (elevatedErr) => {
          if (elevatedErr) {
            resolve({
              success: false,
              message: 'تعذر الحصول على صلاحية المسؤول لإضافة قاعدة جدار الحماية: ' + elevatedErr.message,
            });
          } else {
            resolve({
              success: true,
              message: `تم فتح المنفذ ${numericPort} في جدار حماية Windows بنجاح!`,
            });
          }
        });
      });
    });
  });
}

/**
 * Get Server Health and Status
 */
function getStatus() {
  return {
    isRunning: httpServer !== null,
    port: serverPort,
    hostname: os.hostname(),
    localIps: getLocalIpAddresses(),
    uptime: serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) : 0,
    totalRequests: requestCount,
  };
}

module.exports = {
  startServer,
  stopServer,
  getStatus,
  getLocalIpAddresses,
  handleApiRequest,
  openWindowsFirewallPort,
};
