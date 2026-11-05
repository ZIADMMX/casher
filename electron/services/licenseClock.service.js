const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'license-time.config.json');
const CACHE_DURATION_MS = 30_000;
// How long the shop may keep selling without reaching the time server,
// counted from the last successful check.
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 60_000;
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

// Settings keys (listed in PROTECTED_KEYS so the settings screen can neither
// read nor overwrite them).
const ANCHOR_SERVER_KEY = 'license_time_anchor_server';
const ANCHOR_WALL_KEY = 'license_time_anchor_wall';
const LAST_SEEN_WALL_KEY = 'license_time_last_seen_wall';

let cachedTime = null;
let pendingRequest = null;
let anchorStore = null;

function getAnchorStore() {
  if (!anchorStore) {
    anchorStore = require('../repositories/settings.repository');
  }
  return anchorStore;
}

function readNumber(store, key) {
  const value = Number(store.get(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function saveAnchor(serverTime) {
  try {
    const store = getAnchorStore();
    const wallNow = Date.now();
    store.set(ANCHOR_SERVER_KEY, String(Math.round(serverTime)));
    store.set(ANCHOR_WALL_KEY, String(wallNow));
    // A successful check resets the rollback watermark, so a clock that was
    // wrong and then corrected recovers as soon as the shop is back online.
    store.set(LAST_SEEN_WALL_KEY, String(wallNow));
  } catch (error) {
    console.warn('Failed to persist license time anchor:', error.message);
  }
}

// Estimate trusted time without the network, from the last successful check.
function offlineTrustedNow(networkError) {
  // Same session: the monotonic clock cannot be turned back by the user.
  if (cachedTime) {
    const elapsed = performance.now() - cachedTime.monotonicTime;
    if (elapsed <= OFFLINE_GRACE_MS) {
      return cachedTime.serverTime + elapsed;
    }
  }

  const store = getAnchorStore();
  const anchorServer = readNumber(store, ANCHOR_SERVER_KEY);
  const anchorWall = readNumber(store, ANCHOR_WALL_KEY);
  if (!anchorServer || !anchorWall) {
    throw networkError;
  }

  const wallNow = Date.now();
  const lastSeen = readNumber(store, LAST_SEEN_WALL_KEY) || anchorWall;
  if (wallNow < Math.max(anchorWall, lastSeen) - CLOCK_TOLERANCE_MS) {
    throw new Error('تم إرجاع ساعة الجهاز للخلف. صحّح الوقت أو اتصل بالإنترنت لمتابعة العمل.');
  }

  const elapsed = wallNow - anchorWall;
  if (elapsed > OFFLINE_GRACE_MS) {
    throw new Error('انتهت مدة العمل بدون إنترنت (7 أيام). اتصل بالإنترنت مرة واحدة للتحقق من الترخيص.');
  }

  if (wallNow - lastSeen >= LAST_SEEN_WRITE_INTERVAL_MS) {
    try {
      store.set(LAST_SEEN_WALL_KEY, String(wallNow));
    } catch (error) {
      console.warn('Failed to persist license last-seen time:', error.message);
    }
  }

  return anchorServer + elapsed;
}

async function fetchTrustedTimeOrFallback(endpoint) {
  try {
    const serverTime = await fetchTrustedTime(endpoint);
    saveAnchor(serverTime);
    return serverTime;
  } catch (error) {
    if (error.code === 'LICENSE_TIME_ROLLBACK') throw error;
    return offlineTrustedNow(error);
  }
}

function isPackaged() {
  try {
    return require('electron').app?.isPackaged === true;
  } catch {
    return false;
  }
}

function getTimeEndpoint() {
  const packaged = isPackaged();
  let endpoint = packaged ? '' : process.env.FOX_LICENSE_TIME_URL || '';
  if (!endpoint) {
    try {
      endpoint = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).url || '';
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`تعذر قراءة إعداد خادم وقت الترخيص: ${error.message}`);
      }
    }
  }

  endpoint = String(endpoint).trim();
  if (!endpoint && !packaged) return null;
  if (!endpoint) {
    throw new Error('عنوان خادم وقت الترخيص غير مضبوط. أعد بناء التطبيق بعد ضبط FOX_LICENSE_TIME_URL.');
  }

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('عنوان خادم وقت الترخيص غير صالح');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('خادم وقت الترخيص يتطلب رابط HTTPS صالحًا دون بيانات دخول أو معاملات إضافية');
  }

  return parsed.toString();
}

async function fetchTrustedTime(endpoint) {
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new Error(`تعذر التحقق من وقت الترخيص عبر الإنترنت: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`رفض خادم وقت الترخيص الطلب (${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('استجابة خادم وقت الترخيص غير صالحة');
  }

  const serverTime = Date.parse(payload?.utc);
  if (!Number.isFinite(serverTime)) {
    throw new Error('خادم وقت الترخيص لم يُرجع وقت UTC صالحًا');
  }

  const receivedAt = performance.now();
  const roundTripMs = receivedAt - startedAt;
  const estimatedServerTime = serverTime + roundTripMs / 2;
  if (cachedTime) {
    const previousEstimate = cachedTime.serverTime + (startedAt - cachedTime.monotonicTime);
    if (estimatedServerTime < previousEstimate - 60_000) {
      const error = new Error('وقت خادم الترخيص رجع إلى الخلف؛ تم إيقاف العمليات لحماية مدة التجربة');
      error.code = 'LICENSE_TIME_ROLLBACK';
      throw error;
    }
  }

  cachedTime = {
    serverTime: estimatedServerTime,
    monotonicTime: receivedAt,
  };
  return estimatedServerTime;
}

async function getTrustedNow() {
  const endpoint = getTimeEndpoint();
  if (!endpoint) return Date.now();

  const monotonicNow = performance.now();
  if (cachedTime && monotonicNow - cachedTime.monotonicTime < CACHE_DURATION_MS) {
    return cachedTime.serverTime + (monotonicNow - cachedTime.monotonicTime);
  }

  if (!pendingRequest) {
    pendingRequest = fetchTrustedTimeOrFallback(endpoint).finally(() => {
      pendingRequest = null;
    });
  }
  return pendingRequest;
}

function resetForTesting() {
  cachedTime = null;
  pendingRequest = null;
  anchorStore = null;
}

function setAnchorStoreForTesting(store) {
  anchorStore = store;
}

module.exports = {
  getTrustedNow,
  resetForTesting,
  setAnchorStoreForTesting,
  OFFLINE_GRACE_MS,
};
