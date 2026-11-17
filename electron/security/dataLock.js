// Locks the data folder (database, backups, vault key) to the Windows/Unix user who runs the app,
// so other accounts on the same PC cannot copy or read shop.db.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MARKER = '.owner-only';

function lockToOwner(dir) {
  if (!dir || dir === ':memory:') return false;
  const marker = path.join(dir, MARKER);
  try {
    if (fs.existsSync(marker)) return true;
    if (process.platform === 'win32') {
      const user = `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || ''}`.replace(/^\\/, '');
      if (!process.env.USERNAME) return false;
      // (OI)(CI): new files (WAL, backups) inherit it. Only the owner gets access, so Users/Everyone lose it.
      const result = spawnSync('icacls', [dir, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], { windowsHide: true, timeout: 15000 });
      if (result.status !== 0) return false;
    } else {
      fs.chmodSync(dir, 0o700);
    }
    fs.writeFileSync(marker, 'ok');
    return true;
  } catch {
    // Best effort: a locked-down or read-only folder must never stop the app from starting.
    return false;
  }
}

module.exports = { lockToOwner, MARKER };
