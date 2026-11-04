jest.mock('../../electron/repositories/crm.repository', () => ({
  addInteraction: jest.fn(() => 1),
  getInteractionsByCustomer: jest.fn(() => [{ id: 1, type: 'call', subject: 'مكالمة متابعة' }]),
  getRawTimelineElementsForCustomer: jest.fn(() => [
    { kind: 'interaction', type: 'call', title: 'مكالمة متابعة', created_at: '2026-09-26 12:00:00' }
  ]),
  createOpportunity: jest.fn(() => 10),
  getAllOpportunities: jest.fn(() => [{ id: 10, title: 'توريد أجهزة', stage: 'lead' }]),
  updateOpportunityStage: jest.fn(() => ({ id: 10, stage: 'won' })),
  updateCustomerRatingAndTier: jest.fn(() => true),
  getAllCampaigns: jest.fn(() => []),
  createCampaign: jest.fn(() => 3),
  getCampaignById: jest.fn((id) => ({
    id,
    name: 'إعادة شراء الهواتف',
    target_criteria: JSON.stringify({
      product_keyword: 'هاتف',
      months_since_purchase: 10,
      follow_up_days: 1,
      offer_title: 'عرض إكسسوارات',
      offer_details: '',
      discount_percentage: 0
    })
  })),
  getCampaignAudience: jest.fn(() => [{ id: 2, name: 'عميل' }]),
  createCampaignReminders: jest.fn(() => 1),
  getDueReminders: jest.fn(() => [{ id: 5, customer_name: 'عميل', subject: 'متابعة عرض' }]),
  markReminderSent: jest.fn(() => ({ changes: 1 }))
}));

jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn(() => ({ id: 1 })) }));
jest.mock('../../electron/repositories/crmAdvanced.repository', () => ({
  getDueActivities: jest.fn(() => []),
  markActivityReminderSent: jest.fn(() => ({ changes: 1 })),
  getStaleOpportunities: jest.fn(() => []),
  markOpportunityStaleReminderSent: jest.fn(() => ({ changes: 1 }))
}));

const crmRepo = require('../../electron/repositories/crm.repository');
const advancedCRMRepo = require('../../electron/repositories/crmAdvanced.repository');
const notificationsService = require('../../electron/services/notifications.service');
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

  test('creates validated behavior campaigns and loads their eligible audience', () => {
    const campaign = crmService.createCampaign({
      name: 'إعادة شراء الهواتف',
      product_keyword: 'هاتف',
      months_since_purchase: 10,
      follow_up_days: 1,
      offer_title: 'عرض إكسسوارات'
    });

    expect(crmRepo.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: 'إعادة شراء الهواتف',
      targetCriteria: expect.objectContaining({ product_keyword: 'هاتف', months_since_purchase: 10 })
    }));
    expect(campaign.id).toBe(3);
    expect(crmService.getCampaignAudience(3)).toEqual([{ id: 2, name: 'عميل' }]);
    expect(crmRepo.getCampaignAudience).toHaveBeenCalledWith(campaign.target_criteria, 3);
    expect(() => crmService.createCampaign({
      name: 'حملة غير صالحة',
      product_keyword: 'هاتف',
      months_since_purchase: 0,
      follow_up_days: 1,
      offer_title: 'عرض'
    })).toThrow('مدة الشراء السابقة');
  });

  test('creates campaign reminders once for campaign audience', () => {
    expect(crmService.createCampaignReminders(3)).toEqual({ createdCount: 1 });
    expect(crmRepo.createCampaignReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 }),
      expect.objectContaining({ product_keyword: 'هاتف' })
    );
  });

  test('marks a due reminder after its notification is saved', () => {
    crmService.checkDueReminders();
    expect(notificationsService.notify).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('تذكير متابعة'),
      linkPage: 'customers'
    }));
    expect(crmRepo.markReminderSent).toHaveBeenCalledWith(5);
  });

  test('keeps a due reminder retryable if notification delivery fails', () => {
    notificationsService.notify.mockReturnValueOnce(null);
    crmService.checkDueReminders();
    expect(crmRepo.markReminderSent).not.toHaveBeenCalled();
  });

  test('sends one CRM reminder for activities and deals idle for seven days', () => {
    advancedCRMRepo.getDueActivities.mockReturnValueOnce([
      { id: 8, title: 'مكالمة متابعة', owner_user_id: 2 }
    ]);
    advancedCRMRepo.getStaleOpportunities.mockReturnValueOnce([
      { id: 9, title: 'تجديد عقد', customer_name: 'عميل', user_id: 3 }
    ]);

    crmService.checkDueReminders();

    expect(advancedCRMRepo.markActivityReminderSent).toHaveBeenCalledWith(8);
    expect(advancedCRMRepo.markOpportunityStaleReminderSent).toHaveBeenCalledWith(9);
    expect(notificationsService.notify).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('متوقفة منذ 7 أيام'),
      linkPage: 'crm'
    }));
  });
});
