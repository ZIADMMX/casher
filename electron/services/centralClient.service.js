const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const { configureSystemCertificateTrust } = require('../security/tlsTrust');

const configPath = path.join(app.getPath('userData'), 'central-server.json');
let accessToken = null;
let cachedSession = null;
const courtsCache = new Map();
const courtsRequestsInFlight = new Map();
const COURTS_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
let courtsCacheExpiresAt = 0;

function clearCourtsCache() {
  courtsCache.clear();
  courtsRequestsInFlight.clear();
  courtsCacheExpiresAt = 0;
}

function cloneResponse(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isCourtsRoute(route) {
  return /^\/api\/courts(?:\/[0-9a-f-]{36})?(?:\?.*)?$/i.test(route);
}

function getCourtsCacheKey(route) {
  const { baseUrl } = getConfig();
  const tenant = cachedSession?.branch_id == null ? 'central' : `branch:${cachedSession.branch_id}`;
  const userId = cachedSession?.id ?? 'anonymous';
  return `${baseUrl}:${tenant}:${userId}:${route}`;
}

async function getCourtsData(cacheKey, route) {
  if (courtsCacheExpiresAt && courtsCacheExpiresAt <= Date.now()) {
    clearCourtsCache();
  }
  if (courtsCache.has(cacheKey)) return cloneResponse(courtsCache.get(cacheKey));

  const pendingRequest = courtsRequestsInFlight.get(cacheKey);
  if (pendingRequest) return cloneResponse(await pendingRequest);

  const requestPromise = request('GET', route).then((result) => {
    if (courtsRequestsInFlight.get(cacheKey) === requestPromise) {
      courtsCache.set(cacheKey, cloneResponse(result));
      if (!courtsCacheExpiresAt) courtsCacheExpiresAt = Date.now() + COURTS_CACHE_TTL_MS;
    }
    return result;
  }).finally(() => {
    if (courtsRequestsInFlight.get(cacheKey) === requestPromise) {
      courtsRequestsInFlight.delete(cacheKey);
    }
  });
  courtsRequestsInFlight.set(cacheKey, requestPromise);
  return cloneResponse(await requestPromise);
}

function getConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const rawBaseUrl = config.baseUrl || '';
    const baseUrl = validateBaseUrl(upgradeHttpBaseUrl(rawBaseUrl));
    if (baseUrl !== rawBaseUrl) {
      fs.writeFileSync(configPath, JSON.stringify({
        ...config,
        baseUrl,
      }), { encoding: 'utf8', mode: 0o600 });
    }
    return {
      baseUrl,
      warehouseId: Number.isSafeInteger(config.warehouseId) ? config.warehouseId : null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { baseUrl: '' };
    throw new Error(`تعذر قراءة إعداد الخادم المركزي: ${error.message}`);
  }
}

function upgradeHttpBaseUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:') return rawUrl;
  const securePort = parsed.port ? Number(parsed.port) + 443 : 5443;
  if (!Number.isInteger(securePort) || securePort < 1 || securePort > 65535) {
    throw new Error('منفذ الخادم القديم لا يمكن تحويله إلى اتصال HTTPS صالح');
  }
  parsed.protocol = 'https:';
  parsed.port = String(securePort);
  return parsed.toString().replace(/\/$/, '');
}

function validateBaseUrl(value) {
  const baseUrl = String(value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return '';
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('عنوان الخادم المركزي غير صالح');
  }
  if (parsed.protocol !== 'https:'
    || parsed.username || parsed.password
    || (parsed.pathname && parsed.pathname !== '/')
    || parsed.search || parsed.hash) {
    throw new Error('اتصال الفروع يتطلب HTTPS. أدخل العنوان الآمن، مثل https://192.168.1.10:5443');
  }
  return baseUrl;
}

function configure(value) {
  const oldConfig = getConfig();
  const baseUrl = validateBaseUrl(typeof value === 'string' ? value : value?.baseUrl);
  const warehouseId = typeof value === 'object' && value !== null
    ? value.warehouseId ?? oldConfig.warehouseId
    : oldConfig.warehouseId;
  if (warehouseId != null && (!Number.isSafeInteger(Number(warehouseId)) || Number(warehouseId) <= 0)) {
    throw new Error('معرف مخزن الجهاز يجب أن يكون رقمًا صحيحًا موجبًا');
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const config = { baseUrl, warehouseId: baseUrl ? Number(warehouseId) || null : null };
  fs.writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
  if (baseUrl !== oldConfig.baseUrl) {
    accessToken = null;
    cachedSession = null;
    clearCourtsCache();
  }
  return { ...config, enabled: Boolean(baseUrl) };
}

function setWarehouse(warehouseId) {
  const config = getConfig();
  if (!config.baseUrl) throw new Error('اتصال الخادم المركزي غير مفعّل على هذا الجهاز');
  const id = Number(warehouseId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('اختر مخزنًا صالحًا لتخصيصه لهذا الجهاز');
  }
  fs.writeFileSync(configPath, JSON.stringify({ ...config, warehouseId: id }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return { ...config, warehouseId: id };
}

function isConfigured() {
  return Boolean(getConfig().baseUrl);
}

async function request(method, route, body) {
  const { baseUrl } = getConfig();
  if (!baseUrl) throw new Error('لم يتم إعداد عنوان الخادم المركزي');
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const { warehouseId } = getConfig();
  if (warehouseId) headers['X-Branch-Warehouse-Id'] = String(warehouseId);

  let response;
  try {
    configureSystemCertificateTrust();
    response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new Error(`تعذر الاتصال بالخادم المركزي؛ البيع والعمليات تتطلب اتصالاً مباشراً. ${error.message}`);
  }

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) accessToken = null;
    if (response.status === 429 || response.status === 503) {
      const isBusy = response.status === 503;
      const error = new Error(responseBody.error || (isBusy
        ? 'الخادم مشغول حاليًا، يرجى المحاولة بعد لحظات'
        : 'تم إيقاف هذه العملية مؤقتًا بسبب تكرار المحاولة'));
      error.code = isBusy ? 'SERVER_BUSY' : 'RATE_LIMITED';
      error.retryAfterMs = Number(responseBody.retryAfterMs)
        || Number(response.headers.get('retry-after')) * 1000
        || (isBusy ? 1000 : 40000);
      error.action = `${method} ${route}`;
      throw error;
    }
    throw new Error(responseBody.error || `رفض الخادم المركزي الطلب (${response.status})`);
  }
  return responseBody;
}

async function login(credentials) {
  const result = await request('POST', '/api/auth/login', credentials);
  if (!result.token || !result.user) {
    throw new Error('استجابة تسجيل الدخول من الخادم المركزي غير مكتملة');
  }
  clearCourtsCache();
  accessToken = result.token;
  cachedSession = result.user;
  const currentConfig = getConfig();
  if (!currentConfig.warehouseId && result.defaultWarehouseId) {
    try {
      setWarehouse(result.defaultWarehouseId);
    } catch {}
  }
  return result;
}

async function getSession() {
  if (!accessToken) return null;
  const result = await request('GET', '/api/auth/me');
  if (!result.user) {
    accessToken = null;
    cachedSession = null;
  } else {
    cachedSession = result.user;
    const currentConfig = getConfig();
    if (!currentConfig.warehouseId && result.defaultWarehouseId) {
      try {
        setWarehouse(result.defaultWarehouseId);
      } catch {}
    }
  }
  return result.user || null;
}

function getCachedSession() {
  return accessToken ? cachedSession : null;
}

async function refreshSession() {
  if (!accessToken) return null;
  let result;
  try {
    result = await request('POST', '/api/auth/refresh', {});
  } catch (error) {
    if (accessToken && cachedSession && error.message.startsWith('تعذر الاتصال بالخادم المركزي')) {
      return { user: cachedSession, offline: true };
    }
    throw error;
  }
  if (!result.token || !result.user) {
    throw new Error('تعذر تجديد جلسة الخادم المركزي');
  }
  accessToken = result.token;
  cachedSession = result.user;
  return result;
}

async function updateProfile(profile) {
  const result = await request('POST', '/api/auth/profile', profile);
  if (result.token) accessToken = result.token;
  if (result.user) cachedSession = result.user;
  return result;
}

async function getMyProfile() {
  const result = await request('GET', '/api/auth/profile');
  return result.profile;
}

async function saveMyProfile(profile) {
  const result = await request('PUT', '/api/auth/profile', profile);
  return result.profile;
}

async function changePassword(password) {
  const result = await request('POST', '/api/auth/change-password', { password });
  if (!result.token) throw new Error('لم يستلم الجهاز جلسة محدثة من الخادم المركزي');
  accessToken = result.token;
  cachedSession = result.user || cachedSession;
  return result;
}

async function logout() {
  try {
    if (accessToken) await request('POST', '/api/auth/logout');
  } finally {
    accessToken = null;
    cachedSession = null;
    clearCourtsCache();
  }
  return true;
}

async function testConnection(value) {
  const baseUrl = validateBaseUrl(value);
  if (!baseUrl) throw new Error('أدخل عنوان الخادم المركزي أولاً');
  configureSystemCertificateTrust();
  const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`رد الخادم برمز ${response.status}`);
  return response.json();
}

function isAllowedRoute(method, route) {
  const routePath = route.split('?')[0];
  const routes = [
    ['GET', /^\/api\/courts(?:\/[0-9a-f-]{36})?$/i],
    ['GET', /^\/api\/(products|categories|shifts\/current|customers|returns\/recent|sales\/kitchen-orders|inventory\/(branches|warehouses|stock|movements|transfers))$/],
    ['GET', /^\/api\/(products\/barcode\/[^/]+|sales\/\d+|returns\/find-sale\/\d+|inventory\/warehouses\/\d+)$/],
    ['GET', /^\/api\/appointments\/(resources|services|holidays|list)$/],
    ['GET', /^\/api\/appointments\/resources\/\d+$/],
    ['POST', /^\/api\/(sales\/(create|kitchen-orders\/status)|purchases\/create|products\/(add|add-variant|update|update-variant|delete|delete-variant)|shifts\/(open|close|expense)|returns\/process|customers\/(add|payment)|inventory\/(branches|warehouses|transfers|adjust|reorder-level|count))$/],
    ['POST', /^\/api\/appointments\/(resources|services|holidays|holidays\/delete|create|status|reschedule|convert)$/],
    ['POST', /^\/api\/courts$/],
    ['PUT', /^\/api\/(inventory\/(branches|warehouses)\/\d+)$/],
    ['PUT', /^\/api\/courts\/[0-9a-f-]{36}$/i],
    ['DELETE', /^\/api\/courts\/[0-9a-f-]{36}$/i],
  ];
  return routes.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(routePath));
}

async function invoke({ method, route, body }) {
  if (typeof method !== 'string' || typeof route !== 'string' || !route.startsWith('/api/')) {
    throw new Error('طلب الخادم المركزي غير صالح');
  }
  const normalizedMethod = method.toUpperCase();
  if (!isAllowedRoute(normalizedMethod, route)) {
    throw new Error('هذه العملية غير متاحة عبر اتصال الفروع');
  }
  const courtsRoute = isCourtsRoute(route);
  const cacheKey = courtsRoute && normalizedMethod === 'GET'
    ? getCourtsCacheKey(route)
    : null;
  const result = cacheKey
    ? await getCourtsData(cacheKey, route)
    : await request(normalizedMethod, route, body);
  if (!cacheKey && courtsRoute && ['POST', 'PUT', 'DELETE'].includes(normalizedMethod)) {
    clearCourtsCache();
  }
  if (normalizedMethod === 'POST') {
    const session = cachedSession;
    const tenantId = session?.branch_id == null ? 'central' : `branch:${session.branch_id}`;
    const routePath = route.split('?')[0];
    const reviewRepository = require('../repositories/reviews.repository');
    if (routePath === '/api/sales/create' && session?.id) {
      const saleId = result?.sale?.id ?? result?.id ?? result?.data?.id ?? crypto.randomUUID();
      reviewRepository.recordRemoteActivity(tenantId, session.id, 'sale', saleId);
    }
    if (routePath === '/api/appointments/status'
      && body?.status === 'completed'
      && body?.id
      && session?.id) {
      reviewRepository.recordRemoteActivity(tenantId, session.id, 'appointment', body.id);
    }
  }
  return result;
}

async function syncQueuedReviews(tenantId, userId) {
  const reviewRepository = require('../repositories/reviews.repository');
  const queuedReviews = reviewRepository.getPendingSync(tenantId, userId);
  let lastError = null;
  for (const queuedReview of queuedReviews) {
    try {
      await request('POST', '/api/reviews/sync', { review: queuedReview.payload });
      reviewRepository.removePendingSync(queuedReview.id);
    } catch (error) {
      lastError = error;
    }
  }
  const pendingCount = reviewRepository.getPendingSyncCount(tenantId, userId);
  return {
    syncedCount: queuedReviews.length - pendingCount,
    pendingCount,
    error: lastError?.message || null,
  };
}

module.exports = {
  getConfig,
  configure,
  setWarehouse,
  isConfigured,
  login,
  getSession,
  getCachedSession,
  refreshSession,
  updateProfile,
  getMyProfile,
  saveMyProfile,
  changePassword,
  logout,
  testConnection,
  invoke,
  syncQueuedReviews,
};
