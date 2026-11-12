#!/usr/bin/env node
// Scans the repo for each sector feature in references/features.json and reports,
// per feature, whether it has backend code, a screen, and tests.
//   node .claude/skills/sector-audit/scripts/probe.js            all sectors, table
//   node .claude/skills/sector-audit/scripts/probe.js law_firm   one sector
//   node .claude/skills/sector-audit/scripts/probe.js --json     machine-readable
// Score per feature: backend 50% + UI 30% + tests 20%. A feature found only in
// config/seed files scores 0. That is the "promised on the sector card, not built" case.
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const features = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'references', 'features.json'), 'utf8'));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.find((a) => !a.startsWith('--'));

// Files that only describe or seed a sector: a match there proves nothing is built.
const CONFIG_ONLY = /sectorConfig|sectorIdentity|onboardingPresets|PageTutorial|enterprise[\\/](defaults|seed)\.js|SectorCardsStep|schema\.sql|migrations[\\/]/;
const LAYERS = {
  backend: /^electron[\\/](services|repositories|handlers)[\\/]/,
  ui: /^src[\\/](pages|components|hooks)[\\/]/,
  tests: /^tests[\\/]|\.test\.jsx?$/,
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|dist|build|release|\.git|graphify-out|\.jest-cache)$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|sql)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = ['electron', 'src', 'tests']
  .filter((d) => fs.existsSync(path.join(root, d)))
  .flatMap((d) => walk(path.join(root, d)))
  .map((full) => ({ rel: path.relative(root, full), text: fs.readFileSync(full, 'utf8') }));

function probe(feature) {
  const re = new RegExp(feature.pattern); // case-sensitive: with 'i', averageInvoice matched eInvoice
  const hits = files.filter((f) => !CONFIG_ONLY.test(f.rel) && re.test(f.text)).map((f) => f.rel);
  const configHits = files.filter((f) => CONFIG_ONLY.test(f.rel) && re.test(f.text)).length;
  const layer = (name) => hits.filter((h) => LAYERS[name].test(h));
  const backend = layer('backend');
  const ui = layer('ui');
  const tests = layer('tests');
  const score = (backend.length ? 50 : 0) + (ui.length ? 30 : 0) + (tests.length ? 20 : 0);
  const status = score === 100 ? 'done' : score >= 50 ? 'partial' : configHits ? 'config-only' : 'missing';
  return { ...feature, score, status, backend: backend.slice(0, 3), ui: ui.slice(0, 3), tests: tests.slice(0, 3), configHits };
}

const result = Object.entries(features)
  .filter(([key]) => !only || key === only)
  .map(([key, sector]) => {
    const checked = sector.features.map(probe);
    const weight = checked.reduce((s, f) => s + (f.weight || 1), 0);
    const score = Math.round(checked.reduce((s, f) => s + f.score * (f.weight || 1), 0) / weight);
    return { key, name: sector.name, score, features: checked };
  });

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2));
} else {
  const mark = { done: '✔', partial: '◐', 'config-only': '○ config', missing: '✘' };
  for (const s of result) {
    console.log(`\n${s.key} (${s.name}): ${s.score}%`);
    for (const f of s.features) {
      const where = [f.backend[0], f.ui[0], f.tests[0]].filter(Boolean).join(' | ');
      console.log(`  ${mark[f.status].padEnd(9)} ${String(f.score).padStart(3)}  ${f.title}${where ? '  ← ' + where : ''}`);
    }
  }
}
