const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

const settingsRepo = require('../../electron/repositories/settings.repository');

describe('Security: internal secrets are not exposed through settings', () => {
  beforeEach(() => {
    mockDb.exec(`
      DROP TABLE IF EXISTS settings;
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    settingsRepo.set('store_name', 'Fox');
    settingsRepo.set('system_session_secret', 'jwt-signing-secret');
    settingsRepo.set('last_active_session_token', 'persisted-token');
  });

  test('getAll hides the JWT signing secret and the persisted session token', () => {
    const all = settingsRepo.getAll();
    expect(all.store_name).toBe('Fox');
    expect(all).not.toHaveProperty('system_session_secret');
    expect(all).not.toHaveProperty('last_active_session_token');
  });

  test('get(key) still returns protected values to the main process', () => {
    expect(settingsRepo.get('system_session_secret')).toBe('jwt-signing-secret');
  });

  test('setMany rejects protected keys and rolls back the whole batch', () => {
    expect(() => settingsRepo.setMany({
      store_name: 'Changed',
      system_session_secret: 'attacker-secret',
    })).toThrow();
    expect(settingsRepo.get('system_session_secret')).toBe('jwt-signing-secret');
    expect(settingsRepo.get('store_name')).toBe('Fox');
  });

  describe('license and trial state', () => {
    const LICENSE_KEYS = [
      'trial_start_date',
      'last_known_server_clock',
      'clock_rollback_detected',
      'license_key',
      'license_activated_at',
      'license_trial_purged',
      'license_time_anchor_server',
      'license_time_anchor_wall',
      'license_time_last_seen_wall',
    ];

    test.each(LICENSE_KEYS)('settings screen cannot overwrite %s', (key) => {
      settingsRepo.set(key, 'original');

      expect(() => settingsRepo.setMany({ [key]: 'attacker-value' })).toThrow();
      expect(settingsRepo.get(key)).toBe('original');
    });

    test('getAll does not expose license and trial state', () => {
      for (const key of LICENSE_KEYS) settingsRepo.set(key, '1');

      const all = settingsRepo.getAll();
      for (const key of LICENSE_KEYS) expect(all).not.toHaveProperty(key);
    });
  });
});
