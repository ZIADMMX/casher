// F1: a copy of the database (e.g. a backup) must not be enough to forge session tokens.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-secret-'));
const mockDbPath = path.join(mockDir, 'shop.db');
const mockDb = new Database(mockDbPath);

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: mockDbPath }));

const settingsRepo = require('../../electron/repositories/settings.repository');

function freshSessionService() {
  jest.resetModules();
  return require('../../electron/services/session.service');
}

function allSettingValues() {
  return mockDb.prepare('SELECT value FROM settings').all().map((row) => row.value).filter(Boolean);
}

describe('Security: the session signing secret lives outside the database', () => {
  beforeAll(() => {
    mockDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    jest.requireActual('../../electron/database/db').migrateRevokedTokens(mockDb);
  });

  beforeEach(() => {
    mockDb.exec('DELETE FROM settings;');
    fs.rmSync(path.join(mockDir, 'session.key'), { force: true });
  });

  afterAll(() => {
    mockDb.close();
    fs.rmSync(mockDir, { recursive: true, force: true });
  });

  test('no value stored in the database can sign a token the app accepts', () => {
    const sessionService = freshSessionService();
    expect(sessionService.verifyToken(sessionService.generateToken({ id: 1 })).id).toBe(1);

    const candidates = allSettingValues();
    for (const value of candidates) {
      const forged = jwt.sign({ id: 1, role: 'admin', pwv: 'x', jti: 'forged' }, value);
      expect(() => sessionService.verifyToken(forged)).toThrow();
    }
    expect(settingsRepo.get('system_session_secret')).toBeNull();
  });

  test('a secret left in settings by an older build is ignored and removed', () => {
    settingsRepo.set('system_session_secret', 'leaked-secret');
    settingsRepo.set('system_session_secret_generation', '2');
    const sessionService = freshSessionService();

    const forged = jwt.sign({ id: 1, role: 'admin' }, 'leaked-secret');
    expect(() => sessionService.verifyToken(forged)).toThrow();
    expect(settingsRepo.get('system_session_secret')).toBeNull();
    expect(settingsRepo.get('system_session_secret_generation')).toBeNull();
  });

  test('the secret survives an app restart', () => {
    const token = freshSessionService().generateToken({ id: 7 });
    expect(freshSessionService().verifyToken(token).id).toBe(7);
  });

  test('rotating the secret ends every existing session', () => {
    let sessionService = freshSessionService();
    const token = sessionService.generateToken({ id: 3 });
    sessionService.rotateSecret();

    sessionService = freshSessionService();
    expect(() => sessionService.verifyToken(token)).toThrow();
    expect(sessionService.verifyToken(sessionService.generateToken({ id: 3 })).id).toBe(3);
  });
});
