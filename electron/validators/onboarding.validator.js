/**
 * Onboarding Security & Validation Shield
 * طبقة التحقق الأمني وتطهير المدخلات لمعالج التهيئة الأولى
 * تمنع هجمات XSS، التلاعب بالبيانات، الأسعار السالبة، وحقن الملفات
 */

const MAX_STORE_NAME_LEN = 100;
const MAX_CATEGORY_NAME_LEN = 80;
const MAX_PRODUCT_NAME_LEN = 120;
const MAX_STATION_NAME_LEN = 60;
const MAX_ADDON_NAME_LEN = 80;
const MAX_LOGO_BASE64_LEN = 7 * 1024 * 1024; // ~5MB raw image limit

/**
 * دالة تطهير النصوص لمنع حقن كود XSS أو وسوم HTML الخبيثة
 */
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // إزالة وسوم السكريبت
    .replace(/<[^>]+>/g, '') // إزالة أي وسوم HTML أخرى
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .slice(0, maxLength);
}

/**
 * فحص سلامة الشعار المرفوع لمنع حقن الملفات أو الثغرات
 */
function validateLogo(logoStr) {
  if (!logoStr || typeof logoStr !== 'string') return null;
  const trimmed = logoStr.trim();
  if (!trimmed) return null;

  // في حال كان الشعار Base64 Data URL
  if (trimmed.startsWith('data:image/')) {
    const validMimes = [
      'data:image/png;base64,',
      'data:image/jpeg;base64,',
      'data:image/jpg;base64,',
      'data:image/webp;base64,',
      'data:image/svg+xml;base64,',
    ];
    const hasValidMime = validMimes.some((prefix) => trimmed.startsWith(prefix));
    if (!hasValidMime) {
      throw new Error('صيغة صورة الشعار غير مدعومة. يرجى استخدام (PNG, JPG, WEBP, SVG)');
    }
    if (trimmed.length > MAX_LOGO_BASE64_LEN) {
      throw new Error('حجم صورة الشعار كبير جداً. الحد الأقصى المسموح به هو 5 ميجابايت');
    }
    return trimmed;
  }

  // في حال كان مسار ملف على الجهاز
  if (trimmed.includes('..') || /[\0\r\n]/.test(trimmed)) {
    throw new Error('مسار ملف الشعار غير آمن أو يحتوي على أحرف غير مسموح بها');
  }

  return trimmed;
}

/**
 * التحقق من مواعيد العمل
 */
function validateWorkingHours(workingHours) {
  if (!workingHours) return null;

  if (typeof workingHours === 'string') {
    return sanitizeString(workingHours, 300);
  }

  if (typeof workingHours === 'object') {
    const days = Array.isArray(workingHours.days)
      ? workingHours.days.map((d) => sanitizeString(d, 30))
      : [];
    const closedDays = Array.isArray(workingHours.closed_days)
      ? workingHours.closed_days.map((d) => sanitizeString(d, 30))
      : [];
    const openTime = sanitizeString(workingHours.open_time || '09:00', 10);
    const closeTime = sanitizeString(workingHours.close_time || '23:00', 10);

    return {
      days,
      closed_days: closedDays,
      open_time: openTime,
      close_time: closeTime,
      formatted_text: sanitizeString(workingHours.formatted_text || '', 255),
    };
  }

  return null;
}

/**
 * التحقق من قائمة الأقسام
 */
function validateCategories(categories) {
  if (!Array.isArray(categories)) return [];
  if (categories.length > 80) {
    throw new Error('الحد الأقصى للأقسام في الإعداد الأولي هو 80 قسماً');
  }

  const cleaned = [];
  const seen = new Set();

  for (const cat of categories) {
    let name = '';
    let station = null;

    if (typeof cat === 'string') {
      name = sanitizeString(cat, MAX_CATEGORY_NAME_LEN);
    } else if (cat && typeof cat === 'object') {
      name = sanitizeString(cat.name || '', MAX_CATEGORY_NAME_LEN);
      if (cat.station) {
        station = sanitizeString(cat.station, MAX_STATION_NAME_LEN);
      }
    }

    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      cleaned.push({ name, station });
    }
  }

  return cleaned;
}

/**
 * التحقق من قائمة الإضافات (Addons)
 */
function validateAddons(addons) {
  if (!Array.isArray(addons)) return [];
  if (addons.length > 50) {
    throw new Error('الحد الأقصى للإضافات هو 50 إضافة');
  }

  const cleaned = [];
  for (const addon of addons) {
    if (!addon || typeof addon !== 'object') continue;
    const name = sanitizeString(addon.name || '', MAX_ADDON_NAME_LEN);
    if (!name) continue;

    const price = Number(addon.price);
    if (isNaN(price) || price < 0 || !isFinite(price)) {
      throw new Error(`سعر الإضافة "${name}" غير صحيح. يجب أن يكون رقماً موجباً`);
    }

    cleaned.push({
      name,
      price: Math.round(price * 100) / 100,
      currency: sanitizeString(addon.currency || 'EGP', 10),
    });
  }

  return cleaned;
}

/**
 * التحقق من قائمة المنتجات والأسعار والتكاليف
 */
function validateProducts(products) {
  if (!Array.isArray(products)) return [];
  if (products.length > 300) {
    throw new Error('الحد الأقصى للمنتجات في التهيئة الأولى هو 300 منتج');
  }

  const cleaned = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || typeof p !== 'object') continue;

    const name = sanitizeString(p.name || '', MAX_PRODUCT_NAME_LEN);
    if (!name) continue;

    const sellingPrice = Number(p.selling_price);
    if (isNaN(sellingPrice) || sellingPrice < 0 || !isFinite(sellingPrice)) {
      throw new Error(`سعر بيع المنتج "${name}" غير صحيح. يجب أن يكون رقماً موجباً`);
    }

    const purchasePrice = Number(p.purchase_price || 0);
    if (isNaN(purchasePrice) || purchasePrice < 0 || !isFinite(purchasePrice)) {
      throw new Error(`سعر تكلفة المنتج "${name}" غير صحيح`);
    }

    const stockQty = Number(p.stock_quantity ?? 10);
    const minStock = Number(p.low_stock_threshold ?? 3);
    const isService = p.is_service === true || p.is_service === 1;

    cleaned.push({
      name,
      category_name: sanitizeString(p.category_name || '', MAX_CATEGORY_NAME_LEN),
      selling_price: Math.round(sellingPrice * 100) / 100,
      purchase_price: Math.round(purchasePrice * 100) / 100,
      stock_quantity: isService ? 0 : Math.max(0, Math.floor(isNaN(stockQty) ? 0 : stockQty)),
      low_stock_threshold: isService ? 0 : Math.max(0, Math.floor(isNaN(minStock) ? 0 : minStock)),
      is_service: isService,
      size: p.size ? sanitizeString(p.size, 30) : null,
      color: p.color ? sanitizeString(p.color, 30) : null,
      description: p.description ? sanitizeString(p.description, 255) : '',
      package: validatePackage(p.package),
    });
  }

  return cleaned;
}

const PACKAGE_TYPES = new Set(['time_based', 'session_based', 'product_quota', 'membership']);

// Gym membership terms carried by a product; anything malformed means "not a package".
function validatePackage(pkg) {
  if (!pkg || typeof pkg !== 'object' || !PACKAGE_TYPES.has(pkg.type)) return null;
  const toInt = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const durationDays = toInt(pkg.duration_days);
  if (durationDays < 1) return null;
  return {
    type: pkg.type,
    duration_days: durationDays,
    total_credits: toInt(pkg.total_credits),
    max_freeze_days: toInt(pkg.max_freeze_days),
  };
}

/**
 * الفحص الشامل لحزمة الإنشاء والتهيئة (Provision Payload)
 */
function validateProvisionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('بيانات التهيئة غير صالحة');
  }

  const sectorKey = sanitizeString(payload.sectorKey || '', 50);
  if (!sectorKey) {
    throw new Error('يرجى اختيار نوع النشاط التجاري');
  }

  const storeName = sanitizeString(payload.storeName || '', MAX_STORE_NAME_LEN);
  if (!storeName || storeName.length < 2) {
    throw new Error('اسم النشاط التجاري يجب ألا يقل عن حرفين');
  }

  const storeLogo = validateLogo(payload.storeLogo);
  const storePhone = sanitizeString(payload.storePhone || '', 30);
  const storeAddress = sanitizeString(payload.storeAddress || '', 200);
  const customSectorName = payload.customSectorName ? sanitizeString(payload.customSectorName, 80) : null;

  const categories = validateCategories(payload.categories);
  const products = validateProducts(payload.products);
  const addons = validateAddons(payload.addons);
  const workingHours = validateWorkingHours(payload.workingHours);

  const stations = Array.isArray(payload.stations)
    ? payload.stations
        .map((s) => (typeof s === 'string' ? sanitizeString(s, MAX_STATION_NAME_LEN) : sanitizeString(s?.name || '', MAX_STATION_NAME_LEN)))
        .filter(Boolean)
    : [];

  return {
    sectorKey,
    storeName,
    storeLogo,
    storePhone,
    storeAddress,
    customSectorName,
    categories,
    products,
    addons,
    stations,
    workingHours,
    forceOverride: Boolean(payload.forceOverride),
  };
}

module.exports = {
  sanitizeString,
  validateLogo,
  validateWorkingHours,
  validateCategories,
  validateAddons,
  validateProducts,
  validateProvisionPayload,
};
