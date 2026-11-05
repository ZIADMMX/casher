// The only renderer module that reads window.electronAPI (the preload bridge).
// Pages and components import named functions from src/api/<domain>.js instead,
// e.g. `import * as crmApi from '../api/crm.js'` then `crmApi.getCRMLeads()`.

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
    return target(...args);
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
