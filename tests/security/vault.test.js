// Secrets (channel API keys) must never be written to the database in plain text.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
const mockSafe = { available: false };
jest.mock('electron', () => ({
  app: { getPath: () => mockDir },
  safeStorage: {
    isEncryptionAvailable: () => mockSafe.available,
    encryptString: (s) => Buffer.from(`sealed:${s}`),
    decryptString: (b) => b.toString().replace(/^sealed:/, ''),
  },
}));

let vault;
beforeEach(() => {
  mockSafe.available = false;
  jest.restoreAllMocks();
  jest.resetModules();
  vault = require('../../electron/security/vault');
});

afterAll(() => fs.rmSync(mockDir, { recursive: true, force: true }));

test('round-trips through the AES-GCM fallback without exposing the secret', () => {
  const stored = vault.encryptSecret('sk-live-123');
  expect(stored.startsWith('enc:gcm:')).toBe(true);
  expect(stored).not.toContain('sk-live-123');
  expect(vault.decryptSecret(stored)).toBe('sk-live-123');
});

test('prefers safeStorage when it is available', () => {
  mockSafe.available = true;
  const stored = vault.encryptSecret('sk-live-123');
  expect(stored.startsWith('enc:ss:')).toBe(true);
  expect(vault.decryptSecret(stored)).toBe('sk-live-123');
});

test('throws instead of returning plain text when encryption fails', () => {
  jest.spyOn(crypto, 'createCipheriv').mockImplementation(() => { throw new Error('boom'); });
  expect(() => vault.encryptSecret('sk-live-123')).toThrow();
});

test('a safeStorage secret that cannot be opened is not handed back as the key', () => {
  mockSafe.available = true;
  const stored = vault.encryptSecret('sk-live-123');
  jest.resetModules();
  jest.doMock('electron', () => ({ app: { getPath: () => mockDir }, safeStorage: null }));
  const vaultWithoutSafeStorage = require('../../electron/security/vault');
  expect(vaultWithoutSafeStorage.decryptSecret(stored)).toBeNull();
});
