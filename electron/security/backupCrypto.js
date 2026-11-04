const crypto = require('node:crypto');

// .fbk = "FXBK" | version(1) | keyId(8) | nonce(12) | ciphertext | GCM tag(16).
// The 25-byte header is the AAD, so changing any header byte fails authentication.

const MAGIC = Buffer.from('FXBK');
const VERSION = 1;
const KEY_ID_LENGTH = 8;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + KEY_ID_LENGTH + NONCE_LENGTH;
const MIN_LENGTH = HEADER_LENGTH + TAG_LENGTH;

const NOT_A_BACKUP_MESSAGE = 'الملف ده مش نسخة احتياطية مشفّرة من البرنامج';
const TAMPERED_MESSAGE = 'الملف اتعدّل أو تالف ومش هيتسترجع';
const BAD_RECOVERY_KEY_MESSAGE = 'في غلطة في كتابة مفتاح الاسترداد';

class BackupFormatError extends Error {
  constructor(message = NOT_A_BACKUP_MESSAGE) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

class BackupIntegrityError extends Error {
  constructor(message = TAMPERED_MESSAGE) {
    super(message);
    this.name = 'BackupIntegrityError';
  }
}

class RecoveryKeyError extends Error {
  constructor(message = BAD_RECOVERY_KEY_MESSAGE) {
    super(message);
    this.name = 'RecoveryKeyError';
  }
}

function keyIdOf(key) {
  return crypto.createHash('sha256').update('fxbk-key-id').update(key).digest().subarray(0, KEY_ID_LENGTH);
}

function encryptBackup(plain, key) {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), keyIdOf(key), nonce]);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

function readHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < MIN_LENGTH
    || !buf.subarray(0, MAGIC.length).equals(MAGIC) || buf[MAGIC.length] !== VERSION) {
    throw new BackupFormatError();
  }
  const start = MAGIC.length + 1;
  return { version: VERSION, keyId: Buffer.from(buf.subarray(start, start + KEY_ID_LENGTH)) };
}

function decryptBackup(buf, key) {
  readHeader(buf);
  const header = buf.subarray(0, HEADER_LENGTH);
  const nonce = header.subarray(HEADER_LENGTH - NONCE_LENGTH);
  const body = buf.subarray(HEADER_LENGTH, buf.length - TAG_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new BackupIntegrityError();
  }
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_PREFIX = 'FXR-';
const CHECKSUM_LENGTH = 2;
const KEY_LENGTH = 32;

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text) {
    const index = BASE32.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

function checksumOf(key) {
  return crypto.createHash('sha256').update(key).digest().subarray(0, CHECKSUM_LENGTH);
}

function formatRecoveryKey(key) {
  const text = base32Encode(Buffer.concat([key, checksumOf(key)]));
  return RECOVERY_PREFIX + text.match(/.{1,4}/g).join('-');
}

function parseRecoveryKey(text) {
  let body = String(text || '').toUpperCase().replace(/[\s-]/g, '');
  if (body.startsWith('FXR')) body = body.slice(3);
  body = body.replace(/0/g, 'O').replace(/1/g, 'I');
  const bytes = base32Decode(body);
  if (!bytes || bytes.length !== KEY_LENGTH + CHECKSUM_LENGTH) throw new RecoveryKeyError();
  const key = bytes.subarray(0, KEY_LENGTH);
  if (!checksumOf(key).equals(bytes.subarray(KEY_LENGTH))) throw new RecoveryKeyError();
  return Buffer.from(key);
}

module.exports = {
  keyIdOf,
  encryptBackup,
  readHeader,
  decryptBackup,
  formatRecoveryKey,
  parseRecoveryKey,
  BackupFormatError,
  BackupIntegrityError,
  RecoveryKeyError,
};
