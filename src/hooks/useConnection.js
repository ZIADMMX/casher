import { useEffect, useState } from 'react';
import { getConnectionState } from '../api/license.js';

// One shared check for every component that shows the connection: "online" means the licence server really
// answers (not just that wifi is on). When the server state is unknown yet, the browser's own answer is used.
const INTERVAL_MS = 30_000;
const listeners = new Set();
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let timer = null;

async function refresh() {
  let reachable = null;
  try { reachable = (await getConnectionState())?.reachable ?? null; } catch { /* keep the browser's answer */ }
  const next = navigator.onLine && reachable !== false;
  if (next === online) return;
  online = next;
  listeners.forEach((listener) => listener(online));
}

function start() {
  if (timer) return;
  refresh();
  timer = setInterval(refresh, INTERVAL_MS);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
}

function stop() {
  clearInterval(timer);
  timer = null;
  window.removeEventListener('online', refresh);
  window.removeEventListener('offline', refresh);
}

export function useConnection() {
  const [value, setValue] = useState(online);
  useEffect(() => {
    listeners.add(setValue);
    setValue(online);
    start();
    return () => {
      listeners.delete(setValue);
      if (!listeners.size) stop();
    };
  }, []);
  return value;
}
