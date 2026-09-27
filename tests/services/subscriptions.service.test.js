jest.mock('../../electron/repositories/subscriptions.repository', () => ({
  createPackage: jest.fn(() => 1),
  getPackageById: jest.fn((id) => ({ id, name: 'باقة جلسات VIP', type: 'session_based', duration_days: 30, total_credits: 10 })),
  getAllPackages: jest.fn(() => [{ id: 1, name: 'باقة جلسات VIP' }]),
  subscribeCustomer: jest.fn(() => 50),
  getSubscriptionById: jest.fn((id) => ({ id, customer_id: 5, remaining_credits: 10, status: 'active' })),
  getAllSubscriptions: jest.fn(() => []),
  getActiveSubscriptionByCustomer: jest.fn(() => ({ id: 50, remaining_credits: 10, status: 'active' })),
  updateAutoExpirationStatus: jest.fn(),
  consumeCredit: jest.fn(() => ({ id: 50, remaining_credits: 9, status: 'active', customer_name: 'محمد' })),
  freezeSubscription: jest.fn(() => ({ id: 50, status: 'frozen', customer_name: 'محمد' })),
  unfreezeSubscription: jest.fn(() => ({ id: 50, status: 'active', customer_name: 'محمد' })),
  renewSubscription: jest.fn(() => ({ id: 50, status: 'active', customer_name: 'محمد' })),
  getSubscriptionStats: jest.fn(() => ({ active_subscriptions: 1 }))
}));

jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const subscriptionsRepo = require('../../electron/repositories/subscriptions.repository');
const subscriptionsService = require('../../electron/services/subscriptions.service');

describe('Subscriptions Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createPackage validates package name and type', () => {
    const pkg = subscriptionsService.createPackage({ name: 'باقة جلسات VIP', type: 'session_based', price: 500 });
    expect(pkg.name).toBe('باقة جلسات VIP');
    expect(subscriptionsRepo.createPackage).toHaveBeenCalled();

    expect(() => subscriptionsService.createPackage({ name: '', type: 'session_based' })).toThrow('اسم الباقة مطلوب');
    expect(() => subscriptionsService.createPackage({ name: 'اختبار', type: 'invalid_type' })).toThrow('نوع الباقة غير صحيح');
  });

  test('subscribeCustomer registers subscription', () => {
    const sub = subscriptionsService.subscribeCustomer({ customer_id: 5, package_id: 1 });
    expect(subscriptionsRepo.subscribeCustomer).toHaveBeenCalled();
    expect(sub.id).toBe(50);
  });

  test('consumeCredit deducts credits from subscription', () => {
    const updated = subscriptionsService.consumeCredit(50, 1, { id: 1 }, 201, 'خصم جلسة');
    expect(subscriptionsRepo.consumeCredit).toHaveBeenCalledWith(50, 1, 1, 201, 'خصم جلسة');
    expect(updated.remaining_credits).toBe(9);
  });

  test('freezeSubscription updates status to frozen', () => {
    const frozen = subscriptionsService.freezeSubscription(50, 'سفر العميل');
    expect(subscriptionsRepo.freezeSubscription).toHaveBeenCalledWith(50, 'سفر العميل', null);
    expect(frozen.status).toBe('frozen');
  });
});
