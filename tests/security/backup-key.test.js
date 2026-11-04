const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-key-'));
const mockState = { available: true };

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => mockDir) },
  safeStorage: {
    isEncryptionAvailable: () => mockState.available,
    encryptString: (s) => Buffer.from('enc:' + s),
    decryptString: (b) => b.toString().slice(4),
  },
}));

const keyFile = path.join(mockDir, 'backup.key');
const { keyIdOf, formatRecoveryKey, parseRecoveryKey } = require('../../electron/security/backupCrypto');

let svc;
beforeEach(() => {
  mockState.available = true;
  fs.rmSync(keyFile, { force: true });
  jest.resetModules();
  svc = require('../../electron/services/backupKey.service');
});
afterAll(() => fs.rmSync(mockDir, { recursive: true, force: true }));

test('creates one key and keeps it across restarts', () => {
  const first = svc.ensureBackupKey();
  expect(first.created).toBe(true);
  const key = svc.getPrimaryKey();
  jest.resetModules();
  svc = require('../../electron/services/backupKey.service');
  const second = svc.ensureBackupKey();
  expect(second).toEqual({ keyId: first.keyId, created: false });
  expect(svc.getPrimaryKey().equals(key)).toBe(true);
  expect(key.length).toBe(32);
});

test('never stores the key in clear', () => {
  svc.ensureBackupKey();
  const key = svc.getPrimaryKey();
  const raw = fs.readFileSync(keyFile, 'utf8');
  expect(raw).not.toContain(key.toString('hex'));
  expect(raw).not.toContain(key.toString('base64'));
});

test('refuses to work without safeStorage', () => {
  mockState.available = false;
  expect(() => svc.ensureBackupKey()).toThrow();
  expect(fs.existsSync(keyFile)).toBe(false);
});

test('does not replace a corrupted keyring', () => {
  fs.writeFileSync(keyFile, '{not json');
  expect(() => svc.ensureBackupKey()).toThrow('مفتاح النسخ الاحتياطية على الجهاز تالف. استخدم مفتاح الاسترداد');
  expect(fs.readFileSync(keyFile, 'utf8')).toBe('{not json');
});

test('adopting a recovery key makes it primary and keeps the old one', () => {
  svc.ensureBackupKey();
  const a = svc.getPrimaryKey();
  const b = crypto.randomBytes(32);
  const adopted = svc.adoptRecoveryKey(formatRecoveryKey(b), keyIdOf(b));
  expect(adopted.equals(b)).toBe(true);
  expect(svc.getPrimaryKey().equals(b)).toBe(true);
  expect(svc.findKey(keyIdOf(a)).equals(a)).toBe(true);
  expect(svc.findKey(keyIdOf(crypto.randomBytes(32)))).toBeNull();
});

test('a recovery key for another backup is rejected and changes nothing', () => {
  svc.ensureBackupKey();
  const before = fs.readFileSync(keyFile);
  const b = crypto.randomBytes(32);
  const c = crypto.randomBytes(32);
  expect(() => svc.adoptRecoveryKey(formatRecoveryKey(b), keyIdOf(c))).toThrow("المفتاح ده مش بتاع النسخة دي");
  expect(fs.readFileSync(keyFile).equals(before)).toBe(true);
});

test('getRecoveryKey parses back to the primary key', () => {
  svc.ensureBackupKey();
  expect(parseRecoveryKey(svc.getRecoveryKey()).equals(svc.getPrimaryKey())).toBe(true);
});
