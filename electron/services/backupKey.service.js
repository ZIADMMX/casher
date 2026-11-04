const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { keyIdOf, formatRecoveryKey, parseRecoveryKey } = require('../security/backupCrypto');

const KEY_LENGTH = 32;
const CORRUPT_MESSAGE = 'مفتاح النسخ الاحتياطية على الجهاز تالف. استخدم مفتاح الاسترداد';
const UNAVAILABLE_MESSAGE = 'حماية ويندوز لتخزين المفاتيح مش متاحة، فمش هينفع نعمل نسخ احتياطية مشفّرة';
const WRONG_KEY_MESSAGE = 'المفتاح ده مش بتاع النسخة دي';

function keyringPath() {
  return path.join(app.getPath('userData'), 'backup.key');
}

function requireEncryption() {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) throw new Error(UNAVAILABLE_MESSAGE);
}

// Returns null when the file does not exist; throws CORRUPT_MESSAGE when it exists but is unusable.
function readKeyring() {
  let raw;
  try {
    raw = fs.readFileSync(keyringPath(), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw new Error(CORRUPT_MESSAGE);
  }
  try {
    const ring = JSON.parse(raw);
    if (!ring || ring.version !== 1 || typeof ring.primary !== 'string'
      || !ring.keys || typeof ring.keys !== 'object' || typeof ring.keys[ring.primary] !== 'string') {
      throw new Error('shape');
    }
    return ring;
  } catch {
    throw new Error(CORRUPT_MESSAGE);
  }
}

function writeKeyring(ring) {
  const target = keyringPath();
  const temp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(ring), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (err) {
    try { fs.rmSync(temp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

function sealKey(key) {
  return safeStorage.encryptString(key.toString('hex')).toString('base64');
}

function openKey(blob) {
  let key;
  try {
    key = Buffer.from(safeStorage.decryptString(Buffer.from(blob, 'base64')), 'hex');
  } catch {
    throw new Error(CORRUPT_MESSAGE);
  }
  if (key.length !== KEY_LENGTH) throw new Error(CORRUPT_MESSAGE);
  return key;
}

function ensureBackupKey() {
  requireEncryption();
  const existing = readKeyring();
  if (existing) return { keyId: existing.primary, created: false };
  const key = crypto.randomBytes(KEY_LENGTH);
  const keyId = keyIdOf(key).toString('hex');
  writeKeyring({ version: 1, primary: keyId, keys: { [keyId]: sealKey(key) } });
  return { keyId, created: true };
}

function getPrimaryKey() {
  requireEncryption();
  const ring = readKeyring();
  if (!ring) throw new Error(CORRUPT_MESSAGE);
  return openKey(ring.keys[ring.primary]);
}

function findKey(keyId) {
  requireEncryption();
  const ring = readKeyring();
  if (!ring) return null;
  const blob = ring.keys[Buffer.from(keyId).toString('hex')];
  return typeof blob === 'string' ? openKey(blob) : null;
}

function adoptRecoveryKey(text, expectedKeyId) {
  requireEncryption();
  const key = parseRecoveryKey(text);
  const keyId = keyIdOf(key);
  if (!keyId.equals(expectedKeyId)) throw new Error(WRONG_KEY_MESSAGE);
  const ring = readKeyring() || { version: 1, primary: '', keys: {} };
  const hex = keyId.toString('hex');
  ring.keys[hex] = sealKey(key);
  ring.primary = hex;
  writeKeyring(ring);
  return key;
}

function getRecoveryKey() {
  return formatRecoveryKey(getPrimaryKey());
}

module.exports = { ensureBackupKey, getPrimaryKey, findKey, adoptRecoveryKey, getRecoveryKey };
