// A consistent copy of the database taken right before a schema upgrade, so a bad update can be rolled back
// by putting this file back as shop.db. Kept: the newest KEEP files.
const fs = require('node:fs');
const path = require('node:path');

const KEEP = 3;
const PREFIX = 'pre-migration-';

function backupBeforeMigration(dbInstance, fromVersion, toVersion) {
  const file = dbInstance.name;
  if (!file || file === ':memory:') return null;
  const hasData = dbInstance.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sales') LIMIT 1").get();
  if (!hasData) return null; // brand-new database: nothing to protect

  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${PREFIX}v${fromVersion}-to-v${toVersion}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  try {
    dbInstance.prepare('VACUUM INTO ?').run(target); // synchronous and consistent, even with WAL
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw new Error(`تعذر أخذ نسخة احتياطية قبل ترقية قاعدة البيانات، فتم إيقاف الترقية لحماية بياناتك: ${error.message}`);
  }

  const old = fs.readdirSync(dir).filter((f) => f.startsWith(PREFIX) && f.endsWith('.db')).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return target;
}

module.exports = { backupBeforeMigration, PREFIX };
