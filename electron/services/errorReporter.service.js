// Sends errors from installed copies to the license Worker (POST /api/errors), so the vendor
// sees a crash before the shop calls. Only in the packaged app (FOX_ERROR_REPORTS=1 forces it on,
// =0 off). The same error is counted, not repeated; reports go out in small batches once a minute.
// Never throws and never calls logError (logError calls this).
const os = require('node:os');
const { guardedFetch } = require('./circuitBreaker.service');

const FLUSH_MS = 60_000;
const MAX_QUEUE = 50;
const BATCH = 10;
const MAX_MESSAGE = 300;
const MAX_STACK = 1500;

const queue = new Map();
let timer = null;
let flushing = false;

function isEnabled() {
  if (process.env.FOX_ERROR_REPORTS === '0') return false;
  if (process.env.FOX_ERROR_REPORTS === '1') return true;
  try {
    return require('electron').app?.isPackaged === true;
  } catch {
    return false;
  }
}

// Windows user names show up in file paths; they are not needed to fix a bug.
function scrub(text, max) {
  let value = String(text ?? '');
  const home = os.homedir();
  if (home) value = value.split(home).join('~');
  return value.slice(0, max);
}

function keyOf(item) {
  return `${item.context}|${item.message}`;
}

function report(context, err) {
  try {
    if (!isEnabled()) return;
    const item = {
      context: String(context || 'unknown').slice(0, 120),
      message: scrub(err instanceof Error ? err.message : err, MAX_MESSAGE),
      stack: scrub(err instanceof Error ? err.stack : '', MAX_STACK),
      count: 1,
      at: Date.now(),
    };
    const existing = queue.get(keyOf(item));
    if (existing) existing.count += 1;
    else if (queue.size < MAX_QUEUE) queue.set(keyOf(item), item);
    schedule();
  } catch {
    // reporting must never break the caller
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush().catch(() => {});
  }, FLUSH_MS);
  timer.unref?.();
}

function endpoint() {
  const timeUrl = require('./licenseClock.service').getTimeEndpoint();
  return timeUrl ? new URL('/api/errors', timeUrl).toString() : null;
}

function appVersion() {
  try {
    return require('electron').app?.getVersion?.() || '';
  } catch {
    return '';
  }
}

async function flush(fetchImpl = globalThis.fetch) {
  if (flushing || queue.size === 0) return { sent: 0 };
  let url = null;
  try {
    url = endpoint();
  } catch {
    url = null;
  }
  if (!url || typeof fetchImpl !== 'function') return { sent: 0 };

  flushing = true;
  const items = [...queue.values()].slice(0, BATCH);
  try {
    const { getDeviceId } = require('../security/deviceId');
    const res = await guardedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: getDeviceId(), version: appVersion(), items }),
      signal: AbortSignal.timeout(10_000),
    }, fetchImpl);
    // Rate limits and server errors keep the batch for the next try; anything else is final.
    if (res.status !== 429 && res.status < 500) {
      for (const item of items) queue.delete(keyOf(item));
    }
    return { sent: res.ok ? items.length : 0, status: res.status };
  } catch {
    return { sent: 0 }; // offline: try again next minute
  } finally {
    flushing = false;
    if (queue.size) schedule();
  }
}

function pendingForTesting() {
  return [...queue.values()];
}

function resetForTesting() {
  queue.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  flushing = false;
}

module.exports = { report, flush, pendingForTesting, resetForTesting };
