const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dbRepo = require('../repositories/settings.repository');
const { parseLicenseKey } = require('../security/licenseSigning');

const TRIAL_DURATION_DAYS = 14;

// A second copy of the trial start, outside the app's data folder, so deleting
// the database or reinstalling does not start a fresh trial. The earlier of the
// two dates wins. Tests point it at a temp folder.
// shortcut: deleting this file too still resets the trial; a server that records each HWID's first run closes that.
function trialMarkerPath(hwid) {
  const dir = (process.env.NODE_ENV === 'test' && process.env.FOX_TRIAL_MARKER_DIR)
    || path.join(os.homedir(), 'AppData', 'Local', 'FoxCloudRuntime');
  return path.join(dir, `${hwid}.dat`);
}

function readTrialMarker(hwid) {
  try {
    const value = Number(fs.readFileSync(trialMarkerPath(hwid), 'utf8'));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeTrialMarker(hwid, trialStart) {
  try {
    fs.mkdirSync(path.dirname(trialMarkerPath(hwid)), { recursive: true });
    fs.writeFileSync(trialMarkerPath(hwid), String(trialStart));
  } catch (error) {
    console.warn('Failed to save trial marker:', error.message);
  }
}

/**
 * Generate deterministic unique Machine Fingerprint (HWID)
 */
function getMachineHardwareId() {
  try {
    const rawInfo = [
      os.hostname(),
      os.arch(),
      os.platform(),
      os.cpus()?.[0]?.model || 'GENERIC_CPU',
      os.totalmem().toString(),
    ].join('||');

    const hash = crypto.createHash('sha256').update(rawInfo).digest('hex');
    // Short 8-character uppercase HWID for easy customer reading
    return hash.substring(0, 8).toUpperCase();
  } catch {
    return 'FFFFFFFF'; // hex, so a key can still be issued for it
  }
}

// Keys issued before the switch to Ed25519 (KASH-...). They were signed with a
// shared secret that never shipped, so they cannot be verified. The copy asks
// for a new key instead of falling back to an ended trial, which wipes data.
function isLegacyKey(keyString) {
  return /^KASH/i.test(String(keyString || '').trim());
}

/**
 * Parse and validate a license key for this machine. The Ed25519 signature is
 * checked against the public key shipped with the app (security/licenseSigning).
 */
function verifyLicenseKey(keyString, targetHwid = getMachineHardwareId(), now = Date.now()) {
  if (!keyString || typeof keyString !== 'string') {
    return { valid: false, reason: 'مفتاح التفعيل فارغ' };
  }
  if (isLegacyKey(keyString)) {
    return { valid: false, legacy: true, reason: 'هذا المفتاح من إصدار قديم. اطلب مفتاح تفعيل جديد من الدعم الفني' };
  }

  const parsed = parseLicenseKey(keyString);
  if (!parsed.valid) return parsed;

  if (parsed.hwid !== String(targetHwid).trim().toUpperCase()) {
    return { valid: false, reason: 'هذا السيريال مخصص لجهاز آخر' };
  }

  if (!parsed.isLifetime && now > parsed.expiryTimestamp) {
    return { valid: false, reason: 'انتهت صلاحية مفتاح التفعيل هذا' };
  }

  return {
    valid: true,
    isLifetime: parsed.isLifetime,
    expiryTimestamp: parsed.expiryTimestamp,
    expiryDate: parsed.isLifetime ? 'مدى الحياة' : new Date(parsed.expiryTimestamp).toLocaleDateString('ar-EG'),
  };
}

/**
 * Check current system license status
 */
function getLicenseStatus(now = Date.now(), { updateClock = true } = {}) {
  const hwid = getMachineHardwareId();
  // These keys are protected: getAll() hides them and setMany() rejects them,
  // so they are read and written one by one from the main process.
  const savedKey = dbRepo.get('license_key') || '';
  const trialStartStr = dbRepo.get('trial_start_date');
  const lastKnownClockStr = dbRepo.get('last_known_server_clock');
  const clockRollbackDetected = dbRepo.get('clock_rollback_detected') === '1';

  // Anti-Clock Rollback Check
  const parsedLastKnownClock = Number(lastKnownClockStr);
  const hasLastKnownClock = Number.isFinite(parsedLastKnownClock) && parsedLastKnownClock > 0;
  const lastKnownClock = hasLastKnownClock ? parsedLastKnownClock : now;
  if (now < lastKnownClock - 60000) {
    // Clock was set back by more than 1 minute
    console.warn('تنبيه: تم اكتشاف تلاعب في ساعة النظام!');
    if (!clockRollbackDetected) {
      dbRepo.set('clock_rollback_detected', '1');
    }
  } else if (updateClock && (!hasLastKnownClock || now - lastKnownClock >= 60_000)) {
    dbRepo.set('last_known_server_clock', String(now));
  }

  // 1. If Activated with a valid license key
  if (savedKey) {
    const verification = verifyLicenseKey(savedKey, hwid, now);
    if (verification.valid) {
      return {
        isActivated: true,
        isTrial: false,
        isExpired: false,
        hwid,
        licenseType: verification.isLifetime ? 'ترخيص كامل (مدى الحياة)' : `ترخيص ممتد حتى ${verification.expiryDate}`,
        remainingDays: verification.isLifetime ? 99999 : Math.max(0, Math.ceil((verification.expiryTimestamp - now) / (1000 * 60 * 60 * 24))),
      };
    }
    // A saved key that no longer verifies (expired, old KASH format, or the
    // machine changed) locks the app with its own reason, not as a trial.
    return {
      isActivated: false,
      isTrial: false,
      isExpired: true,
      needsReactivation: true,
      trialDeadlineReached: false,
      hwid,
      remainingDays: 0,
      reason: verification.reason,
    };
  }

  // 2. Otherwise handle 14-Day Trial Period
  const marker = readTrialMarker(hwid);
  const known = [Number(trialStartStr), marker].filter((v) => Number.isFinite(v) && v > 0);
  const trialStart = known.length ? Math.min(...known) : now;
  if (String(trialStart) !== trialStartStr) dbRepo.set('trial_start_date', String(trialStart));
  if (marker !== trialStart) writeTrialMarker(hwid, trialStart);

  const trialEnd = trialStart + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = trialEnd - now;
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const trialDeadlineReached = remainingMs <= 0;

  const isExpired = clockRollbackDetected || now < lastKnownClock - 60000 || trialDeadlineReached || now < (trialStart - 60000);

  return {
    isActivated: false,
    isTrial: true,
    isExpired,
    hwid,
    remainingDays,
    warning: remainingDays > 0 && remainingDays <= 2,
    trialDeadlineReached,
    trialEndDate: new Date(trialEnd).toLocaleDateString('ar-EG'),
  };
}

/**
 * Activate the software using a License Key
 */
function activateSoftware(keyInput, now = Date.now()) {
  const hwid = getMachineHardwareId();
  const verification = verifyLicenseKey(keyInput, hwid, now);

  if (!verification.valid) {
    throw new Error(verification.reason || 'مفتاح التفعيل غير صحيح');
  }

  // license_key is written last: it is the value that marks the copy as activated.
  dbRepo.set('license_activated_at', String(now));
  dbRepo.set('license_key', keyInput.trim().toUpperCase().replace(/\s+/g, ''));

  return {
    success: true,
    message: 'تم تفعيل البرنامج بنجاح! شكراً لاستخدامك foxcloud POS 🎉',
    status: getLicenseStatus(now),
  };
}

module.exports = {
  getMachineHardwareId,
  verifyLicenseKey,
  getLicenseStatus,
  activateSoftware,
};
