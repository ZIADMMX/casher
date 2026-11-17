const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { setStagingPercentage } = require('../../scripts/set-rollout');
const { backupBeforeMigration, PREFIX } = require('../../electron/database/preMigrationBackup');

describe('staged rollout (latest.yml)', () => {
  const yaml = 'version: 1.0.2\nfiles:\n  - url: a.exe\n    sha512: x\npath: a.exe\nreleaseDate: 2026-01-01\n';

  test('adds the percentage once and replaces an older one', () => {
    const first = setStagingPercentage(yaml, 10);
    expect(first).toMatch(/\nstagingPercentage: 10\n$/);
    const second = setStagingPercentage(first, 50);
    expect(second.match(/stagingPercentage/g)).toHaveLength(1);
    expect(second).toContain('stagingPercentage: 50');
  });

  test('0 pauses the release, 100 removes the limit', () => {
    expect(setStagingPercentage(yaml, 0)).toContain('stagingPercentage: 0');
    expect(setStagingPercentage(setStagingPercentage(yaml, 10), 100)).not.toContain('stagingPercentage');
  });

  test('keeps the rest of the file and handles Windows line endings', () => {
    expect(setStagingPercentage(yaml.replace(/\n/g, '\r\n'), 20)).toContain('sha512: x');
  });

  test('refuses values outside 0-100', () => {
    for (const bad of [-1, 101, 1.5, 'abc', undefined]) expect(() => setStagingPercentage(yaml, bad)).toThrow();
  });
});

describe('backup before a schema migration', () => {
  let dir;
  let db;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-mig-'));
    db = new Database(path.join(dir, 'shop.db'));
  });
  afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  test('copies a database that has data, and the copy opens with the same rows', () => {
    db.exec("CREATE TABLE sales (id INTEGER PRIMARY KEY, total REAL); INSERT INTO sales (total) VALUES (10), (20);");
    const target = backupBeforeMigration(db, 41, 43);
    expect(path.basename(target)).toMatch(new RegExp(`^${PREFIX}v41-to-v43-`));
    const copy = new Database(target, { readonly: true });
    expect(copy.prepare('SELECT SUM(total) AS t FROM sales').get().t).toBe(30);
    copy.close();
  });

  test('skips a brand-new database and an in-memory one', () => {
    expect(backupBeforeMigration(db, 0, 43)).toBeNull();
    const memory = new Database(':memory:');
    expect(backupBeforeMigration(memory, 1, 43)).toBeNull();
    memory.close();
  });

  test('keeps only the newest three', () => {
    db.exec('CREATE TABLE users (id INTEGER)');
    for (let v = 1; v <= 5; v++) {
      backupBeforeMigration(db, v, 43);
      // distinct timestamps in the file name
      const until = Date.now() + 5; while (Date.now() < until);
    }
    const kept = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith(PREFIX));
    expect(kept).toHaveLength(3);
    expect(kept.some((f) => f.includes('v1-to'))).toBe(false);
  });

  test('stops the upgrade when the backup cannot be written', () => {
    db.exec('CREATE TABLE users (id INTEGER)');
    fs.writeFileSync(path.join(dir, 'backups'), 'a file where the folder should be');
    expect(() => backupBeforeMigration(db, 1, 43)).toThrow();
  });
});
