// base.md + an optional <sector>.md next to it. Plain markdown: edit without touching code.
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  try {
    return fs.readFileSync(path.join(__dirname, `${name}.md`), 'utf8').trim();
  } catch {
    return '';
  }
}

function loadPrompt(sector) {
  const safe = /^[a-z_]{1,40}$/.test(sector || '') ? sector : '';
  return [read('base'), safe && safe !== 'base' ? read(safe) : ''].filter(Boolean).join('\n\n');
}

module.exports = { loadPrompt };
