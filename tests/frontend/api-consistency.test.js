// Keeps the renderer and the preload bridge in step:
// - src/api must match what scripts/generate-renderer-api.js builds from electron/preload.js
// - every `<domain>Api.<method>` used in src must exist in that module
// (Calls to methods the bridge never exposed used to fail only when clicked.)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../..');
const { buildFiles } = require(path.join(ROOT, 'scripts/generate-renderer-api.js'));
const API_DIR = path.join(ROOT, 'src/api');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === API_DIR ? [] : sourceFiles(full);
    return /\.(jsx?)$/.test(entry.name) ? [full] : [];
  });
}

describe('src/api', () => {
  const generated = buildFiles();

  it('is up to date with electron/preload.js', () => {
    for (const [file, content] of Object.entries(generated)) {
      const onDisk = fs.readFileSync(path.join(API_DIR, file), 'utf8').replace(/\r\n/g, '\n');
      expect(onDisk, `${file} is stale; run node scripts/generate-renderer-api.js`).toBe(content);
    }
  });

  it('only exposes methods the renderer can resolve', () => {
    const exported = {};
    for (const [file, content] of Object.entries(generated)) {
      exported[file.replace(/\.js$/, '')] = new Set([...content.matchAll(/export const (\w+) =/g)].map((m) => m[1]));
    }

    const problems = [];
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      const src = fs.readFileSync(file, 'utf8');
      const namespaces = new Map();
      for (const m of src.matchAll(/import \* as (\w+) from '[^']*\/api\/(\w+)\.js';/g)) namespaces.set(m[1], m[2]);
      for (const [alias, mod] of namespaces) {
        if (!exported[mod]) {
          problems.push(`${path.relative(ROOT, file)}: no module src/api/${mod}.js`);
          continue;
        }
        for (const m of src.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))) {
          if (!exported[mod].has(m[1])) problems.push(`${path.relative(ROOT, file)}: ${alias}.${m[1]} is not in src/api/${mod}.js`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
