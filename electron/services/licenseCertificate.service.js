const crypto = require('node:crypto');
const Settings = require('../repositories/settings.repository');
const { getDeviceId, getMachineHardwareId } = require('../security/deviceId');
const { getLicenseStatus } = require('./license.service');
const { db } = require('../database/db');
const { logError } = require('./logger.service');

function getSubscriptionEndpoint() {
  if (process.env.FOX_SUBSCRIPTION_SYNC_URL) {
    return process.env.FOX_SUBSCRIPTION_SYNC_URL;
  }
  const licenseUrl = process.env.FOX_LICENSE_TIME_URL;
  if (licenseUrl && licenseUrl.includes('/api/license/time')) {
    return licenseUrl.replace('/api/license/time', '/api/sync/subscription');
  }
  return 'https://foxcloud-license.foxcloud-pos.workers.dev/api/sync/subscription';
}

function generateCertificateNumber(hwid) {
  const cleanHwid = String(hwid || '00000000').toUpperCase().slice(0, 8);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `FOX-CERT-${cleanHwid}-${yearMonth}-${randomSuffix}`;
}

/**
 * Get or create current official license certificate
 */
function getCertificate() {
  const licenseStatus = getLicenseStatus();
  const rawSaved = Settings.get('license_certificate');
  if (rawSaved) {
    try {
      const parsed = JSON.parse(rawSaved);
      // If hardware ID matches and status is current, return saved certificate
      if (parsed.hwid === licenseStatus.hwid && parsed.isActivated === licenseStatus.isActivated) {
        return parsed;
      }
    } catch {}
  }

  // Construct fresh certificate
  const hwid = licenseStatus.hwid || getMachineHardwareId();
  const storeName = Settings.get('store_name') || 'متجر foxcloud';
  const storePhone = Settings.get('store_phone') || '';
  const storeAddress = Settings.get('store_address') || '';
  const businessType = Settings.get('business_type') || 'عام';
  const licenseKey = Settings.get('license_key') || '';

  // Get admin owner full name
  let ownerName = 'المدير العام';
  try {
    const admin = db.prepare("SELECT full_name, username FROM users WHERE role = 'admin' LIMIT 1").get();
    if (admin) {
      ownerName = admin.full_name || admin.username || ownerName;
    }
  } catch {}

  const certNumber = generateCertificateNumber(hwid);
  const activatedAt = Number(Settings.get('license_activated_at')) || Date.now();
  const planType = licenseStatus.licenseType?.includes('مدى الحياة')
    ? 'مدى الحياة (Lifetime)'
    : (licenseStatus.licenseType || (licenseStatus.isTrial ? 'فترة تجريبية (14 يوم)' : 'سنوي (Annual)'));

  const certificate = {
    certificateNumber: certNumber,
    hwid,
    storeName,
    ownerName,
    phone: storePhone,
    address: storeAddress,
    businessType,
    planType,
    licenseKey: licenseKey || 'نسخة تجريبية مسجلة',
    isActivated: licenseStatus.isActivated,
    isTrial: licenseStatus.isTrial,
    remainingDays: licenseStatus.remainingDays,
    activatedAt,
    activatedDateAr: new Date(activatedAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
    expiryDateAr: licenseStatus.expiryDate || (licenseStatus.isTrial ? `متبقي ${licenseStatus.remainingDays} يوم` : 'غير محدد'),
    systemVendor: 'foxcloud POS Systems International',
    verificationDomain: 'https://foxcloud-license.foxcloud-pos.workers.dev',
    issuedAt: new Date().toISOString(),
  };

  try {
    Settings.set('license_certificate', JSON.stringify(certificate));
  } catch (err) {
    logError('LicenseCertificate:save', err);
  }

  return certificate;
}

/**
 * Sync certificate to Cloudflare D1
 */
async function syncCertificateToCloud(certificate = getCertificate()) {
  try {
    const device = getDeviceId();
    if (!device) return { success: false, error: 'Device hardware ID unavailable' };

    const payload = {
      device,
      hwid: certificate.hwid,
      store_name: certificate.storeName,
      owner_name: certificate.ownerName,
      phone: certificate.phone,
      business_type: certificate.businessType,
      plan_type: certificate.planType,
      license_key: certificate.licenseKey,
      activated_at: certificate.activatedAt || Date.now(),
      expires_at: null,
      certificate_number: certificate.certificateNumber,
      certificate_data: JSON.stringify(certificate),
    };

    let key = '';
    try { key = String(Settings.get('license_key') || '').trim(); } catch { key = ''; }
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;

    const response = await fetch(getSubscriptionEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Sync certificate error: ${response.status} ${errText}`);
    }

    const result = await response.json();
    return {
      success: true,
      message: 'تم توثيق وحفظ شهادة الترخيص في السحابة بنجاح',
      certificate,
      result,
    };
  } catch (error) {
    logError('LicenseCertificate:syncCloud', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getCertificate,
  syncCertificateToCloud,
};

