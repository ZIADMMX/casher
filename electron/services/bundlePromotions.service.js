const crypto = require('node:crypto');
const SettingsRepository = require('../repositories/settings.repository');
const variantsRepo = require('../repositories/productVariants.repository');

const PROMOTION_TYPES = new Set(['buy_x_get_y', 'fixed_bundle_price']);

function parseDateBoundary(value, inclusiveEnd = false) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) && inclusiveEnd
    ? `${value}T23:59:59.999Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value;
  return Date.parse(normalized);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function getBundlePromotions() {
  const stored = SettingsRepository.get('bundle_promotions');
  if (!stored) return [];

  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error('إعدادات العروض المركبة غير صالحة');
  }
  return parsed;
}

function validateBundlePromotions(promotions) {
  if (!Array.isArray(promotions) || promotions.length > 100) {
    throw new Error('قائمة العروض غير صالحة');
  }

  return promotions.map((promotion) => {
    if (!promotion || typeof promotion !== 'object' || Array.isArray(promotion)) {
      throw new Error('بيانات أحد العروض غير صالحة');
    }
    const name = String(promotion.name || '').trim();
    const eligibleVariantIds = [...new Set(
      (Array.isArray(promotion.eligibleVariantIds) ? promotion.eligibleVariantIds : [])
        .map(Number)
    )];
    if (!name || name.length > 100) throw new Error('اسم العرض مطلوب (حتى 100 حرف)');
    if (!PROMOTION_TYPES.has(promotion.type)) throw new Error('نوع العرض غير مدعوم');
    if (promotion.active != null && typeof promotion.active !== 'boolean') {
      throw new Error(`حالة العرض "${name}" غير صالحة`);
    }
    if (eligibleVariantIds.length < 2 || eligibleVariantIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('اختر متغيرين مختلفين على الأقل لهذا العرض');
    }
    for (const variantId of eligibleVariantIds) {
      if (!variantsRepo.getById(variantId)) throw new Error('أحد المنتجات المحددة للعرض لم يعد موجودًا');
    }

    const normalized = {
      id: typeof promotion.id === 'string' && /^[\w-]{1,80}$/.test(promotion.id)
        ? promotion.id
        : crypto.randomUUID(),
      name,
      type: promotion.type,
      eligibleVariantIds,
      active: promotion.active !== false,
      startsAt: promotion.startsAt || null,
      endsAt: promotion.endsAt || null,
    };

    if (
      (normalized.startsAt && typeof normalized.startsAt !== 'string') ||
      (normalized.endsAt && typeof normalized.endsAt !== 'string')
    ) {
      throw new Error(`تواريخ العرض "${name}" غير صالحة`);
    }
    if (normalized.startsAt && !Number.isFinite(parseDateBoundary(normalized.startsAt))) {
      throw new Error(`تاريخ بداية العرض "${name}" غير صالح`);
    }
    if (normalized.endsAt && !Number.isFinite(parseDateBoundary(normalized.endsAt, true))) {
      throw new Error(`تاريخ نهاية العرض "${name}" غير صالح`);
    }
    if (
      normalized.startsAt &&
      normalized.endsAt &&
      parseDateBoundary(normalized.endsAt, true) < parseDateBoundary(normalized.startsAt)
    ) {
      throw new Error(`تاريخ نهاية العرض "${name}" يسبق تاريخ بدايته`);
    }

    if (promotion.type === 'buy_x_get_y') {
      normalized.buyQuantity = Number(promotion.buyQuantity);
      normalized.freeQuantity = Number(promotion.freeQuantity);
      if (
        !Number.isSafeInteger(normalized.buyQuantity) ||
        !Number.isSafeInteger(normalized.freeQuantity) ||
        normalized.buyQuantity < 1 ||
        normalized.freeQuantity < 1 ||
        normalized.buyQuantity + normalized.freeQuantity > 100
      ) {
        throw new Error(`كميات العرض "${name}" غير صالحة`);
      }
    } else {
      normalized.bundleQuantity = Number(promotion.bundleQuantity);
      normalized.bundlePrice = Number(promotion.bundlePrice);
      if (
        !Number.isSafeInteger(normalized.bundleQuantity) ||
        normalized.bundleQuantity < 2 ||
        normalized.bundleQuantity > 100 ||
        !Number.isFinite(normalized.bundlePrice) ||
        normalized.bundlePrice < 0
      ) {
        throw new Error(`سعر أو كمية العرض "${name}" غير صالحة`);
      }
    }
    return normalized;
  });
}

function isActiveNow(promotion, now) {
  if (!promotion.active) return false;
  if (promotion.startsAt && parseDateBoundary(promotion.startsAt) > now) return false;
  if (promotion.endsAt && parseDateBoundary(promotion.endsAt, true) < now) return false;
  return true;
}

function calculatePromotionSavings(items, promotion) {
  const eligibleIds = new Set(promotion.eligibleVariantIds.map(Number));
  const units = [];
  for (const item of items) {
    if (!eligibleIds.has(Number(item.variantId))) continue;
    units.push({ price: Number(item.unitPrice), quantity: Number(item.quantity) });
  }

  if (promotion.type === 'buy_x_get_y') {
    const bundleSize = promotion.buyQuantity + promotion.freeQuantity;
    const totalQuantity = units.reduce((sum, unit) => sum + unit.quantity, 0);
    let remainingFreeUnits = Math.floor(totalQuantity / bundleSize) * promotion.freeQuantity;
    let savings = 0;
    for (const unit of units.sort((left, right) => left.price - right.price)) {
      const freeFromLine = Math.min(remainingFreeUnits, unit.quantity);
      savings += freeFromLine * unit.price;
      remainingFreeUnits -= freeFromLine;
      if (remainingFreeUnits === 0) break;
    }
    return roundMoney(savings);
  }

  const totalQuantity = units.reduce((sum, unit) => sum + unit.quantity, 0);
  const bundleCount = Math.floor(totalQuantity / promotion.bundleQuantity);
  let remainingUnits = bundleCount * promotion.bundleQuantity;
  let selectedValue = 0;
  for (const unit of units.sort((left, right) => right.price - left.price)) {
    const selectedFromLine = Math.min(remainingUnits, unit.quantity);
    selectedValue += selectedFromLine * unit.price;
    remainingUnits -= selectedFromLine;
    if (remainingUnits === 0) break;
  }
  const bundleSavings = selectedValue - bundleCount * promotion.bundlePrice;
  return roundMoney(Math.max(0, bundleSavings));
}

function getBestBundlePromotion(items, promotions = getBundlePromotions(), now = Date.now()) {
  let best = null;
  for (const promotion of promotions) {
    if (!isActiveNow(promotion, now)) continue;
    const discount = calculatePromotionSavings(items, promotion);
    if (discount > (best?.discount || 0)) {
      best = { id: promotion.id, name: promotion.name, discount };
    }
  }
  return best;
}

function saveBundlePromotions(promotions) {
  const validated = validateBundlePromotions(promotions);
  SettingsRepository.set('bundle_promotions', JSON.stringify(validated));
  return validated;
}

function previewBundlePromotions(items) {
  if (!Array.isArray(items)) throw new Error('أصناف السلة غير صالحة');
  const trustedItems = items.map((item) => {
    const variantId = Number(item.variantId);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(variantId) || variantId <= 0 || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error('أحد أصناف السلة غير صالح');
    }
    const variant = variantsRepo.getById(variantId);
    if (!variant) throw new Error('أحد المنتجات لم يعد موجودًا');
    return { variantId, quantity, unitPrice: Number(variant.selling_price) };
  });
  return getBestBundlePromotion(trustedItems);
}

module.exports = {
  getBundlePromotions,
  getBestBundlePromotion,
  previewBundlePromotions,
  saveBundlePromotions,
};
