const crypto = require('node:crypto');
const {
  keyIdOf, encryptBackup, readHeader, decryptBackup, formatRecoveryKey, parseRecoveryKey,
  BackupFormatError, BackupIntegrityError, RecoveryKeyError,
} = require('../../electron/security/backupCrypto');

const key = crypto.randomBytes(32);
const plain = crypto.randomBytes(5 * 1024);

describe('backupCrypto .fbk format', () => {
  test('round-trips the original bytes', () => {
    const enc = encryptBackup(plain, key);
    expect(enc.subarray(0, 4).equals(Buffer.from('FXBK'))).toBe(true);
    expect(readHeader(enc).keyId.equals(keyIdOf(key))).toBe(true);
    expect(decryptBackup(enc, key).equals(plain)).toBe(true);
  });

  test('two encryptions of the same data differ', () => {
    expect(encryptBackup(plain, key).equals(encryptBackup(plain, key))).toBe(false);
  });

  test('rejects any single flipped byte', () => {
    const enc = encryptBackup(plain, key);
    for (const offset of [0, 4, 5, 13, 25, 100, enc.length - 1]) {
      const bad = Buffer.from(enc);
      bad[offset] ^= 1;
      const expected = offset <= 4 ? BackupFormatError : BackupIntegrityError;
      expect(() => decryptBackup(bad, key)).toThrow(expected);
    }
  });

  test('rejects the wrong key', () => {
    const enc = encryptBackup(plain, key);
    expect(() => decryptBackup(enc, crypto.randomBytes(32))).toThrow(BackupIntegrityError);
  });

  test('rejects a plain SQLite file', () => {
    const sqlite = Buffer.concat([Buffer.from('SQLite format 3\0'), crypto.randomBytes(100)]);
    expect(() => decryptBackup(sqlite, key)).toThrow(BackupFormatError);
  });

  test('rejects empty and tiny files', () => {
    expect(() => decryptBackup(Buffer.alloc(0), key)).toThrow(BackupFormatError);
    expect(() => decryptBackup(Buffer.alloc(40), key)).toThrow(BackupFormatError);
  });

  test('rejects a truncated file', () => {
    const enc = encryptBackup(plain, key);
    expect(() => decryptBackup(enc.subarray(0, enc.length - 10), key)).toThrow(BackupIntegrityError);
  });
});

describe('backupCrypto recovery key', () => {
  test('recovery key round-trips', () => {
    const text = formatRecoveryKey(key);
    expect(text).toMatch(/^FXR-([A-Z2-7]{4}-)*[A-Z2-7]{1,4}$/);
    expect(parseRecoveryKey(text).equals(key)).toBe(true);
  });

  test('recovery key tolerates how people type it', () => {
    const text = formatRecoveryKey(key);
    expect(parseRecoveryKey(text.toLowerCase()).equals(key)).toBe(true);
    expect(parseRecoveryKey(text.replace(/-/g, ' ')).equals(key)).toBe(true);
    const digits = 'FXR-' + text.slice(4).replace(/O/g, '0').replace(/I/g, '1');
    expect(parseRecoveryKey(digits).equals(key)).toBe(true);
  });

  test('recovery key catches a one-letter typo', () => {
    const text = formatRecoveryKey(key);
    const body = text.slice(4);
    const swapped = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    expect(() => parseRecoveryKey('FXR-' + swapped)).toThrow(RecoveryKeyError);
  });
});
