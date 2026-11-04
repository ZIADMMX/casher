const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const { configureSystemCertificateTrust } = require('../security/tlsTrust');
const tlsPin = require('../security/tlsPin');

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

function writeStoredConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
}

/** Full stored config, including the pinned server certificate (main process only). */
function readStoredConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const rawBaseUrl = config.baseUrl || '';
    const baseUrl = validateBaseUrl(upgradeHttpBaseUrl(rawBaseUrl));
    if (baseUrl !== rawBaseUrl) writeStoredConfig({ ...config, baseUrl });
    const pinned = Boolean(config.certPem) && tlsPin.isValidFingerprint(config.certFingerprint);
    return {
      baseUrl,
      warehouseId: Number.isSafeInteger(config.warehouseId) ? config.warehouseId : null,
      certFingerprint: pinned ? config.certFingerprint : null,
      certPem: pinned ? config.certPem : null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { baseUrl: '', warehouseId: null, certFingerprint: null, certPem: null };
    throw new Error(`تعذر قراءة إعداد الخادم المركزي: ${error.message}`);
  }
}

function getConfig() {
  const { baseUrl, warehouseId, certFingerprint } = readStoredConfig();
  // pinned=false on a configured device means it still relies on the legacy
  // OS trust-store setup and should be re-paired.
  return { baseUrl, warehouseId, certFingerprint, pinned: Boolean(certFingerprint) };
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

/**
 * Pair this terminal with a server. value is '' (disconnect) or
 * { baseUrl, fingerprint256 } where fingerprint256 is the fingerprint the user
 * compared with the server screen; it must match the certificate served now.
 */
async function configure(value) {
  const oldConfig = readStoredConfig();
  const baseUrl = validateBaseUrl(typeof value === 'string' ? value : value?.baseUrl);
  const warehouseId = typeof value === 'object' && value !== null
    ? value.warehouseId ?? oldConfig.warehouseId
    : oldConfig.warehouseId;
  if (warehouseId != null && (!Number.isSafeInteger(Number(warehouseId)) || Number(warehouseId) <= 0)) {
    throw new Error('معرف مخزن الجهاز يجب أن يكون رقمًا صحيحًا موجبًا');
  }

  let pin = { fingerprint256: null, pem: null };
  if (baseUrl) {
    const confirmed = tlsPin.normalizeFingerprint(value?.fingerprint256);
    if (!confirmed) throw new Error('يجب تأكيد بصمة شهادة الخادم قبل الربط');
    pin = await tlsPin.fetchServerCertificate(baseUrl);
    if (pin.fingerprint256 !== confirmed) {
      throw new Error('بصمة الخادم الحالية لا تطابق البصمة التي أكدتها. لا تربط الجهاز وتحقق من الشبكة');
    }
  }

  const config = {
    baseUrl,
    warehouseId: baseUrl ? Number(warehouseId) || null : null,
    certFingerprint: pin.fingerprint256,
    certPem: pin.pem,
  };
  writeStoredConfig(config);
  if (baseUrl !== oldConfig.baseUrl || pin.fingerprint256 !== oldConfig.certFingerprint) {
    accessToken = null;
    cachedSession = null;
    clearCourtsCache();
  }
  return { ...getConfig(), enabled: Boolean(baseUrl) };
}

/** Fingerprint of the certificate a server presents now, for the user to compare. */
async function getServerFingerprint(value) {
  const baseUrl = validateBaseUrl(value);
  if (!baseUrl) throw new Error('أدخل عنوان الخادم أولاً');
  const { fingerprint256 } = await tlsPin.fetchServerCertificate(baseUrl);
  return { baseUrl, fingerprint256 };
}

function setWarehouse(warehouseId) {
  const config = readStoredConfig();
  if (!config.baseUrl) throw new Error('اتصال الخادم المركزي غير مفعّل على هذا الجهاز');
  const id = Number(warehouseId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('اختر مخزنًا صالحًا لتخصيصه لهذا الجهاز');
  }
  writeStoredConfig({ ...config, warehouseId: id });
  return getConfig();
}

function isConfigured() {
  return Boolean(getConfig().baseUrl);
}

async function request(method, route, body) {
  const { baseUrl, warehouseId, certFingerprint, certPem } = readStoredConfig();
  if (!baseUrl) throw new Error('لم يتم إعداد عنوان الخادم المركزي');
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (warehouseId) headers['X-Branch-Warehouse-Id'] = String(warehouseId);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  let response;
  try {
    if (certPem) {
      response = await tlsPin.pinnedRequest(`${baseUrl}${route}`, {
        method,
        headers,
        body: payload,
        timeoutMs: 5000,
        pin: { fingerprint256: certFingerprint, pem: certPem },
      });
    } else {
      // Legacy pairing: server certificate installed in the OS trust store.
      configureSystemCertificateTrust();
      response = await fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
    }
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
  const { serverInfo, fingerprint256 } = await tlsPin.probeServer(baseUrl);
  return { ...serverInfo, fingerprint256 };
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
  getServerFingerprint,
  invoke,
  syncQueuedReviews,
};
