jest.mock('../../electron/repositories/commissions.repository', () => ({
  createRule: jest.fn(() => 1),
  getRuleById: jest.fn((id) => ({ id, title: 'عمولة 10%', target_type: 'product', calculation_type: 'percentage', rate_value: 10 })),
  getAllRules: jest.fn(() => [{ id: 1, title: 'عمولة 10%', is_active: 1, target_type: 'product', calculation_type: 'percentage', rate_value: 10 }]),
  getActiveRules: jest.fn(() => [{ id: 1, title: 'عمولة 10%', is_active: 1, target_type: 'all_sales', calculation_type: 'percentage', rate_value: 10 }]),
  toggleRule: jest.fn(() => true),
  recordEarning: jest.fn(() => 10),
  getAllEarnings: jest.fn(() => [{ id: 10, amount: 50, user_name: 'علي' }]),
  createPayout: jest.fn(() => 100),
  getSummaryKPIs: jest.fn(() => ({ total_earned: 500, total_paid: 200, pending_payout: 300 }))
}));

jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const commissionsRepo = require('../../electron/repositories/commissions.repository');
const commissionsService = require('../../electron/services/commissions.service');

describe('Commissions Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createRule validates rule details', () => {
    const ruleData = { title: 'عمولة 10%', target_type: 'product', calculation_type: 'percentage', rate_value: 10 };
    const rule = commissionsService.createRule(ruleData);
    expect(commissionsRepo.createRule).toHaveBeenCalled();
    expect(rule.title).toBe('عمولة 10%');

    expect(() => commissionsService.createRule({ title: '', target_type: 'product', calculation_type: 'percentage', rate_value: 10 })).toThrow('عنوان القاعدة مطلوب');
    expect(() => commissionsService.createRule({ title: 'تست', target_type: 'invalid', calculation_type: 'percentage', rate_value: 10 })).toThrow('نوع الهدف غير صحيح');
  });

  test('evaluateSaleCommissions evaluates rules and records earnings', () => {
    const saleData = {
      totalAmount: 200,
      items: [{ variantId: 1, quantity: 2, unitPrice: 100 }],
      discount: 0,
      paymentMethod: 'cash'
    };

    commissionsService.evaluateSaleCommissions(saleData, 301, 2);
    expect(commissionsRepo.getActiveRules).toHaveBeenCalled();
    expect(commissionsRepo.recordEarning).toHaveBeenCalled();
  });

  test('payoutEarnings records payout successfully', () => {
    const payoutId = commissionsService.payoutEarnings(2, 150, 'cash', 'صرف عمولة');
    expect(commissionsRepo.createPayout).toHaveBeenCalledWith(2, 150, 'cash', 'صرف عمولة', null);
    expect(payoutId).toBe(100);
  });
});
