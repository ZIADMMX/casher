/**
 * Kashiear POS - Modular Express REST API Server
 * Exposes all backend services via a REST API on http://127.0.0.1:5000
 */

require('dotenv').config();
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
const cors = require('cors');

// Database initialization & unified migrations
const { runAllMigrations } = require('./electron/database/db');
runAllMigrations();

// Services
const authService = require('./electron/services/auth.service');
const { getPermissionForApi } = require('./electron/security/permissions');
const { checkRateLimit } = require('./electron/services/rateLimiter');
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
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching whitelist
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev/testing mode
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// -------------------------------------------------------------
// Middleware: Body Parser with 2MB limit (Prevents Memory Exhaustion / DoS)
// -------------------------------------------------------------
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// -------------------------------------------------------------
// Middleware: Rate Limiter
// -------------------------------------------------------------
app.use(async (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  try {
    const allowed = await checkRateLimit(clientIp);
    if (!allowed) {
      res.set('Retry-After', '60');
      return res.status(429).json({
        error: 'تم تجاوز الحد الأقصى للطلبات (Rate Limit Exceeded). يرجى المحاولة بعد قليل.',
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
    activeSession: authService.getCurrentSession(),
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
  // 1. استثناء المسارات العامة (المصادقة وفحص صحة الخادم)
  if (req.path.startsWith('/auth/') || req.path === '/system/health') {
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

  // 4. فحص الصلاحيات المقيدة في خريطة الصلاحيات
  const permission = getPermissionForApi(`/api${req.path}`, req.method.toUpperCase());
  if (permission) {
    return authService.runWithPermission(permission, () => {
      try {
        authService.requirePermission(permission, token);
        next();
      } catch (err) {
        return res.status(403).json({ error: err.message || 'غير مصرح لك بتنفيذ هذا الإجراء' });
      }
    });
  }

  // المسارات غير المقيدة بصلاحية محددة يسمح بها طالما أن المستخدم مسجل دخول
  next();
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
const PORT = process.env.PORT || 5000;
const HOST = '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Kashiear POS REST API Server is running via Express!`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`📑 Health Check: http://${HOST}:${PORT}/api`);
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

module.exports = app;
