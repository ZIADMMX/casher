jest.mock('../../electron/repositories/crmAdvanced.repository', () => ({
  assignOpportunity: jest.fn((data) => data),
  createCompany: jest.fn(() => 21),
  createLead: jest.fn(() => 11),
  deleteLead: jest.fn(() => ({ deleted: true })),
  getActivities: jest.fn(() => []),
  getCustomFields: jest.fn(() => []),
  getLeads: jest.fn(() => []),
  getLeadById: jest.fn((id) => ({
    id,
    name: 'Lead',
    status: 'new',
    customer_id: null,
    owner_user_id: 2,
  })),
  getCRMUsers: jest.fn(() => [{ id: 2, username: 'sales' }]),
  getCompanies: jest.fn(() => [{ id: 5, owner_user_id: 4, parent_company_id: null }]),
  recordExists: jest.fn(() => true),
  createActivity: jest.fn(() => 31),
  createOpportunity: jest.fn(() => 51),
  createCustomerRelationship: jest.fn(() => 41),
  setCustomFieldValues: jest.fn(),
  isActiveUser: jest.fn((id) => id === 2 || id === 4),
  updateCompany: jest.fn((data) => data),
  updateLead: jest.fn((data) => data),
  createCustomField: jest.fn(() => 61),
  getCustomFieldValues: jest.fn(() => ({})),
  getCustomFieldById: jest.fn(),
  updateCustomField: jest.fn((data) => data),
  reorderCustomFields: jest.fn(() => []),
  moveOpportunity: jest.fn((data) => data),
}));

jest.mock('../../electron/services/crm.cache', () => ({
  invalidate: jest.fn(),
}));

const repo = require('../../electron/repositories/crmAdvanced.repository');
const crmCache = require('../../electron/services/crm.cache');
const crmAdvanced = require('../../electron/services/crmAdvanced.service');

describe('Advanced CRM assignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns active CRM assignees', () => {
    expect(crmAdvanced.getCRMUsers()).toEqual([{ id: 2, username: 'sales' }]);
  });

  test('rejects inactive assignees when creating a lead', () => {
    expect(() => crmAdvanced.createLead({ name: 'Lead', owner_user_id: 99 }, 1))
      .toThrow('المسؤول غير موجود أو غير مفعّل');
    expect(repo.createLead).not.toHaveBeenCalled();
  });

  test('validates every company field before reading or writing company records', () => {
    expect(() => crmAdvanced.createCompany({
      name: 'Valid company',
      website: { toString: 'not text' },
    }, 1)).toThrow('الموقع الإلكتروني غير صالح');
    expect(repo.getCompanies).not.toHaveBeenCalled();
    expect(repo.createCompany).not.toHaveBeenCalled();
  });

  test('rejects invalid optional company identifiers instead of treating them as empty', () => {
    expect(() => crmAdvanced.createCompany({
      name: 'Valid company',
      parent_company_id: 0,
    }, 1)).toThrow('الشركة الأم غير صحيح');
    expect(repo.getCompanies).not.toHaveBeenCalled();
    expect(repo.createCompany).not.toHaveBeenCalled();
  });

  test('rejects malformed activity dates before checking the referenced record', () => {
    expect(() => crmAdvanced.createActivity({
      record_type: 'customer',
      record_id: 1,
      activity_type: 'call',
      title: 'Follow up',
      due_at: "' OR 1=1--",
    }, 1)).toThrow('موعد النشاط غير صالح');
    expect(repo.recordExists).not.toHaveBeenCalled();
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  test('rejects impossible calendar dates before checking the referenced record', () => {
    expect(() => crmAdvanced.createActivity({
      record_type: 'customer',
      record_id: 1,
      activity_type: 'call',
      title: 'Follow up',
      due_at: '2026-02-31T12:00',
    }, 1)).toThrow('موعد النشاط غير صالح');
    expect(repo.recordExists).not.toHaveBeenCalled();
  });

  test('validates all opportunity fields before database-backed owner validation', () => {
    expect(() => crmAdvanced.createOpportunity({
      title: 'Opportunity',
      customer_id: 1,
      pipeline_stage_id: 2,
      owner_user_id: 2,
      expected_close_date: '2026-02-31',
    }, 1)).toThrow('تاريخ الإغلاق المتوقع غير صالح');
    expect(repo.isActiveUser).not.toHaveBeenCalled();
    expect(repo.createOpportunity).not.toHaveBeenCalled();
  });

  test('rejects invalid lead updates before looking up the lead', () => {
    expect(() => crmAdvanced.updateLead({
      id: 8,
      name: "' OR 1=1--",
      email: 'not-an-email',
    }, 1)).toThrow('البريد الإلكتروني غير صالح');
    expect(repo.getLeadById).not.toHaveBeenCalled();
    expect(repo.updateLead).not.toHaveBeenCalled();
  });

  test('rejects invalid relationship types before querying customer records', () => {
    expect(() => crmAdvanced.createCustomerRelationship({
      from_customer_id: 1,
      to_customer_id: 2,
      relationship_type: "' OR 1=1--",
    }, 1)).toThrow('نوع العلاقة غير مدعوم');
    expect(repo.recordExists).not.toHaveBeenCalled();
    expect(repo.createCustomerRelationship).not.toHaveBeenCalled();
  });

  test('rejects invalid activity filter date ranges before querying activities', () => {
    expect(() => crmAdvanced.getActivities({
      from: 'not-a-date',
      to: '2026-11-01',
    })).toThrow('من تاريخ غير صالح');
    expect(repo.getActivities).not.toHaveBeenCalled();
  });

  test('rejects invalid lead statuses instead of broadening the database query', () => {
    expect(() => crmAdvanced.getLeads({ status: "' OR 1=1--" }))
      .toThrow('حالة العميل المحتمل غير صحيحة');
    expect(repo.getLeads).not.toHaveBeenCalled();
  });

  test('rejects non-decimal opportunity values before database access', () => {
    expect(() => crmAdvanced.createOpportunity({
      title: 'Opportunity',
      customer_id: 1,
      pipeline_stage_id: 2,
      expected_value: ' ',
    }, 1)).toThrow('قيمة الصفقة غير صحيح');
    expect(repo.createOpportunity).not.toHaveBeenCalled();
  });

  test('rejects malformed custom field values before fetching field definitions', () => {
    expect(() => crmAdvanced.setCustomFieldValues('customer', 1, {
      phone: { value: 'not scalar' },
    }, 1)).toThrow('قيمة الحقل المخصص "phone" غير صحيحة');
    expect(repo.getCustomFields).not.toHaveBeenCalled();
    expect(repo.setCustomFieldValues).not.toHaveBeenCalled();
  });

  test('validates and updates an existing lead while preserving its owner', () => {
    expect(crmAdvanced.updateLead({ id: 8, name: 'Updated Lead' }, 1)).toMatchObject({
      id: 8,
      name: 'Updated Lead',
      owner_user_id: 2,
    });
    expect(repo.updateLead).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, owner_user_id: 2 }),
      1
    );
  });

  test('does not allow deleting a lead already converted to a customer', () => {
    repo.getLeadById.mockReturnValueOnce({
      id: 8,
      status: 'converted',
      customer_id: 12,
    });
    const removeAttachments = jest.fn();

    expect(() => crmAdvanced.deleteLead(8, 1, removeAttachments))
      .toThrow('لا يمكن حذف عميل محتمل تم تحويله');
    expect(removeAttachments).not.toHaveBeenCalled();
    expect(repo.deleteLead).not.toHaveBeenCalled();
  });

  test('removes lead attachments before deleting the lead record', () => {
    const removeAttachments = jest.fn();

    expect(crmAdvanced.deleteLead(8, 1, removeAttachments)).toEqual({ deleted: true });
    expect(removeAttachments).toHaveBeenCalledWith('lead', 8);
    expect(repo.deleteLead).toHaveBeenCalledWith(8, 1);
  });

  test('preserves the company owner when an update omits owner_user_id', () => {
    const updated = crmAdvanced.updateCompany({ id: 5, name: 'Company' }, 1);
    expect(updated.owner_user_id).toBe(4);
  });

  test('validates and saves opportunity assignment', () => {
    expect(crmAdvanced.assignOpportunity({ opportunity_id: 10, owner_user_id: '2' }, 1))
      .toEqual({ opportunity_id: 10, owner_user_id: 2 });
    expect(repo.assignOpportunity).toHaveBeenCalledWith(
      { opportunity_id: 10, owner_user_id: 2 },
      1
    );
    expect(crmCache.invalidate).toHaveBeenCalledTimes(1);
  });
});


describe('Advanced CRM custom fields, lead value and lost reason', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a choice list needs distinct, non-empty choices', () => {
    const base = { entity_type: 'customer', field_key: 'payment', label: 'طريقة الدفع', field_type: 'select' };
    expect(() => crmAdvanced.createCustomField({ ...base, options: [] })).toThrow('من اختيار لـ 50');
    expect(() => crmAdvanced.createCustomField({ ...base, options: ['كاش', 'كاش'] })).toThrow('مكرر');
    expect(() => crmAdvanced.createCustomField({ ...base, options: ['كاش', ' '] })).toThrow('من حرف لـ 60');
    crmAdvanced.createCustomField({ ...base, options: [' كاش ', 'آجل'] });
    expect(repo.createCustomField).toHaveBeenCalledWith(expect.objectContaining({ options: ['كاش', 'آجل'] }));
    expect(() => crmAdvanced.createCustomField({ ...base, field_type: 'image' })).toThrow('نوع الحقل غير مدعوم');
  });

  test('a saved value of a choice list must be one of its choices', () => {
    repo.getCustomFields.mockReturnValue([{ id: 1, field_key: 'payment', label: 'طريقة الدفع', field_type: 'select', options: ['كاش'] }]);
    expect(() => crmAdvanced.setCustomFieldValues('customer', 3, { payment: 'شيك' }, 1)).toThrow('من الاختيارات المتاحة');
    crmAdvanced.setCustomFieldValues('customer', 3, { payment: 'كاش' }, 1);
    expect(repo.setCustomFieldValues).toHaveBeenCalled();
    repo.getCustomFields.mockReturnValue([]);
  });

  test('a file field only takes an attachment of the same record', () => {
    repo.getCustomFields.mockReturnValue([{ id: 2, field_key: 'contract', label: 'العقد', field_type: 'file' }]);
    repo.getAttachmentById = jest.fn((id) => ({ 7: { record_type: 'customer', record_id: 3 }, 8: { record_type: 'customer', record_id: 4 } })[id]);
    expect(() => crmAdvanced.setCustomFieldValues('customer', 3, { contract: '8' }, 1)).toThrow('مش مرفق بالسجل ده');
    expect(() => crmAdvanced.setCustomFieldValues('customer', 3, { contract: '99' }, 1)).toThrow('مش مرفق بالسجل ده');
    crmAdvanced.setCustomFieldValues('customer', 3, { contract: '7' }, 1);
    crmAdvanced.setCustomFieldValues('customer', 3, { contract: '' }, 1); // cleared
    expect(repo.setCustomFieldValues).toHaveBeenCalledTimes(2);
    repo.getCustomFields.mockReturnValue([]);
  });

  test('updating a field keeps its type and only validates choices for lists', () => {
    repo.getCustomFieldById.mockReturnValue({ id: 4, field_type: 'text' });
    crmAdvanced.updateCustomField({ id: 4, label: 'جديد', is_required: true, options: ['x'] });
    expect(repo.updateCustomField).toHaveBeenCalledWith({ id: 4, label: 'جديد', is_required: true, options: null });
  });

  test('reordering must list every field of the type exactly once', () => {
    repo.getCustomFields.mockReturnValue([{ id: 1 }, { id: 2 }]);
    expect(() => crmAdvanced.reorderCustomFields('customer', [1])).toThrow('كل حقول');
    expect(() => crmAdvanced.reorderCustomFields('customer', [1, 1])).toThrow('كل حقول');
    crmAdvanced.reorderCustomFields('customer', [2, 1]);
    expect(repo.reorderCustomFields).toHaveBeenCalledWith('customer', [2, 1]);
    repo.getCustomFields.mockReturnValue([]);
  });

  test('a lead keeps its expected value and rejects a negative one', () => {
    crmAdvanced.createLead({ name: 'Lead', expected_value: '45000' }, 2);
    expect(repo.createLead).toHaveBeenCalledWith(expect.objectContaining({ expected_value: 45000 }), 2);
    expect(() => crmAdvanced.createLead({ name: 'Lead', expected_value: -1 }, 2)).toThrow('القيمة المتوقعة');
  });

  test('moving a deal passes the lost reason through', () => {
    crmAdvanced.moveOpportunity({ opportunity_id: 9, stage_id: 5, lost_reason: '  السعر ' }, 1);
    expect(repo.moveOpportunity).toHaveBeenCalledWith({ opportunityId: 9, stageId: 5, lostReason: 'السعر' }, 1);
  });
});
