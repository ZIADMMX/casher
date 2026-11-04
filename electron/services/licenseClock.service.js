const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'license-time.config.json');
const CACHE_DURATION_MS = 30_000;
let cachedTime = null;
let pendingRequest = null;

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
      throw new Error('وقت خادم الترخيص رجع إلى الخلف؛ تم إيقاف العمليات لحماية مدة التجربة');
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
    pendingRequest = fetchTrustedTime(endpoint).finally(() => {
      pendingRequest = null;
    });
  }
  return pendingRequest;
}

function resetForTesting() {
  cachedTime = null;
  pendingRequest = null;
}

module.exports = {
  getTrustedNow,
  resetForTesting,
};
