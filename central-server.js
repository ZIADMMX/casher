/**
 * Kashiear / FOX.CLOUD POS - Enterprise Central Backend API Server
 * Native High-Performance Node.js Engine with Read/Write Splitting
 */

const http = require('node:http');
const url = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { applyCorsPolicy } = require('./electron/security/corsPolicy');

const { writePool, queryWrite, queryRead, checkHealth, ensureDatabaseReady } = require('./electron/database/dbPool');
const { personalProfileSchema, reviewSchema } = require('./electron/validators/schema');
const { COURT_TYPES, validateCourtInput, isCourtId } = require('./electron/validators/courts');
const {
  createCentralSale,
  getCentralKitchenOrders,
  updateCentralKitchenOrderStatus,
  createCentralProduct,
  PosError,
} = require('./electron/services/centralPos.service');

// Parse command line arguments for port and instance ID
const args = process.argv.slice(2);
let argPort = null;
let argInstance = null;
for (const a of args) {
  if (a.startsWith('--port=')) argPort = Number(a.split('=')[1]);
  if (a.startsWith('--instance=')) argInstance = a.split('=')[1];
}

const PORT = argPort || Number(process.env.PORT) || 5000;
// Nodes sit behind load-balancer.js on the same machine; set CENTRAL_BIND_HOST to expose a node directly.
const BIND_HOST = process.env.CENTRAL_BIND_HOST || '127.0.0.1';
// Short-lived tokens; the desktop client refreshes them periodically via /api/auth/refresh.
const TOKEN_TTL = process.env.CENTRAL_TOKEN_TTL || '8h';
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
const INSTANCE_ID = argInstance || process.env.INSTANCE_ID || `api-node-${PORT}`;

// Enforce strong JWT_SECRET: Reject hardcoded fallbacks and insecure default secrets
const INSECURE_DEFAULT_SECRETS = new Set([
  'oonyx_super_master_secret_2026',
  'secret',
  'jwt_secret',
  '123456',
  'admin123',
  'changeme',
]);

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim() || INSECURE_DEFAULT_SECRETS.has(JWT_SECRET.trim())) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ [FATAL SECURITY ERROR]: A strong, non-default JWT_SECRET must be explicitly defined in environment variables for production!');
    process.exit(1);
  }
  // Generate a cryptographically secure random key for development/ephemeral session
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️ [SECURITY WARNING]: JWT_SECRET was missing or set to an insecure default. Generated an ephemeral secure random secret.');
}

const serverStartTime = Date.now();
let totalRequestsHandled = 0;

// Helper: send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Instance-ID': INSTANCE_ID,
    'X-Server-Port': String(PORT),
  });
  res.end(JSON.stringify(data, null, 2));
}

// Helper: parse JSON request body (Default 2MB limit to prevent memory exhaustion / DoS)
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MegaBytes
function parseBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodySize = 0;
    req.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > maxBytes) {
        req.destroy(); // قطع الاتصال فوراً لحماية الرام وشبكة السيرفر
        const err = new Error('حجم البيانات المرسلة تجاوز الحد المسموح (2MB)');
        err.statusCode = 413;
        return reject(err);
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        const err = new Error('صيغة JSON غير صالحة');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Helper: JWT authentication & Role verification
function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  try {
    return jwt.verify(parts[1], JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

// 6 Enterprise Sector Profiles Registry
const ENTERPRISE_PROFILES = [
  { key: 'retail', name: '🛍️ تجزئة وملابس (Retail & Apparel)', modules: ['pos', 'inventory', 'crm', 'reports', 'settings'] },
  { key: 'electronics', name: '💻 إلكترونيات وتكنولوجيا (Electronics & Tech)', modules: ['pos', 'inventory', 'commissions', 'reports', 'settings'] },
  { key: 'maintenance', name: '🛠️ ورشة صيانة وخدمات (Maintenance & Repair)', modules: ['crm', 'inventory', 'pos', 'reports', 'settings'] },
  { key: 'subscriptions_gym', name: '🏋️ جيم واشتراكات (Gym & Subscriptions)', modules: ['subscriptions', 'pos', 'crm', 'reports', 'settings'] },
  { key: 'grocery', name: '🛒 سوبرماركت وبقالة (Grocery & Supermarket)', modules: ['pos', 'inventory', 'purchases', 'reports', 'settings'] },
  { key: 'spare_parts', name: '🚘 قطع غيار وسيارات (Auto Spare Parts)', modules: ['inventory', 'pos', 'purchases', 'reports', 'settings'] },
];

const {
  checkActionRateLimit,
  checkRateLimit,
  checkRequestActionRateLimit,
  getClientIp,
  tryAcquireRequestSlot,
} = require('./electron/services/rateLimiter');
let profileSchemaMigration = null;
let reviewsSchemaMigration = null;
let posSchemaMigration = null;
let courtsSchemaMigration = null;

async function ensurePosSchema() {
  if (!posSchemaMigration) {
    const schemaPath = path.join(__dirname, 'electron', 'database', 'postgres-pos-schema.sql');
    posSchemaMigration = writePool.query(fs.readFileSync(schemaPath, 'utf8')).catch((error) => {
      posSchemaMigration = null;
      throw error;
    });
  }
  await posSchemaMigration;
}

async function ensureProfileSchema() {
  if (!profileSchemaMigration) {
    profileSchemaMigration = queryWrite(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS gender TEXT CHECK(gender IS NULL OR gender IN ('male', 'female', 'prefer_not_to_say')),
        ADD COLUMN IF NOT EXISTS date_of_birth DATE,
        ADD COLUMN IF NOT EXISTS country TEXT,
        ADD COLUMN IF NOT EXISTS city TEXT,
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS first_name TEXT,
        ADD COLUMN IF NOT EXISTS last_name TEXT,
        ADD COLUMN IF NOT EXISTS full_name TEXT,
        ADD COLUMN IF NOT EXISTS email TEXT,
        ADD COLUMN IF NOT EXISTS phone TEXT
    `).catch((error) => {
      profileSchemaMigration = null;
      throw error;
    });
  }
  await profileSchemaMigration;
}

async function ensureReviewsSchema() {
  if (!reviewsSchemaMigration) {
    reviewsSchemaMigration = queryWrite(`
      CREATE TABLE IF NOT EXISTS reviews (
        tenant_id TEXT NOT NULL,
        user_id BIGINT NOT NULL,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'hidden')),
        sector TEXT,
        app_version TEXT,
        consent BOOLEAN NOT NULL DEFAULT FALSE,
        business_name TEXT,
        business_logo TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, user_id),
        CHECK (comment IS NULL OR (char_length(comment) = 0 OR char_length(comment) >= 20)),
        CHECK (consent OR (business_name IS NULL AND business_logo IS NULL))
      )
    `).catch((error) => {
      reviewsSchemaMigration = null;
      throw error;
    });
  }
  await reviewsSchemaMigration;
}

async function ensureCourtsSchema() {
  if (!courtsSchemaMigration) {
    courtsSchemaMigration = writePool.query(`
      CREATE TABLE IF NOT EXISTS courts (
        id UUID PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        court_type TEXT NOT NULL CHECK (court_type IN (
          'first_instance', 'cassation', 'appeals', 'family',
          'criminal', 'commercial', 'labor', 'administrative'
        )),
        specialization TEXT,
        notes TEXT,
        phone TEXT,
        city TEXT,
        address TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_courts_tenant_name_active
        ON courts (tenant_id, LOWER(name)) WHERE is_active = TRUE;
      CREATE INDEX IF NOT EXISTS idx_courts_tenant_type_active
        ON courts (tenant_id, court_type, is_active);
    `).catch((error) => {
      courtsSchemaMigration = null;
      throw error;
    });
  }
  await courtsSchemaMigration;
}

const server = http.createServer(async (req, res) => {
  if (!applyCorsPolicy(req, res)) {
    return sendJSON(res, 403, { error: 'هذا المصدر غير مسموح له بالاتصال بالخادم' });
  }
  if (req.method === 'OPTIONS') {
    return;
  }

  const releaseSlot = tryAcquireRequestSlot();
  if (!releaseSlot) {
    res.setHeader('Retry-After', '1');
    return sendJSON(res, 503, { error: 'الخادم مشغول حاليًا، يرجى المحاولة بعد لحظات' });
  }
  res.once('finish', releaseSlot);
  res.once('close', releaseSlot);

  const session = authenticate(req);
  const actionLimit = await checkRequestActionRateLimit(req, session?.id, { trustProxy: true });
  if (actionLimit && !actionLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(actionLimit.retryAfterMs / 1000)));
    return sendJSON(res, 429, {
      error: 'تم إيقاف هذه العملية مؤقتًا بسبب تكرار المحاولة. يرجى الانتظار قبل إعادة المحاولة.',
      retryAfterMs: actionLimit.retryAfterMs,
    });
  }

  const clientIp = getClientIp(req, { trustProxy: true });
  if (!await checkRateLimit(`central-api:${clientIp}`)) {
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': '60'
    });
    return res.end(JSON.stringify({
      error: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد قليل.',
      retryAfterMs: 60000,
    }));
  }

  totalRequestsHandled++;
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  try {
    // -------------------------------------------------------------
    // 1. Health & Server Info
    // -------------------------------------------------------------
    if (pathname === '/api' || pathname === '/api/health') {
      // Public liveness only; database, memory and traffic details are in /api/admin/health.
      const dbHealth = await checkHealth();
      return sendJSON(res, 200, {
        status: dbHealth.primary.status === 'OK' ? 'ONLINE' : 'DEGRADED',
        service: 'FOX.CLOUD Master Central Engine',
      });
    }

    // -------------------------------------------------------------
    // 2. Authentication (Login)
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        return sendJSON(res, 400, { error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      // Per-account limit so rotating client addresses cannot brute-force one user.
      const accountLimit = await checkActionRateLimit(
        `account:${String(username).trim().toLowerCase()}`,
        'POST /api/auth/login'
      );
      if (!accountLimit.allowed) {
        res.setHeader('Retry-After', String(Math.ceil(accountLimit.retryAfterMs / 1000)));
        return sendJSON(res, 429, {
          error: 'تم إيقاف تسجيل الدخول لهذا الحساب مؤقتًا بسبب كثرة المحاولات',
          retryAfterMs: accountLimit.retryAfterMs,
        });
      }

      const userRes = await queryRead('SELECT * FROM users WHERE username = $1 LIMIT 1', [username.trim()]);
      const user = userRes.rows[0];
      // Compare against a dummy hash for unknown users so timing does not reveal them.
      const isMatch = bcrypt.compareSync(String(password), user ? user.password_hash : DUMMY_PASSWORD_HASH);
      if (!user || !isMatch) {
        return sendJSON(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }
      if (!user.is_active) {
        return sendJSON(res, 403, { error: 'هذا الحساب معطل حالياً' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: TOKEN_TTL }
      );

      return sendJSON(res, 200, {
        token,
        user: { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id },
      });
    }

    // -------------------------------------------------------------
    // Check Auth for all /api/admin/* and protected routes
    // -------------------------------------------------------------
    // The token only proves identity; role, branch and active state come from the
    // database so a disabled or demoted user loses access immediately.
    let currentUser = authenticate(req);
    if (currentUser?.id) {
      const liveUser = await queryRead(
        'SELECT id, username, role, branch_id, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      const user = liveUser.rows[0];
      currentUser = user && user.is_active
        ? { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id }
        : null;
    }

    if (pathname === '/api/courts' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensureCourtsSchema();
      const page = Number(parsedUrl.query.page || 1);
      const pageSize = Number(parsedUrl.query.pageSize || 10);
      const status = parsedUrl.query.status || 'active';
      const courtType = parsedUrl.query.courtType || '';
      const search = String(parsedUrl.query.search || '').trim().slice(0, 180);
      if (!Number.isSafeInteger(page) || page < 1
        || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
        || !['active', 'inactive', 'all'].includes(status)
        || (courtType && !COURT_TYPES.includes(courtType))) {
        return sendJSON(res, 400, { error: 'معايير البحث أو التصفح غير صالحة' });
      }

      const tenantId = currentUser.branch_id == null ? 'central' : `branch:${currentUser.branch_id}`;
      const filters = [tenantId];
      let where = 'tenant_id = $1';
      if (search) {
        filters.push(`%${search}%`);
        where += ` AND (name ILIKE $${filters.length} OR city ILIKE $${filters.length} OR specialization ILIKE $${filters.length})`;
      }
      if (courtType) {
        filters.push(courtType);
        where += ` AND court_type = $${filters.length}`;
      }
      if (status !== 'all') {
        filters.push(status === 'active');
        where += ` AND is_active = $${filters.length}`;
      }

      const countResult = await queryRead(`SELECT COUNT(*)::INTEGER AS count FROM courts WHERE ${where}`, filters);
      const listParams = [...filters, pageSize, (page - 1) * pageSize];
      const courts = await queryRead(
        `SELECT id, name, court_type, specialization, notes, phone, city, address,
                is_active, created_at, updated_at
         FROM courts WHERE ${where}
         ORDER BY name
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );
      return sendJSON(res, 200, {
        items: courts.rows,
        total: countResult.rows[0]?.count || 0,
        page,
        pageSize,
      });
    }

    if (pathname === '/api/courts' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      if (currentUser.role !== 'admin') return sendJSON(res, 403, { error: 'صلاحية المدير مطلوبة' });
      await ensureCourtsSchema();
      let data;
      try {
        data = validateCourtInput(await parseBody(req));
      } catch (error) {
        return sendJSON(res, 400, { error: error.message });
      }
      const tenantId = currentUser.branch_id == null ? 'central' : `branch:${currentUser.branch_id}`;
      try {
        const created = await queryWrite(
          `INSERT INTO courts (id, tenant_id, name, court_type, specialization, notes, phone, city, address, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, name, court_type, specialization, notes, phone, city, address,
                     is_active, created_at, updated_at`,
          [crypto.randomUUID(), tenantId, data.name, data.court_type, data.specialization || null,
            data.notes || null, data.phone || null, data.city || null, data.address || null, currentUser.id]
        );
        return sendJSON(res, 201, created.rows[0]);
      } catch (error) {
        if (error.code === '23505') return sendJSON(res, 409, { error: 'يوجد محكمة نشطة بهذا الاسم بالفعل' });
        throw error;
      }
    }

    const courtPathMatch = pathname.match(/^\/api\/courts\/([^/]+)$/);
    if (courtPathMatch && ['GET', 'PUT', 'DELETE'].includes(method)) {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      if (!isCourtId(courtPathMatch[1])) return sendJSON(res, 400, { error: 'معرّف المحكمة غير صالح' });
      await ensureCourtsSchema();
      const tenantId = currentUser.branch_id == null ? 'central' : `branch:${currentUser.branch_id}`;
      if (method === 'GET') {
        const result = await queryRead(
          `SELECT id, name, court_type, specialization, notes, phone, city, address,
                  is_active, created_at, updated_at
           FROM courts WHERE id = $1 AND tenant_id = $2`,
          [courtPathMatch[1], tenantId]
        );
        return result.rows[0]
          ? sendJSON(res, 200, result.rows[0])
          : sendJSON(res, 404, { error: 'المحكمة غير موجودة' });
      }
      if (currentUser.role !== 'admin') return sendJSON(res, 403, { error: 'صلاحية المدير مطلوبة' });

      if (method === 'DELETE') {
        const result = await queryWrite(
          `UPDATE courts SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2
           RETURNING id, name, court_type, specialization, notes, phone, city, address,
                     is_active, created_at, updated_at`,
          [courtPathMatch[1], tenantId]
        );
        return result.rows[0]
          ? sendJSON(res, 200, result.rows[0])
          : sendJSON(res, 404, { error: 'المحكمة غير موجودة' });
      }

      let data;
      try {
        data = validateCourtInput(await parseBody(req), { partial: true });
      } catch (error) {
        return sendJSON(res, 400, { error: error.message });
      }
      const columns = {
        name: 'name',
        court_type: 'court_type',
        specialization: 'specialization',
        notes: 'notes',
        phone: 'phone',
        city: 'city',
        address: 'address',
        is_active: 'is_active',
      };
      const fields = Object.keys(data).filter((field) => columns[field]);
      if (!fields.length) return sendJSON(res, 400, { error: 'لا توجد بيانات لتحديثها' });
      const values = fields.map((field) => data[field]);
      const assignments = fields.map((field, index) => `${columns[field]} = $${index + 3}`);
      assignments.push('updated_at = CURRENT_TIMESTAMP');
      try {
        const result = await queryWrite(
          `UPDATE courts SET ${assignments.join(', ')}
           WHERE id = $1 AND tenant_id = $2
           RETURNING id, name, court_type, specialization, notes, phone, city, address,
                     is_active, created_at, updated_at`,
          [courtPathMatch[1], tenantId, ...values]
        );
        return result.rows[0]
          ? sendJSON(res, 200, result.rows[0])
          : sendJSON(res, 404, { error: 'المحكمة غير موجودة' });
      } catch (error) {
        if (error.code === '23505') return sendJSON(res, 409, { error: 'يوجد محكمة نشطة بهذا الاسم بالفعل' });
        throw error;
      }
    }

    if (pathname === '/api/inventory/branches' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const branchResult = await writePool.query(
        `SELECT id, name, address, phone, is_active, created_at
         FROM branches
         WHERE ($1::INTEGER IS NULL OR id = $1)
         ORDER BY id`,
        [currentUser.branch_id ?? null]
      );
      return sendJSON(res, 200, branchResult.rows);
    }

    if (pathname === '/api/inventory/branches' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      if (currentUser.role !== 'admin') return sendJSON(res, 403, { error: 'صلاحية المدير مطلوبة' });
      await ensurePosSchema();
      const body = await parseBody(req);
      if (!String(body.name || '').trim()) return sendJSON(res, 400, { error: 'اسم الفرع مطلوب' });
      const client = await writePool.connect();
      try {
        await client.query('BEGIN');
        const branch = await client.query(
          `INSERT INTO branches (name, address, phone, is_active)
           VALUES ($1, $2, $3, TRUE) RETURNING *`,
          [String(body.name).trim(), body.address || null, body.phone || null]
        );
        const warehouse = await client.query(
          `INSERT INTO warehouses (branch_id, name, is_default)
           VALUES ($1, 'المخزن الرئيسي', TRUE) RETURNING *`,
          [branch.rows[0].id]
        );
        await client.query('COMMIT');
        return sendJSON(res, 201, { ...branch.rows[0], warehouse: warehouse.rows[0] });
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        if (error.code === '23505') return sendJSON(res, 409, { error: 'اسم الفرع مستخدم بالفعل' });
        throw error;
      } finally {
        client.release();
      }
    }

    if (pathname === '/api/inventory/warehouses' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const branchId = Number(parsedUrl.query.branchId) || currentUser.branch_id || null;
      const warehouses = await writePool.query(
        `SELECT w.*, b.name AS branch_name, b.is_active AS branch_active
         FROM warehouses w JOIN branches b ON b.id = w.branch_id
         WHERE ($1::INTEGER IS NULL OR w.branch_id = $1)
           AND ($2::INTEGER IS NULL OR w.branch_id = $2)
         ORDER BY b.id, w.id`,
        [currentUser.branch_id ?? null, branchId]
      );
      return sendJSON(res, 200, warehouses.rows);
    }

    if (pathname === '/api/inventory/warehouses' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      if (currentUser.role !== 'admin') return sendJSON(res, 403, { error: 'صلاحية المدير مطلوبة' });
      await ensurePosSchema();
      const body = await parseBody(req);
      const branchId = Number(body.branchId);
      if (!Number.isSafeInteger(branchId) || branchId <= 0 || !String(body.name || '').trim()) {
        return sendJSON(res, 400, { error: 'الفرع واسم المخزن مطلوبان' });
      }
      if (currentUser.branch_id != null && Number(currentUser.branch_id) !== branchId) {
        return sendJSON(res, 403, { error: 'لا يمكنك إنشاء مخزن في فرع آخر' });
      }
      const created = await writePool.query(
        `INSERT INTO warehouses (branch_id, name, is_default)
         VALUES ($1, $2, NOT EXISTS (SELECT 1 FROM warehouses WHERE branch_id = $1))
         RETURNING *`,
        [branchId, String(body.name).trim()]
      );
      return sendJSON(res, 201, created.rows[0]);
    }

    if (pathname === '/api/inventory/transfers' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      return sendJSON(res, 200, []);
    }

    if (pathname === '/api/categories' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const categories = await writePool.query('SELECT id, name FROM categories ORDER BY name');
      return sendJSON(res, 200, categories.rows);
    }

    if (pathname === '/api/products/add' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const body = await parseBody(req);
      const requestedWarehouseId = Number(req.headers['x-branch-warehouse-id']);
      try {
        const result = await createCentralProduct({
          userId: currentUser.id,
          warehouseId: Number.isSafeInteger(requestedWarehouseId) && requestedWarehouseId > 0
            ? requestedWarehouseId
            : null,
          productData: body,
          variantData: body,
        });
        return sendJSON(res, 201, result);
      } catch (error) {
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        throw error;
      }
    }

    if (pathname === '/api/products/add-variant' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const body = await parseBody(req);
      const requestedWarehouseId = Number(req.headers['x-branch-warehouse-id']);
      try {
        const result = await createCentralProduct({
          userId: currentUser.id,
          warehouseId: Number.isSafeInteger(requestedWarehouseId) && requestedWarehouseId > 0
            ? requestedWarehouseId
            : null,
          productData: {},
          variantData: body.variant,
          productId: Number(body.productId),
        });
        return sendJSON(res, 201, result);
      } catch (error) {
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        throw error;
      }
    }

    if (pathname === '/api/products' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const warehouseId = Number(req.headers['x-branch-warehouse-id']);
      const productResult = await writePool.query(
        `SELECT p.id, p.name, p.description, p.category_id,
           c.name AS category_name, c.name AS "categoryName", p.image_path, p.created_at,
           COALESCE(json_agg(json_build_object(
             'id', pv.id, 'product_id', pv.product_id, 'size', pv.size, 'color', pv.color,
             'sku', pv.sku, 'barcode', pv.barcode, 'purchase_price',
             CASE WHEN $2 = 'admin' THEN pv.purchase_price ELSE 0 END,
             'selling_price', pv.selling_price,
             'stock_quantity', COALESCE(ws.quantity, 0),
             'low_stock_threshold', pv.low_stock_threshold
           )) FILTER (WHERE pv.id IS NOT NULL), '[]'::json) AS variants
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN warehouse_stock ws ON ws.variant_id = pv.id AND ws.warehouse_id = $1
         WHERE p.is_active = TRUE
         GROUP BY p.id, c.name
         ORDER BY p.created_at DESC`,
        [Number.isSafeInteger(warehouseId) && warehouseId > 0 ? warehouseId : null, currentUser.role]
      );
      return sendJSON(res, 200, productResult.rows);
    }

    if (pathname === '/api/attendance/me/today' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const attendance = await queryWrite(
        `SELECT id, user_id, attendance_date::TEXT AS attendance_date, check_in, check_out
         FROM attendance_records
         WHERE user_id = $1 AND attendance_date = CURRENT_DATE`,
        [currentUser.id]
      );
      return sendJSON(res, 200, attendance.rows[0] || null);
    }

    if (pathname === '/api/attendance/check-in' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      await parseBody(req);
      const user = await queryWrite(
        'SELECT id, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      if (!user.rows[0]?.is_active) {
        return sendJSON(res, 403, { error: 'الحساب غير نشط أو غير موجود' });
      }
      const attendance = await queryWrite(
        `INSERT INTO attendance_records (user_id)
         VALUES ($1)
         ON CONFLICT (user_id, attendance_date) DO NOTHING
         RETURNING id`,
        [currentUser.id]
      );
      if (!attendance.rowCount) {
        return sendJSON(res, 409, { error: 'تم تسجيل حضور الموظف لهذا اليوم بالفعل' });
      }
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/attendance/check-out' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      await parseBody(req);
      const client = await writePool.connect();
      try {
        await client.query('BEGIN');
        const attendance = await client.query(
          `SELECT id FROM attendance_records
           WHERE user_id = $1 AND attendance_date = CURRENT_DATE AND check_out IS NULL
           FOR UPDATE`,
          [currentUser.id]
        );
        if (!attendance.rows[0]) {
          await client.query('ROLLBACK');
          return sendJSON(res, 409, { error: 'يجب تسجيل الحضور قبل الانصراف' });
        }
        const openShift = await client.query(
          "SELECT 1 FROM shifts WHERE user_id = $1 AND status = 'open' LIMIT 1",
          [currentUser.id]
        );
        if (openShift.rowCount) {
          await client.query('ROLLBACK');
          return sendJSON(res, 409, { error: 'أغلق ورديتك أولاً قبل تسجيل الانصراف' });
        }
        await client.query(
          'UPDATE attendance_records SET check_out = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [attendance.rows[0].id]
        );
        await client.query('COMMIT');
        return sendJSON(res, 200, { success: true });
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }

    if (pathname === '/api/shifts/current' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const warehouseId = Number(req.headers['x-branch-warehouse-id']);
      const shiftResult = await writePool.query(
        `SELECT * FROM shifts WHERE user_id = $1 AND status = 'open'
         AND ($2::INTEGER IS NULL OR warehouse_id = $2)
         ORDER BY id DESC LIMIT 1`,
        [currentUser.id, Number.isSafeInteger(warehouseId) && warehouseId > 0 ? warehouseId : null]
      );
      return sendJSON(res, 200, shiftResult.rows[0] || null);
    }

    if (pathname === '/api/shifts/open' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const body = await parseBody(req);
      const client = await writePool.connect();
      try {
        await client.query('BEGIN');
        const userResult = await client.query(
          'SELECT id, username, role, branch_id, is_active FROM users WHERE id = $1 FOR SHARE',
          [currentUser.id]
        );
        const user = userResult.rows[0];
        if (!user || !user.is_active) throw new PosError('حساب المستخدم غير نشط أو غير موجود', 401);
        const attendance = await client.query(
          `SELECT id FROM attendance_records
           WHERE user_id = $1 AND attendance_date = CURRENT_DATE
             AND check_in IS NOT NULL AND check_out IS NULL
           FOR UPDATE`,
          [user.id]
        );
        const attendanceRecord = attendance.rows[0];
        if (!attendanceRecord) {
          throw new PosError('سجّل حضورك أولاً قبل فتح الوردية', 403);
        }
        const requestedWarehouseId = Number(req.headers['x-branch-warehouse-id']);
        const warehouseResult = requestedWarehouseId
          ? await client.query('SELECT id, branch_id FROM warehouses WHERE id = $1 AND is_active = TRUE FOR SHARE', [requestedWarehouseId])
          : user.branch_id
            ? await client.query('SELECT id, branch_id FROM warehouses WHERE branch_id = $1 AND is_active = TRUE AND is_default = TRUE ORDER BY id LIMIT 1 FOR SHARE', [user.branch_id])
            : { rows: [] };
        const warehouse = warehouseResult.rows[0];
        if (!warehouse) throw new PosError('لم يتم تحديد مخزن نشط لهذا الجهاز', 409);
        if (user.branch_id != null && Number(warehouse.branch_id) !== Number(user.branch_id)) {
          throw new PosError('المخزن المحدد لا يتبع فرع حسابك', 403);
        }
        const openingCash = Number(body.openingCash || 0);
        if (!Number.isFinite(openingCash) || openingCash < 0) throw new PosError('العهدة الابتدائية غير صحيحة');
        const shiftResult = await client.query(
          `INSERT INTO shifts (user_id, branch_id, warehouse_id, opened_by_name, shift_type, pos_station, opening_cash, opening_notes, attendance_record_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [user.id, warehouse.branch_id, warehouse.id, user.username,
            body.shiftType === 'evening' ? 'evening' : 'morning',
            body.posStation || 'الدرج الرئيسي - POS 1', openingCash, body.notes || null,
            attendanceRecord.id]
        );
        await client.query('COMMIT');
        return sendJSON(res, 201, shiftResult.rows[0]);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        if (error.code === '23505') return sendJSON(res, 409, { error: 'لديك وردية مفتوحة بالفعل على هذا المخزن' });
        throw error;
      } finally {
        client.release();
      }
    }

    if (pathname === '/api/sales/create' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const body = await parseBody(req);
      const requestedWarehouseId = Number(req.headers['x-branch-warehouse-id']);
      try {
        const result = await createCentralSale({
          userId: currentUser.id,
          warehouseId: Number.isSafeInteger(requestedWarehouseId) && requestedWarehouseId > 0
            ? requestedWarehouseId
            : null,
          saleData: body,
        });
        return sendJSON(res, 201, result);
      } catch (error) {
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        throw error;
      }
    }

    if (pathname === '/api/sales/kitchen-orders' && method === 'GET') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      try {
        return sendJSON(res, 200, await getCentralKitchenOrders({ userId: currentUser.id }));
      } catch (error) {
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        throw error;
      }
    }

    if (pathname === '/api/sales/kitchen-orders/status' && method === 'POST') {
      if (!currentUser?.id) return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      await ensurePosSchema();
      const body = await parseBody(req);
      try {
        return sendJSON(res, 200, await updateCentralKitchenOrderStatus({
          userId: currentUser.id,
          saleId: body.saleId,
          status: body.status,
        }));
      } catch (error) {
        if (error instanceof PosError) return sendJSON(res, error.statusCode, { error: error.message });
        throw error;
      }
    }

    if (pathname === '/api/auth/refresh' && method === 'POST') {
      if (!currentUser?.id) {
        return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      }
      const activeUser = await queryRead(
        'SELECT id, username, role, branch_id, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      if (!activeUser.rows.length) {
        return sendJSON(res, 401, { error: 'المستخدم غير موجود' });
      }
      if (!activeUser.rows[0].is_active) {
        return sendJSON(res, 403, { error: 'هذا الحساب معطل حالياً' });
      }
      const user = activeUser.rows[0];
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: TOKEN_TTL }
      );
      return sendJSON(res, 200, {
        token,
        user: { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id },
      });
    }

    if (pathname === '/api/reviews/sync' && method === 'POST') {
      if (!currentUser?.id) {
        return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      }

      const activeUser = await queryRead(
        'SELECT id, branch_id, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      if (!activeUser.rows.length) {
        return sendJSON(res, 401, { error: 'المستخدم غير موجود' });
      }
      if (!activeUser.rows[0].is_active) {
        return sendJSON(res, 403, { error: 'هذا الحساب معطل حالياً' });
      }

      let review;
      try {
        review = reviewSchema.validate((await parseBody(req, 6_000_000)).review);
      } catch (error) {
        return sendJSON(res, error.statusCode || 400, { error: error.message });
      }

      const positiveTags = new Set([
        'أسرع في البيع', 'سهولة الاستخدام', 'تقارير مفيدة', 'دعم جيد', 'ثبات النظام', 'إدارة المخزون',
      ]);
      const negativeTags = new Set([
        'النظام بطيء', 'ميزة ناقصة', 'صعب التعلم', 'الدعم بطيء', 'أخطاء تقنية', 'إدارة المخزون',
      ]);
      const allowedTags = review.rating >= 4 ? positiveTags : negativeTags;
      const tags = [...new Set(review.tags || [])];
      if (tags.some((tag) => !allowedTags.has(tag))) {
        return sendJSON(res, 400, { error: 'أحد الوسوم المختارة غير مناسب لهذا التقييم' });
      }
      if (review.rating < 4 && review.consent) {
        return sendJSON(res, 400, { error: 'موافقة النشر متاحة للتقييمات الإيجابية فقط' });
      }

      const consent = review.rating >= 4 && review.consent === true;
      const businessName = consent ? String(review.businessName || '').trim().slice(0, 160) || null : null;
      const businessLogo = consent
        ? typeof review.businessLogo === 'string' && review.businessLogo.length <= 5_000_000
          ? review.businessLogo || null
          : null
        : null;
      if (consent && review.businessLogo && !businessLogo) {
        return sendJSON(res, 400, { error: 'حجم شعار النشاط كبير جدًا لإرساله' });
      }
      const tenantId = activeUser.rows[0].branch_id == null
        ? 'central'
        : `branch:${activeUser.rows[0].branch_id}`;
      if (review.userId == null
        || String(review.userId) !== String(activeUser.rows[0].id)
        || review.tenantId !== tenantId) {
        return sendJSON(res, 403, { error: 'لا يمكن مزامنة تقييم تابع لحساب أو فرع آخر' });
      }

      await ensureReviewsSchema();
      await queryWrite(`
        INSERT INTO reviews (
          tenant_id, user_id, rating, tags, comment, status, sector, app_version,
          consent, business_name, business_logo
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          rating = EXCLUDED.rating,
          tags = EXCLUDED.tags,
          comment = EXCLUDED.comment,
          status = 'pending',
          sector = EXCLUDED.sector,
          app_version = EXCLUDED.app_version,
          consent = EXCLUDED.consent,
          business_name = EXCLUDED.business_name,
          business_logo = EXCLUDED.business_logo,
          updated_at = CURRENT_TIMESTAMP
      `, [
        tenantId,
        activeUser.rows[0].id,
        review.rating,
        JSON.stringify(tags),
        review.comment || null,
        typeof review.sector === 'string' ? review.sector.slice(0, 80) : null,
        typeof review.appVersion === 'string' ? review.appVersion.slice(0, 40) : null,
        consent,
        businessName,
        businessLogo,
      ]);
      return sendJSON(res, 200, { success: true, tenantId });
    }

    if (pathname === '/api/auth/profile' && ['GET', 'PUT'].includes(method)) {
      if (!currentUser?.id) {
        return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
      }

      await ensureProfileSchema();
      const activeUser = await queryRead(
        'SELECT id, username, role, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );
      if (!activeUser.rows.length) {
        return sendJSON(res, 401, { error: 'المستخدم غير موجود' });
      }
      if (!activeUser.rows[0].is_active) {
        return sendJSON(res, 403, { error: 'هذا الحساب معطل حالياً' });
      }

      if (method === 'GET') {
        const result = await queryRead(
          `SELECT id, username, role, full_name AS "fullName",
             first_name AS "firstName", last_name AS "lastName", phone, email,
             gender, date_of_birth::TEXT AS "dateOfBirth", country, city, address,
             created_at AS "createdAt"
           FROM users WHERE id = $1 LIMIT 1`,
          [currentUser.id]
        );
        return sendJSON(res, 200, { profile: result.rows[0] });
      }

      let profile;
      try {
        profile = personalProfileSchema.validate(await parseBody(req));
      } catch (error) {
        return sendJSON(res, 400, { error: error.message });
      }

      const columns = {
        firstName: 'first_name',
        lastName: 'last_name',
        email: 'email',
        phone: 'phone',
        gender: 'gender',
        dateOfBirth: 'date_of_birth',
        country: 'country',
        city: 'city',
        address: 'address',
      };
      const updates = Object.entries(columns)
        .filter(([field]) => profile[field] !== undefined)
        .map(([field, column]) => [column, profile[field]]);
      if (profile.firstName !== undefined || profile.lastName !== undefined) {
        const existingProfile = await queryRead(
          'SELECT first_name, last_name, full_name FROM users WHERE id = $1 LIMIT 1',
          [currentUser.id]
        );
        const current = existingProfile.rows[0];
        const legacyName = String(current.full_name || '').trim();
        const legacyFirstName = legacyName.split(/\s+/)[0] || null;
        const legacyLastName = current.first_name && legacyName.startsWith(current.first_name)
          ? legacyName.slice(current.first_name.length).trim() || null
          : legacyName.split(/\s+/).slice(1).join(' ') || null;
        const firstName = profile.firstName === undefined
          ? current.first_name ?? legacyFirstName
          : profile.firstName;
        const lastName = profile.lastName === undefined
          ? current.last_name ?? legacyLastName
          : profile.lastName;
        updates.push(['full_name', [firstName, lastName].filter(Boolean).join(' ') || null]);
      }

      const values = updates.map(([, value]) => value);
      const assignments = updates.map(([column], index) => `${column} = $${index + 1}`).join(', ');
      values.push(currentUser.id);
      const result = await queryWrite(
        `UPDATE users SET ${assignments} WHERE id = $${values.length}
         RETURNING id, username, role, full_name AS "fullName",
           first_name AS "firstName", last_name AS "lastName", phone, email,
           gender, date_of_birth::TEXT AS "dateOfBirth", country, city, address,
           created_at AS "createdAt"`,
        values
      );
      return sendJSON(res, 200, { profile: result.rows[0] });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!currentUser) return sendJSON(res, 401, { error: 'غير مصرح به (Token غير صالح)' });
      return sendJSON(res, 200, { user: currentUser });
    }

    // Protected Admin Routes Guard with Live Database Verification
    if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
      if (!currentUser || !currentUser.id) {
        return sendJSON(res, 401, { error: 'غير مصرح: يجب تسجيل الدخول برمز صالح' });
      }

      // Verify user from Database (Live check to prevent forged/stale token privilege escalation)
      const userCheck = await queryRead(
        'SELECT id, username, role, is_active FROM users WHERE id = $1 LIMIT 1',
        [currentUser.id]
      );

      if (!userCheck.rows || userCheck.rows.length === 0) {
        return sendJSON(res, 401, { error: 'المستخدم صاحب هذا الرمز غير موجود بقاعدة البيانات' });
      }

      const activeUser = userCheck.rows[0];
      if (!activeUser.is_active) {
        return sendJSON(res, 403, { error: 'هذا الحساب معطل حالياً، غير مصرح بالوصول' });
      }

      if (activeUser.role !== 'admin') {
        return sendJSON(res, 403, { error: 'مرفوض: هذه العملية تتطلب صلاحية مدير النظام' });
      }
    }

    // -------------------------------------------------------------
    // 3. Admin - Infrastructure Health
    // -------------------------------------------------------------
    if (pathname === '/api/admin/health' && method === 'GET') {
      const dbHealth = await checkHealth();
      return sendJSON(res, 200, {
        server: {
          instanceId: INSTANCE_ID,
          port: PORT,
          uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
          nodeVersion: process.version,
          platform: process.platform,
          requestsCount: totalRequestsHandled,
        },
        database: {
          primary: dbHealth.primary,
          replica: dbHealth.replica,
        },
        replicationMode: process.env.PG_REPLICA_HOST !== process.env.PGHOST ? 'Dedicated Replica' : 'Single Host Dual-Pool',
      });
    }

    // -------------------------------------------------------------
    // 4. Admin - Enterprise Profiles (6 Sectors)
    // -------------------------------------------------------------
    if (pathname === '/api/admin/profiles' && method === 'GET') {
      return sendJSON(res, 200, ENTERPRISE_PROFILES);
    }

    // -------------------------------------------------------------
    // 5. Admin - Branches Management (Read from Replica, Write to Master)
    // -------------------------------------------------------------
    if (pathname === '/api/admin/branches' && method === 'GET') {
      const branches = await queryRead('SELECT * FROM branches ORDER BY id ASC');
      return sendJSON(res, 200, branches.rows);
    }

    if (pathname === '/api/admin/branches' && method === 'POST') {
      const { name, address, phone, is_active } = await parseBody(req);
      if (!name || !String(name).trim()) return sendJSON(res, 400, { error: 'اسم الفرع مطلوب' });

      try {
        const insertRes = await queryWrite(
          `INSERT INTO branches (name, address, phone, is_active)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [String(name).trim(), address ? String(address).trim() : '', phone ? String(phone).trim() : '', is_active !== false]
        );
        return sendJSON(res, 201, insertRes.rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          return sendJSON(res, 409, { error: 'اسم الفرع مستخدم بالفعل' });
        }
        throw err;
      }
    }

    // -------------------------------------------------------------
    // 6. Admin - Users Management
    // -------------------------------------------------------------
    if (pathname === '/api/admin/users' && method === 'GET') {
      const users = await queryRead(
        `SELECT u.id, u.username, u.role, u.branch_id, u.is_active, u.created_at, b.name as branch_name
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         ORDER BY u.id ASC`
      );
      return sendJSON(res, 200, users.rows);
    }

    if (pathname === '/api/admin/users' && method === 'POST') {
      const { username, password, role, branch_id } = await parseBody(req);
      const cleanUsername = String(username || '').trim();
      if (!cleanUsername) {
        return sendJSON(res, 400, { error: 'اسم المستخدم مطلوب' });
      }
      if (!password || String(password).length < 6) {
        return sendJSON(res, 400, { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      }

      const cleanRole = ['admin', 'cashier'].includes(role) ? role : 'cashier';

      try {
        const hash = bcrypt.hashSync(password, 10);
        const insertUser = await queryWrite(
          `INSERT INTO users (username, password_hash, role, branch_id, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           RETURNING id, username, role, branch_id, is_active, created_at`,
          [cleanUsername, hash, cleanRole, branch_id || null]
        );
        return sendJSON(res, 201, insertUser.rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          return sendJSON(res, 409, { error: 'اسم المستخدم مسجل مسبقاً' });
        }
        throw err;
      }
    }

    // -------------------------------------------------------------
    // 7. Admin - System Settings
    // -------------------------------------------------------------
    if (pathname === '/api/admin/settings' && method === 'GET') {
      const settings = await queryRead('SELECT * FROM system_settings');
      const settingsMap = {};
      for (const row of settings.rows) {
        settingsMap[row.key] = row.value;
      }
      return sendJSON(res, 200, settingsMap);
    }

    if (pathname === '/api/admin/settings' && method === 'POST') {
      const body = await parseBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return sendJSON(res, 400, { error: 'بيانات الإعدادات غير صالحة' });
      }
      for (const [key, val] of Object.entries(body)) {
        await queryWrite(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [key, String(val)]
        );
      }
      return sendJSON(res, 200, { success: true, message: 'تم حفظ الإعدادات بنجاح' });
    }

    // 404 Route Not Found
    return sendJSON(res, 404, { error: `المسار غير موجود: [${method}] ${pathname}` });

  } catch (err) {
    console.error('Server Internal Error:', err);
    return sendJSON(res, 500, { error: 'حدث خطأ غير متوقع في الخادم' });
  }
});

async function startCentralServer() {
  try {
    const health = await ensureDatabaseReady();
    console.log('✅ [PostgreSQL Central]: master connection verified', health.primary);
    if (health.replica.status === 'OK') {
      console.log('✅ [PostgreSQL Central]: replica connection verified', health.replica);
    } else {
      console.warn('⚠️ [PostgreSQL Central]: replica unavailable, app will continue with primary fallback.', health.replica.error);
    }

    server.listen(PORT, BIND_HOST, () => {
      console.log(`🚀 [FOX.CLOUD Central Server]: Running on http://${BIND_HOST}:${PORT}`);
      console.log(`📡 [Master Database]: Connected (Write Pool)`);
      console.log(`📖 [Replica Database]: ${health.replica.status === 'OK' ? 'Connected (Read Replica)' : 'Unavailable - fallback to primary enabled'}`);
    });
  } catch (error) {
    console.error('❌ [PostgreSQL Central Startup Failed]:', error.message);
    console.error('💡 [Fix]: set PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE and ensure PostgreSQL is running before launching the central server.');
    process.exit(1);
  }
}

startCentralServer();
