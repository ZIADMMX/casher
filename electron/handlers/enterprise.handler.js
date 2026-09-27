const { safeHandle } = require('./safeHandle');
const enterpriseService = require('../services/enterprise.service');

function registerEnterpriseHandlers() {
  safeHandle('enterprise:getModules', () => {
    return enterpriseService.getModules();
  });

  safeHandle('enterprise:setModuleEnabled', (event, payload) => {
    const { key, isEnabled } = payload || {};
    return enterpriseService.setModuleEnabled(key, isEnabled);
  });

  safeHandle('enterprise:getProfiles', () => {
    return enterpriseService.getBusinessProfiles();
  });

  safeHandle('enterprise:getActiveProfile', () => {
    return enterpriseService.getActiveBusinessProfile();
  });

  safeHandle('enterprise:getActiveConfiguration', () => {
    return enterpriseService.getActiveBusinessConfiguration();
  });

  safeHandle('enterprise:setActiveProfile', (event, profileKey) => {
    return enterpriseService.setActiveBusinessProfile(profileKey);
  });

  safeHandle('enterprise:getAttributeDefs', (event, profileKey) => {
    return enterpriseService.getAttributeDefinitions(profileKey);
  });

  safeHandle('enterprise:createAttributeDef', (event, data) => {
    return enterpriseService.createAttributeDefinition(data);
  });

  safeHandle('enterprise:getVariantAttributeValues', (event, variantId) => {
    return enterpriseService.getVariantAttributeValues(variantId);
  });

  safeHandle('enterprise:saveVariantAttributeValues', (event, payload) => {
    const { variantId, valuesMap } = payload || {};
    return enterpriseService.saveVariantAttributeValues(variantId, valuesMap);
  });

  safeHandle('enterprise:getWorkflows', () => {
    return enterpriseService.getWorkflows();
  });

  safeHandle('enterprise:addWorkflowStatus', (event, payload) => {
    const { workflowId, statusData } = payload || {};
    return enterpriseService.addWorkflowStatus(workflowId, statusData);
  });

  safeHandle('enterprise:getAutomations', () => {
    return enterpriseService.getAutomationRules();
  });

  safeHandle('enterprise:createAutomation', (event, data) => {
    return enterpriseService.createAutomationRule(data);
  });

  safeHandle('enterprise:setAutomationEnabled', (event, payload) => {
    const { id, isEnabled } = payload || {};
    return enterpriseService.setAutomationRuleEnabled(id, isEnabled);
  });

  safeHandle('enterprise:getRoles', () => {
    return enterpriseService.getRoles();
  });

  safeHandle('enterprise:createRole', (event, payload) => {
    const { roleKey, roleName, description } = payload || {};
    return enterpriseService.createRole(roleKey, roleName, description);
  });

  safeHandle('enterprise:setRolePermissions', (event, payload) => {
    const { roleKey, permissions } = payload || {};
    return enterpriseService.setRolePermissions(roleKey, permissions);
  });
}

module.exports = { registerEnterpriseHandlers };
