const repo = require('../repositories/crmAdvanced.repository');
const crmCache = require('./crm.cache');

const RECORD_TYPES = new Set(['customer', 'company', 'lead', 'opportunity']);
const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'converted', 'lost']);
const STAGE_OUTCOMES = new Set(['open', 'won', 'lost']);
const ACTIVITY_TYPES = new Set(['call', 'meeting', 'task', 'email', 'note']);
const FIELD_TYPES = new Set(['text', 'number', 'date', 'boolean']);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} غير صحيح`);
  }
  return value;
}

function requireId(value, label) {
  if (
    (typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !/^\d+$/.test(value.trim()))
  ) {
    throw new Error(`${label} غير صحيح`);
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${label} غير صحيح`);
  return id;
}

function optionalId(value, label) {
  return value == null || value === '' ? null : requireId(value, label);
}

function validateOwner(value) {
  if (value == null || value === '') return null;
  const id = requireId(value, 'المسؤول');
  if (!repo.isActiveUser(id)) throw new Error('المسؤول غير موجود أو غير مفعّل');
  return id;
}

function optionalText(value, label, maxLength = 500) {
  if (value == null || value === '') return null;
  if (
    (typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'number' && !Number.isFinite(value))
  ) {
    throw new Error(`${label} غير صالح`);
  }
  const text = String(value).trim();
  if (text.length > maxLength) throw new Error(`${label} أطول من الحد المسموح`);
  return text || null;
}

function finiteNumber(value, label, fallback) {
  if ((value == null || value === '') && fallback !== undefined) return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${label} غير صحيح`);
  }
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    throw new Error(`${label} غير صحيح`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} غير صحيح`);
  return number;
}

function validateEmail(value) {
  const email = optionalText(value, 'البريد الإلكتروني', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('البريد الإلكتروني غير صالح');
  }
  return email;
}

function validCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeDateTime(value, label) {
  const text = optionalText(value, label, 40);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!match) throw new Error(`${label} غير صالح`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  const second = Number(secondText || 0);
  if (
    !validCalendarDate(year, month, day)
    || hour > 23
    || minute > 59
    || second > 59
    || (zone && zone !== 'Z' && Number(zone.slice(1, 3)) > 14)
    || (zone && zone !== 'Z' && Number(zone.slice(1, 3)) === 14 && zone.slice(4) !== '00')
    || (zone && zone !== 'Z' && Number(zone.slice(4)) > 59)
  ) {
    throw new Error(`${label} غير صالح`);
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} غير صالح`);
  return new Date(timestamp).toISOString();
}

function normalizeDate(value, label) {
  const text = optionalText(value, label, 30);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${label} غير صالح`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!validCalendarDate(year, month, day)) throw new Error(`${label} غير صالح`);
  return text;
}

function getCompanies() {
  return repo.getCompanies();
}

function getCRMUsers() {
  return repo.getCRMUsers();
}

function createCompany(data, userId) {
  requireObject(data, 'بيانات الشركة');
  const name = optionalText(data?.name, 'اسم الشركة', 150);
  if (!name) throw new Error('اسم الشركة مطلوب');
  const parentId = optionalId(data.parent_company_id, 'الشركة الأم');
  const company = {
    name,
    parent_company_id: parentId,
    industry: optionalText(data.industry, 'القطاع', 100),
    website: optionalText(data.website, 'الموقع الإلكتروني', 255),
    phone: optionalText(data.phone, 'الهاتف', 30),
    email: validateEmail(data.email),
    address: optionalText(data.address, 'العنوان', 500),
    notes: optionalText(data.notes, 'الملاحظات', 5000),
  };
  const ownerUserId = validateOwner(data.owner_user_id) || userId || null;
  if (parentId) {
    if (!repo.getCompanies().some((company) => company.id === parentId)) {
      throw new Error('الشركة الأم غير موجودة');
    }
  }
  return repo.createCompany({ ...company, owner_user_id: ownerUserId }, userId);
}

function updateCompany(data, userId) {
  requireObject(data, 'بيانات الشركة');
  const id = requireId(data?.id, 'الشركة');
  const name = optionalText(data.name, 'اسم الشركة', 150);
  if (!name) throw new Error('اسم الشركة مطلوب');
  const parentId = optionalId(data.parent_company_id, 'الشركة الأم');
  const company = {
    id,
    name,
    parent_company_id: parentId,
    industry: optionalText(data.industry, 'القطاع', 100),
    website: optionalText(data.website, 'الموقع الإلكتروني', 255),
    phone: optionalText(data.phone, 'الهاتف', 30),
    email: validateEmail(data.email),
    address: optionalText(data.address, 'العنوان', 500),
    notes: optionalText(data.notes, 'الملاحظات', 5000),
  };
  const ownerUserId = data.owner_user_id === undefined ? undefined : validateOwner(data.owner_user_id);
  const companies = repo.getCompanies();
  const existingCompany = companies.find((company) => company.id === id);
  if (!existingCompany) throw new Error('الشركة غير موجودة');
  let parent = companies.find((company) => company.id === parentId);
  const visited = new Set([id]);
  while (parent) {
    if (visited.has(parent.id)) throw new Error('لا يمكن ربط الشركة بنفسها أو بأحد فروعها');
    visited.add(parent.id);
    parent = companies.find((company) => company.id === parent.parent_company_id);
  }
  return repo.updateCompany({
    ...company,
    owner_user_id: ownerUserId === undefined ? existingCompany.owner_user_id : ownerUserId,
  }, userId);
}

function normalizeLead(data, userId) {
  requireObject(data, 'بيانات العميل المحتمل');
  const name = optionalText(data?.name, 'اسم العميل المحتمل', 150);
  if (!name) throw new Error('اسم العميل المحتمل مطلوب');
  const status = data.status || 'new';
  if (!LEAD_STATUSES.has(status) || status === 'converted') {
    throw new Error('حالة العميل المحتمل غير صحيحة');
  }
  const lead = {
    name,
    phone: optionalText(data.phone, 'الهاتف', 30),
    email: validateEmail(data.email),
    company_id: optionalId(data.company_id, 'الشركة'),
    source: optionalText(data.source, 'مصدر العميل المحتمل', 100),
    status,
    notes: optionalText(data.notes, 'الملاحظات', 5000),
  };
  return { ...lead, owner_user_id: validateOwner(data.owner_user_id) || userId || null };
}

function createLead(data, userId) {
  return repo.createLead(normalizeLead(data, userId), userId);
}

function updateLead(data, userId) {
  requireObject(data, 'بيانات العميل المحتمل');
  const id = requireId(data?.id, 'العميل المحتمل');
  const lead = normalizeLead(data, null);
  const existing = repo.getLeadById(id);
  if (!existing) throw new Error('العميل المحتمل غير موجود');
  if (existing.customer_id || existing.status === 'converted') {
    throw new Error('لا يمكن تعديل عميل محتمل تم تحويله');
  }
  return repo.updateLead({
    ...lead,
    owner_user_id: data.owner_user_id === undefined ? existing.owner_user_id : lead.owner_user_id,
    id,
  }, userId);
}

function deleteLead(leadId, userId, removeAttachments) {
  const id = requireId(leadId, 'العميل المحتمل');
  const existing = repo.getLeadById(id);
  if (!existing) throw new Error('العميل المحتمل غير موجود');
  if (existing.customer_id || existing.status === 'converted') {
    throw new Error('لا يمكن حذف عميل محتمل تم تحويله');
  }
  if (typeof removeAttachments !== 'function') {
    throw new Error('تعذر حذف مرفقات العميل المحتمل');
  }
  removeAttachments('lead', id);
  return repo.deleteLead(id, userId);
}

function importLeads(rows, userId) {
  if (!Array.isArray(rows)) throw new Error('قائمة العملاء المحتملين غير صحيحة');
  const valid = [];
  const errors = [];
  rows.forEach((row, index) => {
    try {
      valid.push(normalizeLead({
        name: row['الاسم'] ?? row.name,
        phone: row['رقم الهاتف'] ?? row.phone,
        email: row['البريد الإلكتروني'] ?? row.email,
        source: row['المصدر'] ?? row.source,
        notes: row['ملاحظات'] ?? row.notes,
      }, userId));
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  });
  const ids = repo.createLeads(valid, userId);
  return { imported: ids.length, skipped: errors.length, errors };
}

function getLeads(filters = {}) {
  requireObject(filters, 'فلاتر العملاء المحتملين');
  if (filters.status != null && filters.status !== '' && !LEAD_STATUSES.has(filters.status)) {
    throw new Error('حالة العميل المحتمل غير صحيحة');
  }
  return repo.getLeads({
    status: filters.status || null,
    search: optionalText(filters.search, 'البحث', 100),
  });
}

function updateLeadStatus(leadId, status, userId) {
  if (typeof status !== 'string') throw new Error('حالة العميل المحتمل غير صحيحة');
  if (!LEAD_STATUSES.has(status) || status === 'converted') {
    throw new Error('حالة العميل المحتمل غير صحيحة');
  }
  return repo.updateLeadStatus(requireId(leadId, 'العميل المحتمل'), status, userId);
}

function convertLead(leadId, userId) {
  const customerId = repo.convertLead(requireId(leadId, 'العميل المحتمل'), userId);
  crmCache.invalidate();
  return customerId;
}

function getPipelineStages() {
  return repo.getPipelineStages();
}

function validateStage(data) {
  requireObject(data, 'بيانات المرحلة');
  const label = optionalText(data?.label, 'اسم المرحلة', 80);
  const outcome = data?.outcome || 'open';
  const probability = finiteNumber(data?.probability, 'احتمالية الإغلاق');
  const displayOrder = finiteNumber(data?.display_order, 'ترتيب المرحلة', 0);
  if (!label) throw new Error('اسم المرحلة مطلوب');
  if (!STAGE_OUTCOMES.has(outcome)) throw new Error('نتيجة المرحلة غير صحيحة');
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    throw new Error('احتمالية الإغلاق يجب أن تكون بين 0 و100');
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
    throw new Error('ترتيب المرحلة غير صحيح');
  }
  return { label, outcome, probability, display_order: displayOrder };
}

function createPipelineStage(data, userId) {
  return repo.createPipelineStage(validateStage(data), userId);
}

function updatePipelineStage(data, userId) {
  requireObject(data, 'بيانات المرحلة');
  const id = requireId(data?.id, 'المرحلة');
  const stage = validateStage(data);
  if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
    throw new Error('حالة المرحلة غير صحيحة');
  }
  const updated = repo.updatePipelineStage({
    ...stage,
    id,
    is_active: data.is_active !== false,
  }, userId);
  crmCache.invalidate();
  return updated;
}

function createOpportunity(data, userId) {
  requireObject(data, 'بيانات الصفقة');
  const title = optionalText(data?.title, 'اسم الصفقة', 200);
  if (!title) throw new Error('اسم الصفقة مطلوب');
  const customerId = requireId(data.customer_id, 'العميل');
  const stageId = requireId(data.pipeline_stage_id, 'مرحلة الصفقة');
  const value = finiteNumber(data.expected_value, 'قيمة الصفقة', 0);
  if (!Number.isFinite(value) || value < 0) throw new Error('قيمة الصفقة غير صحيحة');
  let probability = data.probability;
  if (probability != null && probability !== '') {
    probability = finiteNumber(probability, 'احتمالية الإغلاق');
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
      throw new Error('احتمالية الإغلاق يجب أن تكون بين 0 و100');
    }
  }
  const companyId = optionalId(data.company_id, 'الشركة');
  const leadId = optionalId(data.lead_id, 'العميل المحتمل');
  const expectedCloseDate = normalizeDate(data.expected_close_date, 'تاريخ الإغلاق المتوقع');
  const notes = optionalText(data.notes, 'الملاحظات', 5000);
  const ownerUserId = validateOwner(data.owner_user_id) || userId || null;
  const id = repo.createOpportunity({
    title,
    customer_id: customerId,
    company_id: companyId,
    lead_id: leadId,
    user_id: ownerUserId,
    pipeline_stage_id: stageId,
    expected_value: value,
    probability,
    expected_close_date: expectedCloseDate,
    notes,
  }, userId);
  crmCache.invalidate();
  return id;
}

function moveOpportunity(data, userId) {
  requireObject(data, 'بيانات نقل الصفقة');
  const opportunity = repo.moveOpportunity({
    opportunityId: requireId(data?.opportunity_id, 'الصفقة'),
    stageId: requireId(data?.stage_id, 'المرحلة'),
  }, userId);
  crmCache.invalidate();
  return opportunity;
}

function assignOpportunity(data, userId) {
  requireObject(data, 'بيانات تعيين الصفقة');
  const opportunityId = requireId(data?.opportunity_id, 'الصفقة');
  const ownerUserId = validateOwner(data.owner_user_id);
  const opportunity = repo.assignOpportunity({
    opportunity_id: opportunityId,
    owner_user_id: ownerUserId,
  }, userId);
  crmCache.invalidate();
  return opportunity;
}

function createActivity(data, userId) {
  requireObject(data, 'بيانات النشاط');
  const recordType = data?.record_type;
  if (!RECORD_TYPES.has(recordType)) throw new Error('نوع السجل غير صحيح');
  const title = optionalText(data.title, 'عنوان النشاط', 200);
  if (!title) throw new Error('عنوان النشاط مطلوب');
  if (!ACTIVITY_TYPES.has(data.activity_type)) throw new Error('نوع النشاط غير صحيح');
  const recordId = requireId(data.record_id, 'السجل');
  const details = optionalText(data.details, 'التفاصيل', 5000);
  const dueAt = normalizeDateTime(data.due_at, 'موعد النشاط');
  const ownerUserId = validateOwner(data.owner_user_id) || userId || null;
  if (!repo.recordExists(recordType, recordId)) throw new Error('السجل المرتبط بالنشاط غير موجود');
  const id = repo.createActivity({
    record_type: recordType,
    record_id: recordId,
    activity_type: data.activity_type,
    title,
    details,
    due_at: dueAt,
    owner_user_id: ownerUserId,
  }, userId);
  crmCache.invalidate();
  return id;
}

function getActivities(filters = {}) {
  requireObject(filters, 'فلاتر الأنشطة');
  if (
    filters.status != null
    && filters.status !== ''
    && !['open', 'completed', 'cancelled'].includes(filters.status)
  ) {
    throw new Error('حالة النشاط غير صحيحة');
  }
  const from = normalizeDateTime(filters.from, 'من تاريخ');
  const to = normalizeDateTime(filters.to, 'إلى تاريخ');
  if (from && to && from > to) throw new Error('نطاق التاريخ غير صحيح');
  return repo.getActivities({
    status: filters.status || null,
    from,
    to,
  });
}

function completeActivity(id, userId) {
  const activity = repo.completeActivity(requireId(id, 'النشاط'), userId);
  crmCache.invalidate();
  return activity;
}

function getNotes(recordType, recordId) {
  if (!RECORD_TYPES.has(recordType)) throw new Error('نوع السجل غير صحيح');
  const id = requireId(recordId, 'السجل');
  if (!repo.recordExists(recordType, id)) throw new Error('السجل غير موجود');
  return repo.getNotes(recordType, id);
}

function createNote(data, userId) {
  requireObject(data, 'بيانات الملاحظة');
  if (!RECORD_TYPES.has(data?.record_type)) throw new Error('نوع السجل غير صحيح');
  const body = optionalText(data.body, 'نص الملاحظة', 10000);
  if (!body) throw new Error('نص الملاحظة مطلوب');
  const recordId = requireId(data.record_id, 'السجل');
  if (!repo.recordExists(data.record_type, recordId)) throw new Error('السجل المرتبط بالملاحظة غير موجود');
  const id = repo.createNote({
    record_type: data.record_type,
    record_id: recordId,
    body,
  }, userId);
  crmCache.invalidate();
  return id;
}

function setTags(data, userId) {
  requireObject(data, 'بيانات الوسوم');
  if (!RECORD_TYPES.has(data?.record_type)) throw new Error('نوع السجل غير صحيح');
  if (!Array.isArray(data.tags) || data.tags.length > 30) throw new Error('قائمة الوسوم غير صحيحة');
  const tags = [...new Set(data.tags.map((tag) => optionalText(tag, 'الوسم', 40)).filter(Boolean))];
  const recordId = requireId(data.record_id, 'السجل');
  if (!repo.recordExists(data.record_type, recordId)) throw new Error('السجل غير موجود');
  return repo.setTags({
    record_type: data.record_type,
    record_id: recordId,
    tags,
  }, userId);
}

function getTags(recordType, recordId) {
  if (!RECORD_TYPES.has(recordType)) throw new Error('نوع السجل غير صحيح');
  const id = requireId(recordId, 'السجل');
  if (!repo.recordExists(recordType, id)) throw new Error('السجل غير موجود');
  return repo.getTags(recordType, id);
}

function saveFilter(data, userId) {
  requireObject(data, 'بيانات الفلتر');
  const name = optionalText(data?.name, 'اسم الفلتر', 80);
  if (!name) throw new Error('اسم الفلتر مطلوب');
  if (!['customer', 'company', 'lead', 'opportunity', 'activity'].includes(data.entity_type)) {
    throw new Error('نوع الفلتر غير صحيح');
  }
  if (!data.filters || typeof data.filters !== 'object' || Array.isArray(data.filters)) {
    throw new Error('شروط الفلتر غير صحيحة');
  }
  let serializedFilters;
  try {
    serializedFilters = JSON.stringify(data.filters);
  } catch {
    throw new Error('شروط الفلتر غير صالحة للتخزين');
  }
  if (serializedFilters.length > 10000) throw new Error('شروط الفلتر أطول من الحد المسموح');
  return repo.saveFilter({ name, entity_type: data.entity_type, filters: data.filters }, userId);
}

function getSavedFilters(entityType, userId) {
  if (!['customer', 'company', 'lead', 'opportunity', 'activity'].includes(entityType)) {
    throw new Error('نوع الفلتر غير صحيح');
  }
  return repo.getSavedFilters(entityType, userId);
}

function getAuditLog(entityType, entityId) {
  if (!RECORD_TYPES.has(entityType)) throw new Error('نوع السجل غير صحيح');
  return repo.getAuditLog(entityType, requireId(entityId, 'السجل'));
}

function setConsent(customerId, data, userId) {
  requireObject(data, 'بيانات الموافقة');
  if (typeof data?.email_consent !== 'boolean' || typeof data?.sms_consent !== 'boolean') {
    throw new Error('قيم الموافقة غير صحيحة');
  }
  const id = requireId(customerId, 'العميل');
  if (!repo.recordExists('customer', id)) throw new Error('العميل غير موجود');
  return repo.setConsent(id, data, userId);
}

function getCustomerRelationships(customerId) {
  const id = requireId(customerId, 'العميل');
  if (!repo.recordExists('customer', id)) throw new Error('العميل غير موجود');
  return repo.getCustomerRelationships(id);
}

function createCustomerRelationship(data, userId) {
  requireObject(data, 'بيانات العلاقة');
  const fromId = requireId(data?.from_customer_id, 'العميل');
  const toId = requireId(data?.to_customer_id, 'العميل المرتبط');
  if (fromId === toId) throw new Error('لا يمكن ربط العميل بنفسه');
  if (!['manager', 'partner', 'referrer'].includes(data.relationship_type)) {
    throw new Error('نوع العلاقة غير مدعوم');
  }
  if (!repo.recordExists('customer', fromId) || !repo.recordExists('customer', toId)) {
    throw new Error('أحد العملاء المرتبطين غير موجود');
  }
  return repo.createCustomerRelationship({
    from_customer_id: fromId,
    to_customer_id: toId,
    relationship_type: data.relationship_type,
  }, userId);
}

function anonymizeCustomer(customerId, userId) {
  const result = repo.anonymizeCustomer(requireId(customerId, 'العميل'), userId);
  crmCache.invalidate();
  return result;
}

function createCustomField(data) {
  requireObject(data, 'بيانات الحقل المخصص');
  const entityType = data?.entity_type;
  if (!RECORD_TYPES.has(entityType)) throw new Error('نوع السجل غير صحيح');
  const label = optionalText(data.label, 'اسم الحقل', 80);
  const key = optionalText(data.field_key, 'مفتاح الحقل', 40);
  if (!label || !key || !/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error('مفتاح الحقل مطلوب ويجب أن يبدأ بحرف إنجليزي صغير');
  }
  if (!FIELD_TYPES.has(data.field_type || 'text')) throw new Error('نوع الحقل غير مدعوم');
  if (data.is_required !== undefined && typeof data.is_required !== 'boolean') {
    throw new Error('حالة إلزامية الحقل غير صحيحة');
  }
  return repo.createCustomField({
    entity_type: entityType,
    field_key: key,
    label,
    field_type: data.field_type || 'text',
    is_required: Boolean(data.is_required),
  });
}

function getCustomFields(entityType) {
  if (!RECORD_TYPES.has(entityType)) throw new Error('نوع السجل غير صحيح');
  return repo.getCustomFields(entityType);
}

function setCustomFieldValues(entityType, recordId, values, userId) {
  if (!RECORD_TYPES.has(entityType)) throw new Error('نوع السجل غير صحيح');
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('قيم الحقول المخصصة غير صحيحة');
  }
  const entries = Object.entries(values);
  if (entries.length > 100) throw new Error('عدد قيم الحقول المخصصة أكبر من الحد المسموح');
  const normalizedValues = {};
  for (const [key, value] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw new Error('مفتاح الحقل المخصص غير صحيح');
    if (
      value !== null
      && typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      throw new Error(`قيمة الحقل المخصص "${key}" غير صحيحة`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`قيمة الحقل المخصص "${key}" غير صحيحة`);
    }
    const text = value == null ? null : String(value);
    if (text && text.length > 5000) throw new Error(`قيمة الحقل المخصص "${key}" أطول من الحد المسموح`);
    normalizedValues[key] = text;
  }
  const id = requireId(recordId, 'السجل');
  const fields = repo.getCustomFields(entityType);
  const fieldByKey = new Map(fields.map((field) => [field.field_key, field]));
  for (const [key, value] of Object.entries(normalizedValues)) {
    const field = fieldByKey.get(key);
    if (!field) throw new Error(`الحقل المخصص "${key}" غير معروف`);
    if (value == null) continue;
    if (field.field_type === 'number' && !Number.isFinite(Number(value))) {
      throw new Error(`قيمة الحقل "${field.label}" يجب أن تكون رقمًا`);
    }
    if (field.field_type === 'boolean' && !['true', 'false'].includes(value)) {
      throw new Error(`قيمة الحقل "${field.label}" يجب أن تكون نعم أو لا`);
    }
    if (field.field_type === 'date') normalizeDate(value, `قيمة الحقل "${field.label}"`);
  }
  if (!repo.recordExists(entityType, id)) throw new Error('السجل غير موجود');
  repo.setCustomFieldValues(entityType, id, normalizedValues, userId);
  return repo.getCustomFieldValues(entityType, id);
}

function getCustomFieldValues(entityType, recordId) {
  if (!RECORD_TYPES.has(entityType)) throw new Error('نوع السجل غير صحيح');
  return repo.getCustomFieldValues(entityType, requireId(recordId, 'السجل'));
}

function getAutomationRules() {
  return repo.getAutomationRules();
}

function saveStaleOpportunityRule(data, userId) {
  requireObject(data, 'بيانات قاعدة الأتمتة');
  const days = finiteNumber(data?.days, 'مدة التوقف');
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('مدة التوقف يجب أن تكون من يوم إلى 365 يومًا');
  }
  if (typeof data.is_enabled !== 'boolean') throw new Error('حالة قاعدة الأتمتة غير صحيحة');
  return repo.saveStaleOpportunityRule({ days, is_enabled: data.is_enabled }, userId);
}

module.exports = {
  getCompanies,
  getCRMUsers,
  createCompany,
  updateCompany,
  createLead,
  updateLead,
  deleteLead,
  importLeads,
  getLeads,
  updateLeadStatus,
  convertLead,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  createOpportunity,
  moveOpportunity,
  assignOpportunity,
  createActivity,
  getActivities,
  completeActivity,
  getNotes,
  createNote,
  setTags,
  getTags,
  getSavedFilters,
  saveFilter,
  getAuditLog,
  setConsent,
  getCustomerRelationships,
  createCustomerRelationship,
  anonymizeCustomer,
  createCustomField,
  getCustomFields,
  setCustomFieldValues,
  getCustomFieldValues,
  getAutomationRules,
  saveStaleOpportunityRule,
};
