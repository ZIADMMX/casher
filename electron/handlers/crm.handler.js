const { safeHandle } = require('./safeHandle');
const crmService = require('../services/crm.service');
const advancedCRM = require('../services/crmAdvanced.service');
const authService = require('../services/auth.service');
const customersService = require('../services/customers.service');
const { dialog } = require('electron');
const { readTableFile } = require('../services/excel.util');
const { exportToExcelOrCsv } = require('../services/export.service');
const crmAttachments = require('../services/crmAttachments.service');
const dailyMessages = require('../services/dailyMessages.service');

function registerCRMHandlers() {
  const userId = () => authService.getCurrentSession()?.id || null;

  safeHandle('crm:getUnifiedTimeline', (event, customerId) => {
    return crmService.getUnifiedTimeline(customerId);
  });

  safeHandle('crm:addInteraction', (event, data) => {
    return crmService.addInteraction(data, { id: userId() });
  });

  safeHandle('crm:createOpportunity', (event, data) => {
    return crmService.createOpportunity(data, {});
  });

  safeHandle('crm:getAllOpportunities', (event, filters) => {
    return crmService.getAllOpportunities(filters);
  });

  safeHandle('crm:updateOpportunityStage', (event, payload) => {
    const { id, stage } = payload || {};
    return crmService.updateOpportunityStage(id, stage, userId());
  });

  safeHandle('crm:updateRatingAndTier', (event, payload) => {
    const { customerId, rating, tier } = payload || {};
    return crmService.updateCustomerRatingAndTier(customerId, rating, tier);
  });

  safeHandle('crm:checkDueReminders', () => {
    return crmService.checkDueReminders();
  });

  safeHandle('crm:getCampaigns', () => {
    return crmService.getAllCampaigns();
  });

  safeHandle('crm:createCampaign', (event, data) => {
    return crmService.createCampaign(data);
  });

  safeHandle('crm:getCampaignAudience', (event, campaignId) => {
    return crmService.getCampaignAudience(campaignId);
  });

  safeHandle('crm:createCampaignReminders', (event, campaignId) => {
    return crmService.createCampaignReminders(campaignId);
  });

  safeHandle('crm:getCompanies', () => advancedCRM.getCompanies());
  safeHandle('crm:getAssignees', () => advancedCRM.getCRMUsers());
  safeHandle('crm:createCompany', (event, data) => advancedCRM.createCompany(data, userId()));
  safeHandle('crm:updateCompany', (event, data) => advancedCRM.updateCompany(data, userId()));
  safeHandle('crm:getLeads', (event, filters) => advancedCRM.getLeads(filters));
  safeHandle('crm:createLead', (event, data) => advancedCRM.createLead(data, userId()));
  safeHandle('crm:updateLead', (event, data) => advancedCRM.updateLead(data, userId()));
  safeHandle('crm:deleteLead', (event, leadId) => (
    advancedCRM.deleteLead(
      leadId,
      userId(),
      (recordType, recordId) => crmAttachments.removeRecordAttachments(recordType, recordId)
    )
  ));
  safeHandle('crm:updateLeadStatus', (event, data) => (
    advancedCRM.updateLeadStatus(data.leadId, data.status, userId())
  ));
  safeHandle('crm:convertLead', (event, leadId) => advancedCRM.convertLead(leadId, userId()));
  safeHandle('crm:getPipelineStages', () => advancedCRM.getPipelineStages());
  safeHandle('crm:createPipelineStage', (event, data) => advancedCRM.createPipelineStage(data, userId()));
  safeHandle('crm:updatePipelineStage', (event, data) => advancedCRM.updatePipelineStage(data, userId()));
  safeHandle('crm:createAdvancedOpportunity', (event, data) => advancedCRM.createOpportunity(data, userId()));
  safeHandle('crm:getDailyMessages', () => dailyMessages.getToday());
  safeHandle('crm:markDailyMessageSent', (event, { kind, refId } = {}) => dailyMessages.markSent(kind, refId, userId()));
  safeHandle('crm:getDailyMessageTemplates', () => dailyMessages.getTemplates());
  safeHandle('crm:saveDailyMessageTemplates', (event, templates) => dailyMessages.saveTemplates(templates));
  safeHandle('crm:moveOpportunity', (event, data) => advancedCRM.moveOpportunity(data, userId()));
  safeHandle('crm:assignOpportunity', (event, data) => advancedCRM.assignOpportunity(data, userId()));
  safeHandle('crm:getActivities', (event, filters) => advancedCRM.getActivities(filters));
  safeHandle('crm:createActivity', (event, data) => advancedCRM.createActivity(data, userId()));
  safeHandle('crm:completeActivity', (event, activityId) => advancedCRM.completeActivity(activityId, userId()));
  safeHandle('crm:getNotes', (event, { recordType, recordId }) => advancedCRM.getNotes(recordType, recordId));
  safeHandle('crm:createNote', (event, data) => advancedCRM.createNote(data, userId()));
  safeHandle('crm:getAttachments', (event, { recordType, recordId }) => (
    crmAttachments.getAttachments(recordType, recordId)
  ));
  safeHandle('crm:selectAttachment', async (event, { recordType, recordId }) => {
    const result = await dialog.showOpenDialog({
      title: 'إرفاق ملف بسجل CRM',
      filters: [{
        name: 'ملفات مسموح بها',
        extensions: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx', 'csv', 'txt'],
      }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const id = crmAttachments.addAttachment(recordType, recordId, result.filePaths[0], userId());
    return { canceled: false, id };
  });
  safeHandle('crm:openAttachment', (event, attachmentId) => crmAttachments.openAttachment(attachmentId));
  safeHandle('crm:setTags', (event, data) => advancedCRM.setTags(data, userId()));
  safeHandle('crm:getTags', (event, { recordType, recordId }) => advancedCRM.getTags(recordType, recordId));
  safeHandle('crm:getSavedFilters', (event, entityType) => (
    advancedCRM.getSavedFilters(entityType, userId())
  ));
  safeHandle('crm:saveFilter', (event, data) => advancedCRM.saveFilter(data, userId()));
  safeHandle('crm:getAuditLog', (event, { entityType, entityId }) => (
    advancedCRM.getAuditLog(entityType, entityId)
  ));
  safeHandle('crm:setConsent', (event, { customerId, ...consent }) => (
    advancedCRM.setConsent(customerId, consent, userId())
  ));
  safeHandle('crm:getCustomerRelationships', (event, customerId) => (
    advancedCRM.getCustomerRelationships(customerId)
  ));
  safeHandle('crm:createCustomerRelationship', (event, data) => (
    advancedCRM.createCustomerRelationship(data, userId())
  ));
  safeHandle('crm:anonymizeCustomer', (event, customerId) => {
    authService.requireAdmin();
    const result = advancedCRM.anonymizeCustomer(customerId, userId());
    crmAttachments.removeRecordAttachments('customer', Number(customerId));
    return result;
  });
  safeHandle('crm:createCustomField', (event, data) => advancedCRM.createCustomField(data));
  safeHandle('crm:getCustomFields', (event, entityType) => advancedCRM.getCustomFields(entityType));
  safeHandle('crm:updateCustomField', (event, data) => advancedCRM.updateCustomField(data));
  // Deleting a field also deletes every value stored in it.
  safeHandle('crm:deleteCustomField', (event, fieldId) => {
    authService.requireAdmin();
    return advancedCRM.deleteCustomField(fieldId);
  });
  safeHandle('crm:reorderCustomFields', (event, { entityType, orderedIds }) => (
    advancedCRM.reorderCustomFields(entityType, orderedIds)
  ));
  safeHandle('crm:setCustomFieldValues', (event, data) => (
    advancedCRM.setCustomFieldValues(data.entityType, data.recordId, data.values, userId())
  ));
  safeHandle('crm:getCustomFieldValues', (event, { entityType, recordId }) => (
    advancedCRM.getCustomFieldValues(entityType, recordId)
  ));
  safeHandle('crm:getAutomationRules', () => advancedCRM.getAutomationRules());
  safeHandle('crm:saveStaleOpportunityRule', (event, data) => (
    advancedCRM.saveStaleOpportunityRule(data, userId())
  ));

  safeHandle('crm:importLeads', async () => {
    const result = await dialog.showOpenDialog({
      title: 'استيراد العملاء المحتملين',
      filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const rows = await readTableFile(result.filePaths[0]);
    return { canceled: false, ...advancedCRM.importLeads(rows, userId()) };
  });

  safeHandle('crm:exportRecords', async (event, entityType) => {
    let rows;
    let sheetName;
    let fileName;
    if (entityType === 'customers') {
      rows = customersService.getAllCustomersWithStats().map((customer) => ({
        'الاسم': customer.name,
        'رقم الهاتف': customer.phone || '',
        'البريد الإلكتروني': customer.email || '',
        'الشركة': customer.company_name || '',
        'مصدر العميل': customer.lead_source || '',
        'موافقات البريد': customer.email_consent ? 'نعم' : 'لا',
        'موافقات الرسائل': customer.sms_consent ? 'نعم' : 'لا',
      }));
      sheetName = 'العملاء';
      fileName = 'crm-customers.xlsx';
    } else if (entityType === 'companies') {
      rows = advancedCRM.getCompanies().map((company) => ({
        'اسم الشركة': company.name,
        'الشركة الأم': company.parent_company_name || '',
        'القطاع': company.industry || '',
        'الموقع الإلكتروني': company.website || '',
        'الهاتف': company.phone || '',
        'البريد الإلكتروني': company.email || '',
        'العنوان': company.address || '',
      }));
      sheetName = 'الشركات';
      fileName = 'crm-companies.xlsx';
    } else if (entityType === 'leads') {
      rows = advancedCRM.getLeads().map((lead) => ({
        'الاسم': lead.name,
        'رقم الهاتف': lead.phone || '',
        'البريد الإلكتروني': lead.email || '',
        'الشركة': lead.company_name || '',
        'المصدر': lead.source || '',
        'الحالة': lead.status,
        'القيمة المتوقعة': lead.expected_value || 0,
        'المسؤول': lead.owner_username || '',
      }));
      sheetName = 'Leads';
      fileName = 'crm-leads.xlsx';
    } else if (entityType === 'opportunities') {
      rows = crmService.getAllOpportunities().map((opportunity) => ({
        'الصفقة': opportunity.title,
        'العميل': opportunity.customer_name,
        'القيمة': opportunity.expected_value,
        'المرحلة': opportunity.pipeline_stage_label || opportunity.stage,
        'احتمالية الإغلاق': opportunity.probability,
        'تاريخ الإغلاق المتوقع': opportunity.expected_close_date || '',
        'المسؤول': opportunity.assigned_username || '',
      }));
      sheetName = 'الصفقات';
      fileName = 'crm-opportunities.xlsx';
    } else if (entityType === 'activities') {
      rows = advancedCRM.getActivities().map((activity) => ({
        'النوع': activity.activity_type,
        'الموضوع': activity.title,
        'التفاصيل': activity.details || '',
        'الحالة': activity.status,
        'موعد الاستحقاق': activity.due_at || '',
        'المسؤول': activity.owner_username || '',
      }));
      sheetName = 'الأنشطة';
      fileName = 'crm-activities.xlsx';
    } else {
      throw new Error('نوع بيانات التصدير غير مدعوم');
    }
    return exportToExcelOrCsv(rows, sheetName, fileName);
  });
}

module.exports = { registerCRMHandlers };
