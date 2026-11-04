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

  test('a secret from an older build is rotated once and old tokens stop working', () => {
    const jwt = require('jsonwebtoken');
    const sessionService = require('../../electron/services/session.service');
    const leakedToken = jwt.sign({ id: 1, role: 'admin' }, 'jwt-signing-secret');

    expect(() => sessionService.verifyToken(leakedToken)).toThrow();
    const rotated = settingsRepo.get('system_session_secret');
    expect(rotated).not.toBe('jwt-signing-secret');
    expect(settingsRepo.get('system_session_secret_generation')).toBe('2');
    expect(settingsRepo.get('last_active_session_token')).toBe('');

    // Stable afterwards: new tokens keep verifying with the same secret.
    const fresh = sessionService.generateToken({ id: 2 });
    expect(sessionService.verifyToken(fresh).id).toBe(2);
    expect(settingsRepo.get('system_session_secret')).toBe(rotated);
  });

  test('setMany rejects protected keys and rolls back the whole batch', () => {
    expect(() => settingsRepo.setMany({
      store_name: 'Changed',
      system_session_secret: 'attacker-secret',
    })).toThrow();
    expect(settingsRepo.get('system_session_secret')).toBe('jwt-signing-secret');
    expect(settingsRepo.get('store_name')).toBe('Fox');
  });
});
