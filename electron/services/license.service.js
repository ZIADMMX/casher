const os = require('node:os');
const crypto = require('node:crypto');
const dbRepo = require('../repositories/settings.repository');

const DEVELOPER_MASTER_SECRET = process.env.KASHIEAR_LICENSE_SECRET || '';

const TRIAL_DURATION_DAYS = 14;

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
    return 'KASH8888';
  }
}

/**
 * Generate a HMAC signature for a specific HWID and Expiry Date
 */
function generateLicenseKey({ hwid, expiryTimestamp }) {
  if (!DEVELOPER_MASTER_SECRET) {
    throw new Error('KASHIEAR_LICENSE_SECRET غير معرف في متغيرات البيئة');
  }
  const cleanHwid = String(hwid).trim().toUpperCase();
  const payload = `${cleanHwid}:${expiryTimestamp}`;
  const signature = crypto
    .createHmac('sha256', DEVELOPER_MASTER_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  // Encoded payload: EXPIRY_HEX
  const expiryHex = Number(expiryTimestamp).toString(16).toUpperCase();
  return `KASH-${cleanHwid}-${expiryHex}-${signature}`;
}

/**
 * Parse and Validate a License Key string
 */
function verifyLicenseKey(keyString, targetHwid = getMachineHardwareId(), now = Date.now()) {
  if (!keyString || typeof keyString !== 'string') {
    return { valid: false, reason: 'مفتاح التفعيل فارغ' };
  }

  const cleanKey = keyString.trim().toUpperCase().replace(/[\s-]/g, '');
  // Format should start with KASH followed by HWID (8 chars), EXPIRY_HEX, SIGNATURE (8 chars)
  if (!cleanKey.startsWith('KASH')) {
    return { valid: false, reason: 'تنسيق المفتاح غير صحيح' };
  }

  const body = cleanKey.substring(4);
  const targetCleanHwid = targetHwid.trim().toUpperCase();

  // Extract HWID from key
  const keyHwid = body.substring(0, 8);
  if (keyHwid !== targetCleanHwid) {
    return { valid: false, reason: 'هذا السيريال مخصص لجهاز آخر' };
  }

  const sigLength = 8;
  const signature = body.substring(body.length - sigLength);
  const expiryHex = body.substring(8, body.length - sigLength);
  const expiryTimestamp = parseInt(expiryHex, 16);

  if (isNaN(expiryTimestamp)) {
    return { valid: false, reason: 'سيريال التفعيل تالف أو غير صحيح' };
  }

  if (!DEVELOPER_MASTER_SECRET) {
    return { valid: false, reason: 'مفتاح التحقق غير مهيأ في النظام' };
  }

  // Verify HMAC signature in constant time
  const expectedPayload = `${keyHwid}:${expiryTimestamp}`;
  const expectedSig = crypto
    .createHmac('sha256', DEVELOPER_MASTER_SECRET)
    .update(expectedPayload)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  const hashExpected = crypto.createHash('sha256').update(expectedSig).digest();
  const hashActual = crypto.createHash('sha256').update(signature).digest();
  if (!crypto.timingSafeEqual(hashExpected, hashActual)) {
    return { valid: false, reason: 'توقيع المفتاح غير صحيح أو تم التلاعب به' };
  }

  // Check Expiry Date (9999999999000 is Lifetime)
  const isLifetime = expiryTimestamp >= 9000000000000;
  if (!isLifetime && now > expiryTimestamp) {
    return { valid: false, reason: 'انتهت صلاحية مفتاح التفعيل هذا' };
  }

  return {
    valid: true,
    isLifetime,
    expiryTimestamp,
    expiryDate: isLifetime ? 'مدى الحياة' : new Date(expiryTimestamp).toLocaleDateString('ar-EG'),
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
  }

  // 2. Otherwise handle 14-Day Trial Period
  let trialStart = Number(trialStartStr);
  if (!trialStart || isNaN(trialStart)) {
    trialStart = now;
    dbRepo.set('trial_start_date', String(now));
  }

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
  dbRepo.set('license_trial_purged', '0');
  dbRepo.set('license_key', keyInput.trim().toUpperCase());

  return {
    success: true,
    message: 'تم تفعيل البرنامج بنجاح! شكراً لاستخدامك Kashiear POS 🎉',
    status: getLicenseStatus(now),
  };
}

module.exports = {
  DEVELOPER_MASTER_SECRET,
  getMachineHardwareId,
  generateLicenseKey,
  verifyLicenseKey,
  getLicenseStatus,
  activateSoftware,
};
