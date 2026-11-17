const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lockToOwner, MARKER } = require('../../electron/security/dataLock');
const { SECURITY_HEADERS, isProduction } = require('../../electron/security/securityHeaders');
const { applyCorsPolicy } = require('../../electron/security/corsPolicy');
const { getPermissionForApi } = require('../../electron/security/permissions');

function fakeRes() {
  const headers = {};
  return {
    headers,
    getHeader: (n) => headers[n],
    setHeader: (n, v) => { headers[n] = v; },
    writeHead() {},
    end() {},
  };
}

describe('data folder is locked to its owner', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-lock-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('locks the folder once and leaves a marker', () => {
    expect(lockToOwner(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, MARKER))).toBe(true);
    expect(lockToOwner(dir)).toBe(true);
  });

  test('other accounts have no access (Windows ACL / Unix mode)', () => {
    lockToOwner(dir);
    if (process.platform === 'win32') {
      const acl = spawnSync('icacls', [dir], { encoding: 'utf8' }).stdout;
      expect(acl).toContain(process.env.USERNAME);
      expect(acl).not.toMatch(/Everyone|BUILTIN\\Users|Authenticated Users/);
    } else {
      expect(fs.statSync(dir).mode & 0o077).toBe(0);
    }
  });

  test('never throws for a missing or in-memory path', () => {
    expect(lockToOwner(':memory:')).toBe(false);
    expect(lockToOwner(path.join(dir, 'missing', 'deep'))).toBe(false);
  });
});

describe('API responses carry security headers', () => {
  test('every response gets nosniff, no-frame, no-store and a locked CSP', () => {
    const res = fakeRes();
    applyCorsPolicy({ headers: {}, method: 'GET' }, res);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers[name]).toBe(value);
    expect(res.headers['X-Frame-Options']).toBe('DENY');
  });
});

describe('production mode', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = original; });

  test('anything except development/test counts as production', () => {
    for (const [env, expected] of [[undefined, true], ['production', true], ['staging', true], ['development', false], ['test', false]]) {
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      expect(isProduction()).toBe(expected);
    }
  });

  test('the Vite dev origin is refused in production and allowed in development', () => {
    const origin = 'http://localhost:5173';
    process.env.NODE_ENV = 'production';
    expect(applyCorsPolicy({ headers: { origin }, method: 'GET' }, fakeRes())).toBe(false);
    process.env.NODE_ENV = 'development';
    expect(applyCorsPolicy({ headers: { origin }, method: 'GET' }, fakeRes())).toBe(true);
  });

  test('the packaged app (origin null) is always allowed', () => {
    process.env.NODE_ENV = 'production';
    expect(applyCorsPolicy({ headers: { origin: 'null' }, method: 'GET' }, fakeRes())).toBe(true);
  });
});

describe('REST API fails closed', () => {
  test('an unknown route needs the admin permission', () => {
    expect(getPermissionForApi('/api/forgotten-route', 'GET')).toBe('settings.manage');
    expect(getPermissionForApi('/api/forgotten-route', 'DELETE')).toBe('settings.manage');
  });

  test('every route in routes/ needs a permission except the user\'s own /auth routes', () => {
    const routesDir = path.join(__dirname, '..', '..', 'routes');
    const open = [];
    for (const file of fs.readdirSync(routesDir).filter((f) => f !== 'index.js')) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      for (const [, method, route] of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
        if (!getPermissionForApi(`/api${route}`, method.toUpperCase())) open.push(`${method.toUpperCase()} ${route}`);
      }
    }
    expect(open.every((r) => r.includes('/auth/'))).toBe(true);
  });
});
