const { safeHandle } = require('./safeHandle');
const crmService = require('../services/crm.service');

function registerCRMHandlers() {
  safeHandle('crm:getUnifiedTimeline', (event, customerId) => {
    return crmService.getUnifiedTimeline(customerId);
  });

  safeHandle('crm:addInteraction', (event, data) => {
    return crmService.addInteraction(data, {});
  });

  safeHandle('crm:createOpportunity', (event, data) => {
    return crmService.createOpportunity(data, {});
  });

  safeHandle('crm:getAllOpportunities', (event, filters) => {
    return crmService.getAllOpportunities(filters);
  });

  safeHandle('crm:updateOpportunityStage', (event, payload) => {
    const { id, stage } = payload || {};
    return crmService.updateOpportunityStage(id, stage);
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
}

module.exports = { registerCRMHandlers };
