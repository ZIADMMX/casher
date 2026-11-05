#!/usr/bin/env node
// Generates src/api/<domain>.js from the sections of electron/preload.js, so the
// renderer imports named functions instead of reaching into window.electronAPI.
//
//   node scripts/generate-renderer-api.js          write src/api/*.js
//   node scripts/generate-renderer-api.js --check  exit 1 if src/api is out of date
//
// Run it after adding, renaming or removing a method in preload.js.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(ROOT, 'electron', 'preload.js');
const OUT_DIR = path.join(ROOT, 'src', 'api');

// preload.js section comment -> src/api module name
const SECTION_MODULES = [
  [/^Products and variants|^Categories/, 'products'],
  [/^Returns/, 'sales'],
  [/^Backups/, 'settings'],
  [/^Reports/, 'reports'],
  [/^Printing/, 'printing'],
  [/^Customers/, 'customers'],
  [/^Excel export/, 'importExport'],
  [/^Users & employees/, 'users'],
  [/^Attendance & leave/, 'attendance'],
  [/^Sales/, 'sales'],
  [/^Suppliers & Purchases/, 'purchases'],
  [/^Shifts/, 'shifts'],
  [/^Authentication/, 'auth'],
  [/^Cashier & User Audit/, 'audit'],
  [/^Store Settings/, 'settings'],
  [/^License/, 'license'],
  [/^Excel Import/, 'importExport'],
  [/^Real-time Notifications/, 'notifications'],
  [/^Operations & Orders/, 'orders'],
  [/^Subscriptions/, 'subscriptions'],
  [/^Commissions/, 'commissions'],
  [/^Payroll/, 'payroll'],
  [/^Salon|^Live Chair/, 'salon'],
  [/^Legal Cases/, 'legal'],
  [/^Supermarket & Grocery/, 'grocery'],
  [/^CRM/, 'crm'],
  [/^Resilience|^High-Performance Load Balancer|^Multi-Terminal LAN/, 'system'],
  [/^Enterprise Dynamic/, 'enterprise'],
  [/^Branches, warehouses/, 'inventory'],
  [/^Screen Designer/, 'uiConfig'],
  [/^Onboarding/, 'onboarding'],
];

// Reads the exposeInMainWorld('electronAPI', {...}) object and groups its keys by section.
function readPreloadSections(preloadSource) {
  const lines = preloadSource.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.includes("exposeInMainWorld('electronAPI'"));
  if (start < 0) throw new Error("preload.js: exposeInMainWorld('electronAPI', ...) not found");

  const modules = new Map([['app', { titles: ['App lifecycle'], methods: [] }]]);
  let current = 'app';
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('});')) break;
    const section = /^ {2}\/\/ (.+)$/.exec(line);
    if (section) {
      const hit = SECTION_MODULES.find(([re]) => re.test(section[1]));
      if (!hit) throw new Error(`preload.js: no src/api module for section "${section[1]}" (add it to SECTION_MODULES)`);
      current = hit[1];
      if (!modules.has(current)) modules.set(current, { titles: [], methods: [] });
      modules.get(current).titles.push(section[1].replace(/\s*\(.*\)\s*$/, ''));
      continue;
    }
    // top-level keys of the bridge object (some lines are not indented)
    const key = /^ {0,2}([a-zA-Z0-9_]+):/.exec(line);
    if (key) modules.get(current).methods.push(key[1]);
  }

  const all = [...modules.values()].flatMap((m) => m.methods);
  const dupes = all.filter((n, i) => all.indexOf(n) !== i);
  if (dupes.length) throw new Error('preload.js: duplicate bridge keys: ' + dupes.join(', '));
  for (const [name, m] of modules) if (!m.methods.length) modules.delete(name);
  return modules;
}

function renderModule(titles, methods) {
  return `// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// ${titles.join('; ')}
import { bridgeMethod } from './bridge.js';

${methods.map((n) => `export const ${n} = bridgeMethod('${n}');`).join('\n')}
`;
}

function buildFiles(preloadSource = fs.readFileSync(PRELOAD, 'utf8')) {
  const files = {};
  for (const [name, { titles, methods }] of readPreloadSections(preloadSource)) {
    files[`${name}.js`] = renderModule(titles, methods);
  }
  return files;
}

function main() {
  const files = buildFiles();
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(OUT_DIR, file);
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (existing === content) continue;
    if (check) stale.push(file);
    else fs.writeFileSync(target, content);
  }
  if (check && stale.length) {
    console.error('src/api is out of date with electron/preload.js: ' + stale.join(', '));
    console.error('Run: node scripts/generate-renderer-api.js');
    process.exit(1);
  }
  if (!check) console.log(`Wrote ${Object.keys(files).length} modules to src/api/`);
}

if (require.main === module) main();

module.exports = { readPreloadSections, buildFiles };
