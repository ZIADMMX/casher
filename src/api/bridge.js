// The only renderer module that reads window.electronAPI (the preload bridge).
// Pages and components import named functions from src/api/<domain>.js instead,
// e.g. `import * as crmApi from '../api/crm.js'` then `crmApi.getCRMLeads()`.

import { normalizeErrorMessage } from '../utils/normalizeError.js';

export class BridgeUnavailableError extends Error {
  constructor(method) {
    super(method
      ? `الخدمة "${method}" غير متاحة في هذه البيئة`
      : 'واجهة التطبيق غير متاحة في هذه البيئة');
    this.name = 'BridgeUnavailableError';
    this.method = method;
  }
}

function getBridge() {
  return typeof window === 'undefined' ? undefined : window.electronAPI;
}

// True when running inside the Electron app (false in a plain browser or a bare test DOM).
export function isBridgeAvailable() {
  return Boolean(getBridge());
}

// Wraps one bridge method. The bridge is looked up on every call, so tests and code
// that installs window.electronAPI later still work. Calls stay synchronous: a few
// bridge methods (event subscriptions, getDroppedImportFilePath) return plain values.
export function bridgeMethod(name) {
  const lookup = () => {
    const target = getBridge()?.[name];
    return typeof target === 'function' ? target : null;
  };

  function call(...args) {
    const target = lookup();
    if (!target) throw new BridgeUnavailableError(name);
    const result = target(...args);
    // Electron wraps every handler error as "Error invoking remote method 'x': Error: <message>".
    // Strip that once here so no screen ever shows the plumbing to the user.
    if (result && typeof result.then === 'function') {
      return result.catch((error) => {
        const message = normalizeErrorMessage(error, error?.message);
        if (error instanceof Error && error.message === message) throw error;
        throw new Error(message, { cause: error });
      });
    }
    return result;
  }

  // Whether this method exists right now (replaces `if (window.electronAPI?.x)` checks).
  call.isAvailable = () => lookup() !== null;
  // Calls the method if it exists, otherwise returns undefined (replaces `window.electronAPI?.x?.()`).
  call.ifAvailable = (...args) => {
    const target = lookup();
    return target ? target(...args) : undefined;
  };
  call.bridgeName = name;
  return call;
}
