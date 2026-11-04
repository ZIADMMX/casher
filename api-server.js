/**
 * Kashiear POS - Modular Express REST API Server
 * Exposes all backend services via local HTTP and HTTPS REST endpoints.
 */

require('dotenv').config();
const https = require('node:https');
const {
  boosthis,
  enableTelemetry,
  mount,
} = require('@workspace/boosthis-runtime-node');

enableTelemetry({
  installId: process.env.BOOSTHIS_INSTALL_ID,
  inviteKey: process.env.BOOSTHIS_INVITE_KEY,
  issuesOnly: true,
});

const express = require('express');
const { applyCorsPolicy } = require('./electron/security/corsPolicy');

// Database initialization & unified migrations
const { runAllMigrations } = require('./electron/database/db');
runAllMigrations();

// Services
const authService = require('./electron/services/auth.service');
const { getPermissionForApi } = require('./electron/security/permissions');
const {
  checkRateLimit,
  checkRequestActionRateLimit,
  getClientIp,
  tryAcquireRequestSlot,
} = require('./electron/services/rateLimiter');
const resilienceService = require('./electron/services/resilience.service');

// Routes aggregator
const apiRoutes = require('./routes');

// Start resilience backbone
resilienceService.startSystemBackbone().catch((err) => {
  console.error('Failed to start resilience workers:', err.message);
});

const app = express();

// -------------------------------------------------------------
// Boosthis Performance Monitoring & Local Dashboard
// -------------------------------------------------------------
app.use(boosthis({ bubble: true }));
mount(app);

// -------------------------------------------------------------
// Middleware: CORS
// -------------------------------------------------------------
app.use((req, res, next) => {
  if (!applyCorsPolicy(req, res)) {
    return res.status(403).json({ error: 'هذا المصدر غير مسموح له بالاتصال بالخادم' });
  }
  if (req.method === 'OPTIONS') {
    return;
  }
  next();
});

app.use((req, res, next) => {
  const releaseSlot = tryAcquireRequestSlot();
  if (!releaseSlot) {
    res.set('Retry-After', '1');
    return res.status(503).json({ error: 'الخادم مشغول حاليًا، يرجى المحاولة بعد لحظات' });
  }
  res.once('finish', releaseSlot);
  res.once('close', releaseSlot);
  next();
});

// -------------------------------------------------------------
// Middleware: Body Parser with 2MB limit (Prevents Memory Exhaustion / DoS)
// -------------------------------------------------------------
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// -------------------------------------------------------------
// Middleware: Rate Limiter
// -------------------------------------------------------------
app.use(async (req, res, next) => {
  const clientIp = getClientIp(req);
  try {
    const allowed = await checkRateLimit(`express-api:${clientIp}`);
    if (!allowed) {
      res.set('Retry-After', '60');
      return res.status(429).json({
        error: 'تم تجاوز الحد الأقصى للطلبات (Rate Limit Exceeded). يرجى المحاولة بعد قليل.',
        retryAfterMs: 60000,
      });
    }
    next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    next();
  }
});

// -------------------------------------------------------------
// Root & Health Discovery Endpoints
// -------------------------------------------------------------
const rootHandler = (req, res) => {
  res.json({
    status: 'online',
    name: 'Kashiear POS REST API (Express)',
    version: '2.0.0',
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'GET  /api/auth/session',
      'GET  /api/auth/profile',
      'PUT  /api/auth/profile',
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
      'GET  /api/settings',
      'GET  /api/system/health',
    ],
  });
};

app.get('/', rootHandler);
app.get('/api', rootHandler);

// -------------------------------------------------------------
// Middleware: Security & Permissions Guard for /api
// -------------------------------------------------------------
app.use('/api', (req, res, next) => {
  // 1. استثناء المسارات العامة (تسجيل الدخول وفحص صحة الخادم فقط)
  if ((req.path === '/auth/login' && req.method === 'POST') || req.path === '/system/health') {
    return next();
  }

  // 2. التحقق من وجود Bearer Token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'رمز الدخول (Bearer Token) مطلوب' });
  }

  // 3. التحقق من التوكن واسترجاع الجلسة الحية للمستخدم
  const session = authService.getCurrentSession(token);
  if (!session) {
    return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي الصلاحية' });
  }

  // إرفاق بيانات المستخدم في الطلب للاستخدام في المسارات اللاحقة
  req.user = session;
  req.token = token;

  // 4. فحص الصلاحيات المقيدة في خريطة الصلاحيات
  // runWithSession يجعل الخدمات ترى جلسة صاحب التوكن بدل الجلسة الافتراضية المحفوظة
  const permission = getPermissionForApi(`/api${req.path}`, req.method.toUpperCase());
  return authService.runWithSession(session, () => authService.runWithPermission(permission, () => {
    if (permission) {
      try {
        authService.requirePermission(permission, token);
      } catch (err) {
        return res.status(403).json({ error: err.message || 'غير مصرح لك بتنفيذ هذا الإجراء' });
      }
    }
    // المسارات غير المقيدة بصلاحية محددة يسمح بها طالما أن المستخدم مسجل دخول
    next();
  }));
});

app.use('/api', async (req, res, next) => {
  try {
    const actionLimit = await checkRequestActionRateLimit(req, req.user?.id);
    if (actionLimit && !actionLimit.allowed) {
      res.set('Retry-After', String(Math.ceil(actionLimit.retryAfterMs / 1000)));
      return res.status(429).json({
        error: 'تم إيقاف هذه العملية مؤقتًا بسبب تكرار المحاولة. يرجى الانتظار قبل إعادة المحاولة.',
        retryAfterMs: actionLimit.retryAfterMs,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// Mount Modular API Routes
// -------------------------------------------------------------
app.use('/api', apiRoutes);

// -------------------------------------------------------------
// 404 Route Not Found Handler
// -------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint '${req.method} ${req.originalUrl}' not found` });
});

// -------------------------------------------------------------
// Centralized Error Handling Middleware
// -------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);
  const statusCode = err.statusCode || (err.message && err.message.includes('صلاحية') ? 403 : 400);
  res.status(statusCode).json({ error: err.message || 'Internal Server Error' });
});

// -------------------------------------------------------------
// Server Lifecycle & Graceful Shutdown
// -------------------------------------------------------------
const PORT       = Number(process.env.PORT)       || 5000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5001;
const HOST       = '127.0.0.1';

// HTTP Server (local tools / backward compat)
const httpServer = app.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`Kashiear POS REST API Server is running via Express!`);
  console.log(`  HTTP  -> http://${HOST}:${PORT}`);
  console.log(`  HTTPS -> https://${HOST}:${HTTPS_PORT}`);
  console.log(`Health: http://${HOST}:${PORT}/api`);
  console.log(`======================================================\n`);
});

// HTTPS Server
let httpsServer = null;
try {
  const { getOrCreateCert } = require('./electron/security/sslCert');
  const sslCreds = getOrCreateCert();
  httpsServer = https
    .createServer({ key: sslCreds.key, cert: sslCreds.cert }, app)
    .listen(HTTPS_PORT, HOST, () => {
      console.log(`[API] HTTPS listening on https://${HOST}:${HTTPS_PORT}`);
    });
} catch (err) {
  console.error('[API] HTTPS unavailable:', err.message);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    const forceExitTimer = setTimeout(() => process.exit(1), 5000).unref();
    const shutdown = async () => {
      try {
        await resilienceService.shutdownSystemBackbone();
        process.exitCode = 0;
      } catch (err) {
        console.error('[API] Graceful shutdown failed:', err);
        process.exitCode = 1;
      } finally {
        clearTimeout(forceExitTimer);
      }
    };

    const servers = [httpServer, httpsServer].filter(Boolean);
    Promise.all(servers.map((server) => new Promise((resolve) => {
      server.close((err) => {
        if (err) console.error('[API] Server close failed:', err);
        resolve();
      });
    }))).then(shutdown);
  });
}

module.exports = app;