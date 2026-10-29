jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(() => ({ id: 3, role: 'admin' })),
}));
jest.mock('../../electron/services/centralClient.service', () => ({
  getSession: jest.fn(),
  getCachedSession: jest.fn(),
  invoke: jest.fn(),
  syncQueuedReviews: jest.fn(),
}));
jest.mock('../../electron/repositories/reviews.repository', () => ({
  getPromptData: jest.fn(),
  getPendingSyncCount: jest.fn(() => 0),
  getReview: jest.fn(() => null),
  getSector: jest.fn(() => 'retail'),
  markPrompted: jest.fn(),
  saveReview: jest.fn((_tenantId, _userId, review) => review),
}));
jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(),
}));
jest.mock('../../electron/repositories/settings.repository', () => ({
  get: jest.fn((key) => (key === 'store_name' ? 'متجر النور' : null)),
}));

const authService = require('../../electron/services/auth.service');
const centralClient = require('../../electron/services/centralClient.service');
const reviewsRepo = require('../../electron/repositories/reviews.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const reviewsService = require('../../electron/services/reviews.service');

describe('reviews service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    centralClient.getSession.mockResolvedValue(null);
    shiftsRepo.getCurrentOpenShift.mockReturnValue(null);
    reviewsRepo.getPromptData.mockReturnValue({
      hasUsed14Days: true,
      hasEnoughTransactions: true,
      cooldownComplete: true,
      successfulTransactions: 30,
    });
  });

  test('claims an eligible local prompt only when no shift is open', async () => {
    shiftsRepo.getCurrentOpenShift.mockReturnValue({ id: 11, status: 'open' });
    const blockedStatus = await reviewsService.getPromptStatus('renderer-1', { claim: true });
    expect(blockedStatus.shouldPrompt).toBe(false);
    expect(reviewsRepo.markPrompted).not.toHaveBeenCalled();

    shiftsRepo.getCurrentOpenShift.mockReturnValue(null);
    const eligibleStatus = await reviewsService.getPromptStatus('renderer-1', { claim: true });
    expect(eligibleStatus).toMatchObject({
      shouldPrompt: true,
      successfulTransactions: 30,
      hasOpenShift: false,
    });
    expect(reviewsRepo.markPrompted).toHaveBeenCalledWith('local', 3);
  });

  test('suppresses automatic prompts when a central session is offline', async () => {
    const cachedSession = { id: 24, role: 'cashier', branch_id: 7 };
    centralClient.getSession.mockRejectedValue(new Error('offline'));
    centralClient.getCachedSession.mockReturnValue(cachedSession);

    const status = await reviewsService.getPromptStatus('renderer-1', { claim: true });

    expect(status).toMatchObject({ shouldPrompt: false, hasOpenShift: true });
    expect(centralClient.invoke).not.toHaveBeenCalled();
    expect(reviewsRepo.markPrompted).not.toHaveBeenCalled();
  });

  test('allows a prompt when the central server explicitly reports no open shift', async () => {
    centralClient.getSession.mockResolvedValue({ id: 24, role: 'cashier', branch_id: 7 });
    centralClient.invoke.mockResolvedValue({ message: 'No open shift currently' });

    const status = await reviewsService.getPromptStatus('renderer-1', { claim: true });

    expect(status).toMatchObject({ shouldPrompt: true, hasOpenShift: false });
    expect(reviewsRepo.markPrompted).toHaveBeenCalledWith('branch:7', 24);
  });

  test('saves negative feedback locally without sending consent or business identity', async () => {
    await reviewsService.saveReview({
      rating: 2,
      tags: ['النظام بطيء'],
      comment: 'النظام يحتاج إلى تحسين السرعة',
    }, 'renderer-1');

    expect(reviewsRepo.saveReview).toHaveBeenCalledWith('local', 3, expect.objectContaining({
      rating: 2,
      consent: false,
      businessName: null,
      businessLogo: null,
    }));
    expect(centralClient.syncQueuedReviews).not.toHaveBeenCalled();
    expect(reviewsRepo.markPrompted).toHaveBeenCalledWith('local', 3);
    expect(authService.requireAuth).toHaveBeenCalledWith('renderer-1');
  });
});
