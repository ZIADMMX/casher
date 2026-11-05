const { db } = require('../database/db');

// Internal secrets: readable only through get(key) by the main process, never
// returned by getAll() or writable through setMany() from the settings screen.
const PROTECTED_KEYS = new Set([
  'system_session_secret',
  'system_session_secret_generation',
  'last_active_session_token',
  // License and trial state (electron/services/license.service.js). Writable
  // from the settings screen, these would let anyone reset or extend the trial.
  'trial_start_date',
  'last_known_server_clock',
  'clock_rollback_detected',
  'license_key',
  'license_activated_at',
  'license_trial_purged',
  // Offline license time anchor (electron/services/licenseClock.service.js).
  'license_time_anchor_server',
  'license_time_anchor_wall',
  'license_time_last_seen_wall',
]);

const SettingsRepository = {
  PROTECTED_KEYS,

  getAll() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const row of rows) {
      if (PROTECTED_KEYS.has(row.key)) continue;
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
        if (PROTECTED_KEYS.has(key)) {
          throw new Error('لا يمكن تعديل هذا الإعداد');
        }
        stmt.run(key, String(value ?? ''));
      }
    });

    updateAll(settingsObj);
    return this.getAll();
  },
};

module.exports = SettingsRepository;
