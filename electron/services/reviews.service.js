const authService = require('./auth.service');
const centralClient = require('./centralClient.service');
const reviewsRepo = require('../repositories/reviews.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const { reviewSchema } = require('../validators/schema');
const appVersion = require('../../package.json').version;

const POSITIVE_TAGS = new Set([
  'أسرع في البيع',
  'سهولة الاستخدام',
  'تقارير مفيدة',
  'دعم جيد',
  'ثبات النظام',
  'إدارة المخزون',
]);
const NEGATIVE_TAGS = new Set([
  'النظام بطيء',
  'ميزة ناقصة',
  'صعب التعلم',
  'الدعم بطيء',
  'أخطاء تقنية',
  'إدارة المخزون',
]);

function isOpenShiftResult(shift) {
  if (!shift) return false;
  if (shift.shift !== undefined) return Boolean(shift.shift);
  if (shift.currentShift !== undefined) return Boolean(shift.currentShift);
  if (shift.status) return shift.status === 'open';
  return !shift.message;
}

async function getSessionContext(callerId = 'default') {
  try {
    const remoteSession = await centralClient.getSession();
    if (remoteSession) {
      return {
        userId: remoteSession.id,
        tenantId: remoteSession.branch_id == null ? 'central' : `branch:${remoteSession.branch_id}`,
        session: remoteSession,
        isRemote: true,
      };
    }
  } catch (error) {
    const cachedSession = centralClient.getCachedSession();
    if (!cachedSession) throw error;
    return {
      userId: cachedSession.id,
      tenantId: cachedSession.branch_id == null ? 'central' : `branch:${cachedSession.branch_id}`,
      session: cachedSession,
      isRemote: true,
      offline: true,
    };
  }

  const session = authService.requireAuth(callerId);
  return {
    userId: session.id,
    tenantId: 'local',
    session,
    isRemote: false,
  };
}

async function getPromptStatus(callerId = 'default', { claim = false } = {}) {
  const context = await getSessionContext(callerId);
  const activity = reviewsRepo.getPromptData(context.tenantId, context.userId);
  let hasOpenShift;
  if (!context.isRemote) {
    hasOpenShift = Boolean(shiftsRepo.getCurrentOpenShift());
  } else if (context.offline) {
    hasOpenShift = true;
  } else {
    const shift = await centralClient.invoke({ method: 'GET', route: '/api/shifts/current' });
    hasOpenShift = isOpenShiftResult(shift);
  }
  const eligible = activity.hasUsed14Days
    && activity.hasEnoughTransactions
    && activity.cooldownComplete;
  const shouldPrompt = eligible && !hasOpenShift && !context.offline;

  if (claim && shouldPrompt) {
    reviewsRepo.markPrompted(context.tenantId, context.userId);
  }

  return {
    shouldPrompt,
    hasOpenShift,
    successfulTransactions: activity.successfulTransactions,
    latestReview: reviewsRepo.getReview(context.tenantId, context.userId),
    syncPending: reviewsRepo.getPendingSyncCount(context.tenantId, context.userId) > 0,
  };
}

async function getReview(callerId = 'default') {
  const context = await getSessionContext(callerId);
  return {
    review: reviewsRepo.getReview(context.tenantId, context.userId),
    syncPending: reviewsRepo.getPendingSyncCount(context.tenantId, context.userId) > 0,
  };
}

async function saveReview(input, callerId = 'default') {
  const context = await getSessionContext(callerId);
  const review = reviewSchema.validate(input);
  const allowedTags = review.rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS;
  const tags = [...new Set(review.tags || [])];
  if (tags.some((tag) => !allowedTags.has(tag))) {
    throw new Error('أحد الوسوم المختارة غير مناسب لهذا التقييم');
  }
  if (review.rating < 4 && review.consent) {
    throw new Error('موافقة النشر متاحة للتقييمات الإيجابية فقط');
  }

  const settingsRepo = require('../repositories/settings.repository');
  const businessLogo = review.rating >= 4 && review.consent
    ? settingsRepo.get('store_logo') || null
    : null;
  if (businessLogo && businessLogo.length > 5_000_000) {
    throw new Error('حجم شعار النشاط كبير جدًا لإرفاقه بالتقييم؛ اختر عدم إرفاق الشعار أو استخدم شعارًا أصغر');
  }
  const payload = {
    tenantId: context.tenantId,
    userId: context.userId,
    rating: review.rating,
    tags,
    comment: review.comment || null,
    consent: review.rating >= 4 && review.consent === true,
    status: 'pending',
    sector: reviewsRepo.getSector(),
    appVersion,
    businessName: review.rating >= 4 && review.consent
      ? settingsRepo.get('store_name') || null
      : null,
    businessLogo,
  };

  const savedReview = reviewsRepo.saveReview(context.tenantId, context.userId, payload);
  reviewsRepo.markPrompted(context.tenantId, context.userId);
  let syncPending = true;
  let syncError = null;
  if (!context.offline && context.isRemote) {
    try {
      const syncResult = await centralClient.syncQueuedReviews(context.tenantId, context.userId);
      syncPending = reviewsRepo.getPendingSyncCount(context.tenantId, context.userId) > 0;
      syncError = syncResult.error;
    } catch (error) {
      syncError = error.message;
    }
  } else if (!context.isRemote) {
    syncError = 'هذا الحساب المحلي غير مرتبط بالخادم المركزي؛ حُفظ التقييم على هذا الجهاز فقط.';
  }

  return { review: savedReview, syncPending, syncError };
}

module.exports = {
  getSessionContext,
  getPromptStatus,
  getReview,
  saveReview,
};
