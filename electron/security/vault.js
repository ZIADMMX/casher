const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

let safeStorage = null;
try {
  const electron = require('electron');
  safeStorage = electron.safeStorage;
} catch {
  // Headless or test environment
}

// Master Key for AES-256-GCM fallback when safeStorage is not available
let fallbackMasterKey = null;

function getFallbackMasterKey() {
  if (fallbackMasterKey) return fallbackMasterKey;

  let keyPath = null;
  try {
    const electron = require('electron');
    const userData = electron.app?.getPath ? electron.app.getPath('userData') : null;
    if (userData) keyPath = path.join(userData, '.vault.key');
  } catch {}

  if (!keyPath) {
    keyPath = path.join(process.env.APPDATA || __dirname, 'kashiear', '.vault.key');
  }

  try {
    if (fs.existsSync(keyPath)) {
      fallbackMasterKey = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
    }
  } catch {}

  if (!fallbackMasterKey || fallbackMasterKey.length !== 32) {
    fallbackMasterKey = crypto.randomBytes(32);
    try {
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, fallbackMasterKey.toString('hex'), { mode: 0o600 });
    } catch {}
  }

  return fallbackMasterKey;
}

function encryptSecret(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const str = String(plainText);
  if (str.startsWith('enc:ss:') || str.startsWith('enc:gcm:')) {
    return str; // already encrypted
  }

  // 1. Prefer Electron safeStorage
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(str);
      return `enc:ss:${encryptedBuffer.toString('base64')}`;
    }
  } catch {}

  // 2. Fallback to AES-256-GCM
  try {
    const key = getFallbackMasterKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(str, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `enc:gcm:${iv.toString('hex')}:${tag}:${ciphertext}`;
  } catch (err) {
    console.warn('Vault encryption warning:', err.message);
    return str;
  }
}

function decryptSecret(cipherText) {
  if (cipherText === null || cipherText === undefined || cipherText === '') return null;
  const str = String(cipherText);

  // SafeStorage
  if (str.startsWith('enc:ss:')) {
    const base64Data = str.slice(7);
    try {
      if (safeStorage) {
        return safeStorage.decryptString(Buffer.from(base64Data, 'base64'));
      }
    } catch (err) {
      console.warn('Failed to decrypt safeStorage secret:', err.message);
      return null;
    }
  }

  // AES-256-GCM
  if (str.startsWith('enc:gcm:')) {
    const parts = str.slice(8).split(':');
    if (parts.length === 3) {
      const [ivHex, tagHex, cipherHex] = parts;
      try {
        const key = getFallbackMasterKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (err) {
        console.warn('Failed to decrypt AES-256-GCM secret:', err.message);
        return null;
      }
    }
  }

  // Plaintext legacy fallback
  return str;
}

module.exports = {
  encryptSecret,
  decryptSecret,
};
