const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

describe('Security: token revocation', () => {
  beforeAll(() => {
    mockDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    jest.requireActual('../../electron/database/db').migrateRevokedTokens(mockDb);
  });

  afterEach(() => jest.restoreAllMocks());

  test('a logged-out token stays rejected after an app restart', () => {
    let sessionService = require('../../electron/services/session.service');
    const token = sessionService.generateToken({ id: 1 });
    sessionService.invalidateToken(token);
    expect(() => sessionService.verifyToken(token)).toThrow('TokenRevoked');

    // Restart: fresh module, empty in-memory blacklist, same database.
    jest.resetModules();
    sessionService = require('../../electron/services/session.service');
    expect(() => sessionService.verifyToken(token)).toThrow('TokenRevoked');
  });

  test('a refreshed token works for a short grace period, then is rejected', () => {
    const sessionService = require('../../electron/services/session.service');
    const oldToken = sessionService.generateToken({ id: 2 });
    const newToken = sessionService.refreshToken(oldToken);

    expect(sessionService.verifyToken(oldToken).id).toBe(2); // in-flight requests still succeed

    const later = Date.now() + 61 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    expect(() => sessionService.verifyToken(oldToken)).toThrow('TokenRevoked');
    expect(sessionService.verifyToken(newToken).id).toBe(2);
  });
});
