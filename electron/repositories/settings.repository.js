const { db } = require('../database/db');

const SettingsRepository = {
  getAll() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },

  get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  set(key, value) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, String(value ?? ''));
    return { key, value };
  },

  setMany(settingsObj) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateAll = db.transaction((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        stmt.run(key, String(value ?? ''));
      }
    });

    updateAll(settingsObj);
    return this.getAll();
  },
};

module.exports = SettingsRepository;
