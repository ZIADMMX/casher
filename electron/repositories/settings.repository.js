const { db } = require('../database/db');
const { encryptSecret, decryptSecret } = require('../security/vault');

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
  // Proof that the licence agreement was accepted at activation. Writable from
  // the settings screen, it could be forged or wiped.
  'eula_accepted_version',
  'eula_accepted_at',
  'license_trial_purged',
  // Offline license time anchor (electron/services/licenseClock.service.js).
  'license_time_anchor_server',
  'license_time_anchor_wall',
  'license_time_last_seen_wall',
  'license_time_offline_runtime',
  'license_server_trial_start',
  // Open admin-recovery challenge (electron/services/auth.service.js).
  'recovery_challenge',
  // Failed-login counters and lockouts (electron/services/auth.service.js): must not be wipeable from the settings screen.
  'login_lockouts',
  // Write keys / inbox tokens for the Worker (tracking.service.js, delivery.service.js).
  'tracking_write_key',
  'delivery_inbox_token',
  // Claims this device's cloud customer store before activation (cloudCustomerSync.service.js).
  'cloud_customer_sync_key',
  // ETA e-invoice API secret (electron/services/einvoice/config.js): written and
  // read only through the e-invoice screen, never echoed back to the renderer.
  'eta_client_secret',
  // AI provider key (electron/services/ai/llmClient.js): sealed by the vault, read only by the main process.
  'codecraft_api_key',
  // External backup folder (externalBackup.service.js): set only through the folder picker, so the
  // settings screen cannot point backups at an arbitrary path or fake the last copy time.
  'external_backup_dir',
  'external_backup_last_at',
]);

// Stored encrypted (vault): a copied database file or backup does not reveal them.
// Old plain-text values are still read as they are and get sealed the next time they are saved.
const SEALED_KEYS = new Set(['eta_client_secret', 'tracking_write_key', 'delivery_inbox_token', 'cloud_customer_sync_key']);
const seal = (key, value) => (SEALED_KEYS.has(key) && value ? encryptSecret(value) : value);

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
    if (!row) return null;
    return SEALED_KEYS.has(key) ? decryptSecret(row.value) : row.value;
  },

  set(key, value) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, seal(key, String(value ?? '')));
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
