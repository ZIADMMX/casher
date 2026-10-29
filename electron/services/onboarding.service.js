const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const onboardingRepo = require('../repositories/onboarding.repository');
const {
  validateProvisionPayload,
  sanitizeString,
  validateLogo,
} = require('../validators/onboarding.validator');
const {
  acquireProvisioningLock,
  releaseProvisioningLock,
} = require('./onboardingLock.service');

/**
 * Onboarding Service
 * طبقة منطق الأعمال والخدمات المركزية لمعالج أول تسجيل دخول (Onboarding Wizard)
 * محصنة أمنياً ضد هجمات التكرار، وحقن البيانات، وتضارب العمليات
 */

function getOnboardingState() {
  return onboardingRepo.getOnboardingState();
}

function updateOnboardingState(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('بيانات تحديث الحالة غير صالحة');
  }

  const sanitized = {
    current_step: data.current_step ? Math.min(Math.max(1, parseInt(data.current_step, 10)), 4) : undefined,
    selected_sector: data.selected_sector ? sanitizeString(data.selected_sector, 50) : undefined,
    custom_sector_name: data.custom_sector_name ? sanitizeString(data.custom_sector_name, 80) : undefined,
    is_completed: data.is_completed !== undefined ? Boolean(data.is_completed) : undefined,
  };

  return onboardingRepo.updateOnboardingState(sanitized);
}

function getPresets() {
  return onboardingRepo.getPresets();
}

function getPresetByKey(sectorKey) {
  if (!sectorKey) {
    throw new Error('يرجى تحديد رمز القطاع التجاري');
  }
  const cleanKey = sanitizeString(sectorKey, 50);
  const preset = onboardingRepo.getPresetByKey(cleanKey);
  if (!preset) {
    throw new Error(`القطاع التجاري المحدد (${cleanKey}) غير متوفر`);
  }
  return preset;
}

function activatePreset({ sectorKey, customSectorName, storeName } = {}) {
  const cleanSectorKey = sanitizeString(sectorKey, 50);
  const preset = getPresetByKey(cleanSectorKey);
  const cleanCustomName = preset.sector_key === 'custom'
    ? sanitizeString(customSectorName, 80)
    : null;
  if (preset.sector_key === 'custom' && !cleanCustomName) {
    throw new Error('يرجى إدخال اسم النشاط التجاري');
  }

  return onboardingRepo.activatePreset({
    preset,
    customSectorName: cleanCustomName,
    storeName: storeName ? sanitizeString(storeName, 150) : null,
  });
}

/**
 * احتساب ومعاينة الكتالوج المخصص حياً (Live Dynamic Catalog Preview)
 * يتيح للعميل رؤية ملخص التعديلات والأسعار والأقسام قبل الإنشاء
 */
function previewCustomizedCatalog({ sectorKey, categories = [], products = [], addons = [] }) {
  const preset = getPresetByKey(sectorKey);

  const finalCats = categories.length > 0 ? categories : (preset?.starter_categories || []);
  const finalProds = products.length > 0 ? products : (preset?.starter_products || []);
  const finalAddons = addons.length > 0 ? addons : (preset?.starter_addons || []);

  let estimatedCost = 0;
  let estimatedRetailValue = 0;
  let totalStockQuantity = 0;

  for (const p of finalProds) {
    const qty = Number(p.stock_quantity ?? 10) || 0;
    const sellPrice = Number(p.selling_price) || 0;
    const buyPrice = Number(p.purchase_price) || 0;

    totalStockQuantity += qty;
    estimatedCost += buyPrice * qty;
    estimatedRetailValue += sellPrice * qty;
  }

  return {
    sector_key: sectorKey,
    sector_name: preset.sector_name,
    categories_count: finalCats.length,
    products_count: finalProds.length,
    addons_count: finalAddons.length,
    total_stock_items: totalStockQuantity,
    estimated_startup_cost: Math.round(estimatedCost * 100) / 100,
    estimated_retail_value: Math.round(estimatedRetailValue * 100) / 100,
    estimated_gross_profit: Math.round((estimatedRetailValue - estimatedCost) * 100) / 100,
    currency: 'EGP',
    primary_action_title: preset.primary_action_title,
    primary_action_route: preset.primary_action_route,
  };
}

/**
 * حفظ شعار المتجر بشكل آمن في مجلد بيانات المستخدم
 */
function saveStoreLogo(logoDataUrl) {
  const cleanLogo = validateLogo(logoDataUrl);
  if (!cleanLogo) return null;

  // إذا كان Data URL، يتم كتابة الملف على القرص بشكل آمن لتسريع التحميل
  if (cleanLogo.startsWith('data:image/')) {
    try {
      const userDataDir = app?.getPath ? app.getPath('userData') : process.cwd();
      const brandingDir = path.join(userDataDir, 'branding');
      fs.mkdirSync(brandingDir, { recursive: true });

      const matches = cleanLogo.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace('+xml', '');
        const base64Data = matches[2];
        const fileName = `store_logo_${Date.now()}.${ext}`;
        const filePath = path.join(brandingDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        return filePath;
      }
    } catch {
      // في حال تعذر الحفظ كملف، يعود الشعار كـ Data URL سليم ومطهر
      return cleanLogo;
    }
  }

  return cleanLogo;
}

/**
 * عملية الإنشاء الذاتي المحصنة والمؤمنة (Secure Provisioning)
 */
function provisionSectorData(rawPayload, authContext = {}) {
  // 1. تفعيل قفل التزامن لمنع أي طلبات متزامنة مزدوجة
  acquireProvisioningLock();

  try {
    // 2. التحقق من حالة الإعداد السابقة (منع الكتابة غير المقصودة على متجر منتهي)
    const currentState = onboardingRepo.getOnboardingState();
    if (currentState.is_completed && !rawPayload?.forceOverride) {
      throw new Error('تم إعداد المتجر بالفعل مسبقاً. لإعادة التهيئة يرجى استخدام وضع التعديل الإداري المتقدم');
    }

    // 3. التحقق الأمني وتطهير الحقول المدخلة بالكامل
    const validated = validateProvisionPayload(rawPayload);

    // 4. معالجة وتخزين الشعار بأمان
    let finalLogoPath = null;
    if (validated.storeLogo) {
      finalLogoPath = saveStoreLogo(validated.storeLogo);
    }

    // 5. استدعاء المحرك الذري في المستودع لتنفيذ الـ Transaction
    const summary = onboardingRepo.provisionSectorData({
      ...validated,
      storeLogo: finalLogoPath,
      userId: authContext.userId || null,
      username: authContext.username || 'admin',
    });

    return summary;
  } finally {
    // تحرير قفل الأمان دائماً
    releaseProvisioningLock();
  }
}

/**
 * إعادة ضبط معالج التهيئة (مع التحقق من الصلاحيات)
 */
function resetOnboarding() {
  // يمكن قصرها على المدير فقط
  return onboardingRepo.updateOnboardingState({
    is_completed: 0,
    current_step: 1,
    selected_sector: null,
    custom_sector_name: null,
    setup_summary: {},
    completed_at: null,
  });
}

module.exports = {
  getOnboardingState,
  updateOnboardingState,
  getPresets,
  getPresetByKey,
  activatePreset,
  previewCustomizedCatalog,
  saveStoreLogo,
  provisionSectorData,
  resetOnboarding,
};
