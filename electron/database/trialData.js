const { db } = require('./connection');

const LICENSE_SETTINGS_TO_PRESERVE = [
  'trial_start_date',
  'last_known_server_clock',
  'clock_rollback_detected',
  'license_key',
  'license_activated_at',
  'license_trial_purged',
];

function clearExpiredTrialData(database = db) {
  const settingsTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'"
  ).get();
  if (!settingsTable) {
    throw new Error('تعذر تصفير بيانات المتجر: جدول إعدادات الترخيص غير موجود');
  }

  const purgeAlreadyCompleted = database.prepare(
    "SELECT 1 FROM settings WHERE key = 'license_trial_purged' AND value = '1'"
  ).get();

  const existingLicenseSettings = database.prepare(
    `SELECT key, value FROM settings WHERE key IN (${LICENSE_SETTINGS_TO_PRESERVE.map(() => '?').join(', ')})`
  ).all(...LICENSE_SETTINGS_TO_PRESERVE);
  const tableRows = database.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != 'settings'
    ORDER BY name
  `).all();
  const virtualTableNames = tableRows
    .filter(({ sql }) => /^create virtual table/i.test(sql || ''))
    .map(({ name }) => name);
  const virtualShadowTables = new Set(tableRows
    .filter(({ name, sql }) => !sql && virtualTableNames.some((virtualName) => name.startsWith(`${virtualName}_`)))
    .map(({ name }) => name));
  const tables = tableRows
    .filter(({ name }) => !virtualShadowTables.has(name))
    .map(({ name }) => name);
  const wasForeignKeysEnabled = Boolean(database.pragma('foreign_keys', { simple: true }));

  database.pragma('secure_delete = ON');
  database.pragma('foreign_keys = OFF');

  try {
    const clearData = database.transaction(() => {
      for (const tableName of tables) {
        const quotedName = `"${tableName.replace(/"/g, '""')}"`;
        database.exec(`DELETE FROM ${quotedName}`);
      }

      database.prepare('DELETE FROM settings').run();
      const restoreLicenseSetting = database.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?)'
      );
      for (const setting of existingLicenseSettings) {
        restoreLicenseSetting.run(setting.key, setting.value);
      }

      const hasSequenceTable = database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'"
      ).get();
      if (hasSequenceTable) {
        database.prepare('DELETE FROM sqlite_sequence').run();
      }
      if (database.pragma('foreign_key_check').length > 0) {
        throw new Error('تعذر تصفير بيانات المتجر بسبب تعارض في المفاتيح الأجنبية');
      }
    });

    clearData();
    if (purgeAlreadyCompleted) return false;

    database.exec('VACUUM');
    database.pragma('wal_checkpoint(TRUNCATE)');

    const markTrialPurged = database.transaction(() => {
      database.prepare(`
        INSERT INTO settings (key, value)
        VALUES ('license_trial_purged', '1')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run();
    });
    markTrialPurged();
    return true;
  } finally {
    database.pragma(`foreign_keys = ${wasForeignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

module.exports = { clearExpiredTrialData };
