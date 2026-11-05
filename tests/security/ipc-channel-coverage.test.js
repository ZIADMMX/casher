// Every IPC channel the renderer can call must be guarded on purpose.
// Reads the handler sources, so a new channel is checked without editing this file.
const fs = require('node:fs');
const path = require('node:path');
const { getPermissionForChannel, VALID_PERMISSIONS } = require('../../electron/security/permissions');

const HANDLERS_DIR = path.join(__dirname, '../../electron/handlers');
const ELECTRON_DIR = path.join(__dirname, '../../electron');

// Same list safeHandle uses to rate-limit writes.
const MUTATING_ACTION = /^(add|create|update|delete|remove|save|process|open|close|record|change|reset|import|restore|transfer|adjust|count|sync|submit|approve|reject|reschedule|cancel|receive|pay|activate|deactivate|generate|start|stop|set|toggle|assign|mark|clear|void|archive|complete|convert|reorder|move|anonymize|selectAttachment|checkIn|checkOut|clockIn|clockOut)/i;

// Checked by their handler, not the permission map (login, LAN client, licensing).
const SELF_GUARDED_PREFIXES = /^(auth|central|license):/;

// No permission exists for these, so only the main admin may call them. Deliberate.
const ADMIN_ONLY = new Set([
  'payroll:getAllPeriods', 'payroll:getDetails', 'payroll:generatePeriod', 'payroll:payEmployee',
  'payroll:approvePeriod', 'payroll:deletePeriod', 'payroll:getAllAdvances', 'payroll:createAdvance',
  'resilience:getHealth',
]);

// Names that look like writes but only read data.
const READ_ONLY_DESPITE_NAME = new Set([
  'ai:generateReport', // builds a report from existing data
  'crm:openAttachment', // opens a stored file
]);

// Registered with ipcMain directly because they run before anyone can log in.
// recovery.handler.js restarts the app from the error screen, even when overloaded or logged out;
// it only accepts calls from the app's own page.
const DIRECT_IPC_FILES = new Set(['onboarding.handler.js', 'recovery.handler.js']);

function readChannels() {
  const channels = [];
  for (const file of fs.readdirSync(HANDLERS_DIR)) {
    if (file === 'safeHandle.js' || !file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(HANDLERS_DIR, file), 'utf8');
    for (const part of source.split(/safeHandle\(\s*'/).slice(1)) {
      channels.push({
        file,
        channel: part.slice(0, part.indexOf("'")),
        customAuthorize: /authorize\s*:/.test(part.split(/safeHandle\(/)[0]),
      });
    }
  }
  return channels;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const channels = readChannels();
const guardedByMap = channels.filter((c) => !SELF_GUARDED_PREFIXES.test(c.channel) && !c.customAuthorize);

describe('Security: IPC channel permission coverage', () => {
  test('finds the registered channels', () => {
    expect(channels.length).toBeGreaterThan(300);
  });

  test('channel names are unique', () => {
    const seen = new Map();
    const duplicates = channels.filter((c) => {
      const first = seen.get(c.channel);
      seen.set(c.channel, c.file);
      return first != null;
    });
    expect(duplicates).toEqual([]);
  });

  test('every map-guarded channel resolves to a real permission or is a known admin-only channel', () => {
    const unmapped = guardedByMap
      .filter((c) => !ADMIN_ONLY.has(c.channel))
      // import:excel picks its permission from args.type; checked separately below.
      .filter((c) => c.channel !== 'import:excel')
      .filter((c) => getPermissionForChannel(c.channel, [{}]) == null)
      .map((c) => `${c.channel} (${c.file})`);
    expect(unmapped).toEqual([]);
  });

  test('no channel maps to a permission key that does not exist', () => {
    const unknown = guardedByMap
      .map((c) => ({ ...c, permission: getPermissionForChannel(c.channel, [{}]) }))
      .filter((c) => c.permission != null && !VALID_PERMISSIONS.has(c.permission))
      .map((c) => `${c.channel} -> ${c.permission}`);
    expect(unknown).toEqual([]);
  });

  test('write actions never resolve to a view permission', () => {
    const readGranted = guardedByMap
      .filter((c) => MUTATING_ACTION.test(c.channel.split(':').pop()))
      .filter((c) => !READ_ONLY_DESPITE_NAME.has(c.channel))
      .map((c) => ({ ...c, permission: getPermissionForChannel(c.channel, [{}]) }))
      .filter((c) => c.permission?.endsWith('.view'))
      .map((c) => `${c.channel} -> ${c.permission}`);
    expect(readGranted).toEqual([]);
  });

  test('import:excel maps each import type and refuses unknown types', () => {
    expect(getPermissionForChannel('import:excel', [{ type: 'employees' }])).toBe('team.import');
    expect(getPermissionForChannel('import:excel', [{ type: 'products' }])).toBe('products.create');
    expect(getPermissionForChannel('import:excel', [{ type: 'customers' }])).toBe('customers.create');
    expect(getPermissionForChannel('import:excel', [{ type: 'suppliers' }])).toBe('suppliers.manage');
    expect(getPermissionForChannel('import:excel', [{ type: 'anything-else' }])).toBeNull();
  });

  test('variant edits follow product permissions', () => {
    expect(getPermissionForChannel('variants:update', [{}])).toBe('products.edit');
    expect(getPermissionForChannel('variants:delete', [{}])).toBe('products.delete');
  });

  test('stock changes need inventory permissions, not products.edit', () => {
    expect(getPermissionForChannel('inventory:getStock', [{}])).toBe('inventory.view');
    expect(getPermissionForChannel('inventory:getMovements', [{}])).toBe('inventory.view');
    expect(getPermissionForChannel('inventory:transfer', [{}])).toBe('inventory.transfer');
    expect(getPermissionForChannel('inventory:adjust', [{}])).toBe('inventory.adjust');
    expect(getPermissionForChannel('inventory:count', [{}])).toBe('inventory.adjust');
    expect(getPermissionForChannel('inventory:setReorderLevel', [{}])).toBe('inventory.manage');
    expect(getPermissionForChannel('inventory:createWarehouse', [{}])).toBe('inventory.manage');
    expect(getPermissionForChannel('inventory:updateBranch', [{}])).toBe('inventory.manage');
  });

  test('nothing registers IPC handlers outside safeHandle except the pre-login wizard', () => {
    const bypasses = walk(ELECTRON_DIR)
      .filter((file) => !file.endsWith('safeHandle.js'))
      .filter((file) => /ipcMain\.(handle|handleOnce|on|once)\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.basename(file))
      .filter((name) => !DIRECT_IPC_FILES.has(name));
    expect(bypasses).toEqual([]);
  });
});
