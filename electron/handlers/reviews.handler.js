const authService = require('../services/auth.service');
const reviewsService = require('../services/reviews.service');
const centralClient = require('../services/centralClient.service');
const { safeHandle } = require('./safeHandle');
const { reviewSchema } = require('../validators/schema');

async function authorizeReviewRequest(event) {
  if (centralClient.getCachedSession()) return;
  authService.requireAuth(event?.sender?.id ?? 'default');
}

function registerReviewsHandlers() {
  safeHandle('reviews:getPromptStatus', async (event, options) => (
    reviewsService.getPromptStatus(event?.sender?.id ?? 'default', options)
  ), { authorize: authorizeReviewRequest });

  safeHandle('reviews:get', async (event) => (
    reviewsService.getReview(event?.sender?.id ?? 'default')
  ), { authorize: authorizeReviewRequest });

  safeHandle('reviews:save', reviewSchema, async (event, review) => (
    reviewsService.saveReview(review, event?.sender?.id ?? 'default')
  ), { authorize: authorizeReviewRequest });

  safeHandle('reviews:sync', async (event) => {
    const context = await reviewsService.getSessionContext(event?.sender?.id ?? 'default');
    if (!context.isRemote) {
      const cloud = await require('../services/reviewsCloud.service').syncPending();
      return {
        syncedCount: cloud.sent,
        pendingCount: require('../repositories/reviews.repository')
          .getPendingSyncCount(context.tenantId, context.userId),
        error: cloud.error || null,
        syncError: cloud.error || null,
      };
    }
    const result = await centralClient.syncQueuedReviews(context.tenantId, context.userId);
    return { ...result, syncError: result.error };
  }, {
    authorize: authorizeReviewRequest,
  });
}

module.exports = { registerReviewsHandlers };
