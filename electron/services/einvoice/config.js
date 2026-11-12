// إعدادات منظومة الفاتورة الإلكترونية (مصلحة الضرائب المصرية).
// القيم كلها في جدول settings، والسر (client_secret) محمي فلا يخرج مع باقي الإعدادات.
const SettingsRepository = require('../../repositories/settings.repository');

const KEYS = {
  enabled: 'eta_enabled',
  environment: 'eta_environment',          // preprod | production
  taxNumber: 'eta_tax_number',             // الرقم الضريبي للمُصدِر
  issuerName: 'eta_issuer_name',
  branchId: 'eta_branch_code',             // كود الفرع المسجل لدى المصلحة
  activityCode: 'eta_activity_code',       // كود النشاط
  governate: 'eta_address_governate',
  regionCity: 'eta_address_region',
  street: 'eta_address_street',
  buildingNumber: 'eta_address_building',
  clientId: 'eta_client_id',
  clientSecret: 'eta_client_secret',       // محمي
  vatRate: 'eta_vat_rate',                 // نسبة القيمة المضافة (الأسعار شاملة الضريبة)
  itemCodeType: 'eta_item_code_type',      // EGS | GS1
  defaultItemCode: 'eta_default_item_code',
  signerPath: 'eta_signer_path',           // مسار أداة التوقيع على التوكن
  documentKind: 'eta_document_kind',       // invoice (فاتورة إلكترونية) | receipt (إيصال إلكتروني)
  deviceSerial: 'eta_device_serial',       // الرقم المسلسل لنقطة البيع المسجلة (للإيصال)
};

const ENDPOINTS = {
  preprod: {
    identity: 'https://id.preprod.eta.gov.eg',
    api: 'https://api.preprod.invoicing.eta.gov.eg/api/v1',
  },
  production: {
    identity: 'https://id.eta.gov.eg',
    api: 'https://api.invoicing.eta.gov.eg/api/v1',
  },
};

function read(key) {
  const value = SettingsRepository.get(key);
  return value == null ? '' : String(value).trim();
}

function getConfig() {
  const environment = read(KEYS.environment) === 'production' ? 'production' : 'preprod';
  const rawRate = read(KEYS.vatRate);
  return {
    enabled: read(KEYS.enabled) === '1',
    environment,
    endpoints: ENDPOINTS[environment],
    taxNumber: read(KEYS.taxNumber),
    issuerName: read(KEYS.issuerName),
    branchId: read(KEYS.branchId) || '0',
    activityCode: read(KEYS.activityCode),
    address: {
      country: 'EG',
      governate: read(KEYS.governate),
      regionCity: read(KEYS.regionCity),
      street: read(KEYS.street),
      buildingNumber: read(KEYS.buildingNumber),
    },
    clientId: read(KEYS.clientId),
    clientSecret: read(KEYS.clientSecret),
    // غير المسجل بضريبة القيمة المضافة يضع 0، والافتراضي النسبة العامة 14%.
    vatRate: rawRate === '' ? 14 : Math.min(Math.max(Number(rawRate) || 0, 0), 100),
    itemCodeType: read(KEYS.itemCodeType) === 'GS1' ? 'GS1' : 'EGS',
    defaultItemCode: read(KEYS.defaultItemCode),
    signerPath: read(KEYS.signerPath),
    documentKind: read(KEYS.documentKind) === 'receipt' ? 'receipt' : 'invoice',
    deviceSerial: read(KEYS.deviceSerial),
  };
}

// الحقول اللي من غيرها المصلحة بترفض المستند. تُستخدم قبل التفعيل وقبل كل إرسال.
function validateConfig(config = getConfig()) {
  const missing = [];
  if (!config.taxNumber) missing.push('الرقم الضريبي');
  if (!config.issuerName) missing.push('اسم المُصدِر');
  if (!config.activityCode) missing.push('كود النشاط');
  if (!config.address.governate) missing.push('المحافظة');
  if (!config.address.regionCity) missing.push('المدينة / المنطقة');
  if (!config.address.street) missing.push('الشارع');
  if (!config.address.buildingNumber) missing.push('رقم المبنى');
  if (!config.defaultItemCode) missing.push('كود الصنف الافتراضي (EGS/GS1)');
  // الإيصال الإلكتروني بيتبعت باسم جهاز نقطة بيع مسجّل لدى المصلحة.
  if (config.documentKind === 'receipt' && !config.deviceSerial) {
    missing.push('الرقم المسلسل لنقطة البيع');
  }
  return { valid: missing.length === 0, missing };
}

function validateCredentials(config = getConfig()) {
  const missing = [];
  if (!config.clientId) missing.push('Client ID');
  if (!config.clientSecret) missing.push('Client Secret');
  return { valid: missing.length === 0, missing };
}

// ما بيرجعش السر نفسه للواجهة، بس بيقول هل متسجل ولا لأ.
function getPublicConfig() {
  const config = getConfig();
  const { valid, missing } = validateConfig(config);
  return {
    enabled: config.enabled,
    environment: config.environment,
    taxNumber: config.taxNumber,
    issuerName: config.issuerName,
    branchId: config.branchId,
    activityCode: config.activityCode,
    ...config.address,
    clientId: config.clientId,
    hasClientSecret: Boolean(config.clientSecret),
    vatRate: config.vatRate,
    itemCodeType: config.itemCodeType,
    defaultItemCode: config.defaultItemCode,
    signerPath: config.signerPath,
    hasSigner: Boolean(config.signerPath),
    documentKind: config.documentKind,
    deviceSerial: config.deviceSerial,
    configValid: valid,
    missingFields: missing,
  };
}

const WRITABLE = {
  enabled: KEYS.enabled,
  environment: KEYS.environment,
  taxNumber: KEYS.taxNumber,
  issuerName: KEYS.issuerName,
  branchId: KEYS.branchId,
  activityCode: KEYS.activityCode,
  governate: KEYS.governate,
  regionCity: KEYS.regionCity,
  street: KEYS.street,
  buildingNumber: KEYS.buildingNumber,
  clientId: KEYS.clientId,
  clientSecret: KEYS.clientSecret,
  vatRate: KEYS.vatRate,
  itemCodeType: KEYS.itemCodeType,
  defaultItemCode: KEYS.defaultItemCode,
  signerPath: KEYS.signerPath,
  documentKind: KEYS.documentKind,
  deviceSerial: KEYS.deviceSerial,
};

function saveConfig(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('بيانات الفاتورة الإلكترونية غير صالحة');

  for (const [field, key] of Object.entries(WRITABLE)) {
    if (!(field in input)) continue;
    let value = input[field];
    if (field === 'clientSecret' && (value == null || value === '')) continue; // فاضي = سيب السر القديم
    if (field === 'enabled') value = value ? '1' : '0';
    SettingsRepository.set(key, value == null ? '' : String(value).trim());
  }

  // ما تسمحش بتشغيل المنظومة وبياناتها ناقصة، عشان ما تتكوّمش فواتير مرفوضة.
  const config = getConfig();
  if (config.enabled) {
    const { valid, missing } = validateConfig(config);
    if (!valid) {
      SettingsRepository.set(KEYS.enabled, '0');
      throw new Error(`لا يمكن تفعيل الفاتورة الإلكترونية قبل استكمال: ${missing.join('، ')}`);
    }
  }

  return getPublicConfig();
}

module.exports = { KEYS, ENDPOINTS, getConfig, getPublicConfig, saveConfig, validateConfig, validateCredentials };
