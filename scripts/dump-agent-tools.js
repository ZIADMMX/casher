#!/usr/bin/env node
// Rewrites agent-service/evals/tools.json from the desktop tool registry (a test fails if it drifts).
const fs = require('node:fs');
const path = require('node:path');
const { manifest } = require('../electron/services/agent/tools');

const target = path.join(__dirname, '..', 'agent-service', 'evals', 'tools.json');
fs.writeFileSync(target, `${JSON.stringify(manifest(), null, 2)}\n`);
console.log(`Wrote ${target}`);
