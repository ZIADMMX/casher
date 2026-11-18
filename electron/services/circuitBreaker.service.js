// Keeps a dead server from collecting a queue of doomed requests.
// Three failed answers from a host (no connection, timeout, 5xx or 429) open its breaker:
// every later call to that host fails instantly for a cooldown that doubles up to 5 minutes,
// instead of each timer tick waiting on a socket that will never answer. After the cooldown
// one request is let through; it closes the breaker if it works, re-opens it if it does not.
//
// shortcut: keyed by host, so one dead route trips every route on the same host. Split the key
// by path if a server ever needs a breaker per route.
const OPEN_AFTER = 3;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

const hosts = new Map();

function hostOf(url) {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

function stateOf(host) {
  let state = hosts.get(host);
  if (!state) {
    state = { failures: 0, cooldownMs: BASE_COOLDOWN_MS, openUntil: 0, tripped: false };
    hosts.set(host, state);
  }
  return state;
}

function recordFailure(state) {
  state.failures += 1;
  // Once tripped a single failed probe re-opens the breaker; the cooldown grows each time.
  if (state.failures >= (state.tripped ? 1 : OPEN_AFTER)) {
    state.openUntil = Date.now() + state.cooldownMs;
    state.cooldownMs = Math.min(state.cooldownMs * 2, MAX_COOLDOWN_MS);
    state.failures = 0;
    state.tripped = true;
  }
}

function recordSuccess(state) {
  state.failures = 0;
  state.cooldownMs = BASE_COOLDOWN_MS;
  state.openUntil = 0;
  state.tripped = false;
}

// Same signature and behaviour as fetch, plus the fast failure. fetchImpl is for tests and for
// callers that already inject their own fetch.
async function guardedFetch(url, options, fetchImpl = globalThis.fetch) {
  const host = hostOf(url);
  const state = host ? stateOf(host) : null;
  if (state && Date.now() < state.openUntil) {
    const seconds = Math.ceil((state.openUntil - Date.now()) / 1000);
    const error = new Error(`الخادم (${host}) مش بيرد؛ تم إيقاف المحاولات ${seconds} ثانية ثم تُعاد تلقائيًا.`);
    error.code = 'CIRCUIT_OPEN';
    throw error;
  }

  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    if (state) recordFailure(state);
    throw error;
  }
  if (state) {
    if (response.status === 429 || response.status >= 500) recordFailure(state);
    else recordSuccess(state);
  }
  return response;
}

function stateForTesting(url) {
  return hosts.get(hostOf(url)) || null;
}

function resetForTesting() {
  hosts.clear();
}

module.exports = { guardedFetch, stateForTesting, resetForTesting };
