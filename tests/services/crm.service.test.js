jest.mock('../../electron/repositories/crm.repository', () => ({
  addInteraction: jest.fn(() => 1),
  getInteractionsByCustomer: jest.fn(() => [{ id: 1, type: 'call', subject: 'مكالمة متابعة' }]),
  getRawTimelineElementsForCustomer: jest.fn(() => [
    { kind: 'interaction', type: 'call', title: 'مكالمة متابعة', created_at: '2026-09-26 12:00:00' }
  ]),
  createOpportunity: jest.fn(() => 10),
  getAllOpportunities: jest.fn(() => [{ id: 10, title: 'توريد أجهزة', stage: 'lead' }]),
  updateOpportunityStage: jest.fn(() => ({ id: 10, stage: 'won' })),
  updateCustomerRatingAndTier: jest.fn(() => true)
}));

jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const crmRepo = require('../../electron/repositories/crm.repository');
const crmService = require('../../electron/services/crm.service');

describe('CRM Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('addInteraction validates type and subject', () => {
    const data = { customer_id: 1, type: 'call', subject: 'استفسار عميل' };
    const list = crmService.addInteraction(data);
    expect(crmRepo.addInteraction).toHaveBeenCalled();
    expect(Array.isArray(list)).toBe(true);

    expect(() => crmService.addInteraction({ customer_id: 1, type: 'invalid', subject: 'تست' })).toThrow('نوع التواصل غير صحيح');
    expect(() => crmService.addInteraction({ type: 'call', subject: 'تست' })).toThrow('معرف العميل مطلوب');
  });

  test('getUnifiedTimeline returns sorted aggregated timeline', () => {
    const timeline = crmService.getUnifiedTimeline(1);
    expect(crmRepo.getRawTimelineElementsForCustomer).toHaveBeenCalledWith(1);
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline[0].title).toBe('مكالمة متابعة');
  });

  test('createOpportunity creates a new deal opportunity', () => {
    const oppId = crmService.createOpportunity({ customer_id: 1, title: 'توريد أجهزة', expected_value: 5000 });
    expect(crmRepo.createOpportunity).toHaveBeenCalled();
    expect(oppId).toBe(10);
  });

  test('updateOpportunityStage updates deal stage', () => {
    const updated = crmService.updateOpportunityStage(10, 'won');
    expect(crmRepo.updateOpportunityStage).toHaveBeenCalledWith(10, 'won');
    expect(updated.stage).toBe('won');

    expect(() => crmService.updateOpportunityStage(10, 'invalid_stage')).toThrow('مرحلة الصفقة غير صحيحة');
  });
});
