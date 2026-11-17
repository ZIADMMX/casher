const { safeHandle } = require('./safeHandle');
const enterpriseService = require('../services/enterprise.service');
const authService = require('../services/auth.service');
const centralClient = require('../services/centralClient.service');

function registerEnterpriseHandlers() {
  safeHandle('enterprise:getModules', () => {
    return enterpriseService.getModules();
  });

  safeHandle('enterprise:setModuleEnabled', (event, payload) => {
    authService.requireAdmin();
    const { key, isEnabled } = payload || {};
    return enterpriseService.setModuleEnabled(key, isEnabled);
  });

  safeHandle('enterprise:getProfiles', () => {
    return enterpriseService.getBusinessProfiles();
  });

  // Maintenance workshop: the board and warranty claims
  const warranty = require('../services/warrantyClaims.service');
  safeHandle('enterprise:getMaintenanceBoard', () => warranty.getMaintenanceBoard());
  safeHandle('enterprise:getWarrantyClaims', (event, status) => warranty.getClaims(status));
  safeHandle('enterprise:openWarrantyClaim', (event, payload) => warranty.openClaim(payload?.ticketId, payload?.reason));
  safeHandle('enterprise:decideWarrantyClaim', (event, payload) => warranty.decideClaim(payload?.claimId, payload?.decision, payload?.note));

  safeHandle('enterprise:getActiveProfile', () => {
    return enterpriseService.getActiveBusinessProfile();
  });

  safeHandle(
    'enterprise:getActiveConfiguration',
    () => enterpriseService.getActiveBusinessConfiguration(),
    {
      authorize: async (event) => {
        const remoteSession = await centralClient.getSession();
        if (!remoteSession) {
          authService.requireAuth(event?.sender?.id ?? 'default');
        }
      },
    },
  );

  safeHandle('enterprise:setActiveProfile', (event, profileKey) => {
    authService.requireAdmin();
    return enterpriseService.setActiveBusinessProfile(profileKey);
  });

  safeHandle('enterprise:getAttributeDefs', (event, profileKey) => {
    return enterpriseService.getAttributeDefinitions(profileKey);
  });

  safeHandle('enterprise:createAttributeDef', (event, data) => {
    authService.requireAdmin();
    return enterpriseService.createAttributeDefinition(data);
  });

  safeHandle('enterprise:getVariantAttributeValues', (event, variantId) => {
    return enterpriseService.getVariantAttributeValues(variantId);
  });

  safeHandle('enterprise:saveVariantAttributeValues', (event, payload) => {
    authService.requireAdmin();
    const { variantId, valuesMap } = payload || {};
    return enterpriseService.saveVariantAttributeValues(variantId, valuesMap);
  });

  safeHandle('enterprise:getWorkflows', () => {
    return enterpriseService.getWorkflows();
  });

  safeHandle('enterprise:createWorkflow', (event, data) => {
    authService.requireAdmin();
    return enterpriseService.createWorkflow(data);
  });

  safeHandle('enterprise:updateWorkflow', (event, payload) => {
    authService.requireAdmin();
    const { id, data } = payload || {};
    return enterpriseService.updateWorkflow(id, data);
  });

  safeHandle('enterprise:deleteWorkflow', (event, id) => {
    authService.requireAdmin();
    return enterpriseService.deleteWorkflow(id);
  });

  safeHandle('enterprise:addWorkflowStatus', (event, payload) => {
    authService.requireAdmin();
    const { workflowId, statusData } = payload || {};
    return enterpriseService.addWorkflowStatus(workflowId, statusData);
  });

  safeHandle('enterprise:updateWorkflowStatus', (event, payload) => {
    authService.requireAdmin();
    const { statusId, statusData } = payload || {};
    return enterpriseService.updateWorkflowStatus(statusId, statusData);
  });

  safeHandle('enterprise:deleteWorkflowStatus', (event, statusId) => {
    authService.requireAdmin();
    return enterpriseService.deleteWorkflowStatus(statusId);
  });

  safeHandle('enterprise:saveWorkflowTransitions', (event, payload) => {
    authService.requireAdmin();
    const { workflowId, transitions } = payload || {};
    return enterpriseService.saveWorkflowTransitions(workflowId, transitions);
  });

  safeHandle('enterprise:getWorkflowTickets', (event, payload) => {
    const { workflowId, statusKey } = payload || {};
    return enterpriseService.getWorkflowTickets(workflowId, statusKey);
  });

  safeHandle('enterprise:getUnbilledTickets', () => {
    authService.requireAuth();
    return enterpriseService.getUnbilledTickets();
  });

  safeHandle('enterprise:printTicketReceipt', (event, ticketId) => {
    authService.requireAuth();
    const html = require('../services/workshopReceipt.service').getReceiptHtml(ticketId);
    return require('../services/print.service').printHtml(html, { silent: false });
  });

  safeHandle('enterprise:createWorkflowTicket', (event, ticketData) => {
    authService.requireAuth();
    return enterpriseService.createWorkflowTicket(ticketData);
  });

  safeHandle('enterprise:updateTicketStatus', (event, payload) => {
    const session = authService.requireAuth();
    const { ticketId, workflowId, newStatusKey } = payload || {};
    return enterpriseService.updateTicketStatus(ticketId, workflowId, newStatusKey, session.role);
  });

  safeHandle('enterprise:deleteWorkflowTicket', (event, ticketId) => {
    authService.requireAdmin();
    return enterpriseService.deleteWorkflowTicket(ticketId);
  });

  safeHandle('enterprise:resetPresetWorkflows', () => {
    authService.requireAdmin();
    return enterpriseService.resetPresetWorkflows();
  });

  safeHandle('enterprise:getAutomations', () => {
    return enterpriseService.getAutomationRules();
  });

  safeHandle('enterprise:createAutomation', (event, data) => {
    authService.requireAdmin();
    return enterpriseService.createAutomationRule(data);
  });

  safeHandle('enterprise:setAutomationEnabled', (event, payload) => {
    authService.requireAdmin();
    const { id, isEnabled } = payload || {};
    return enterpriseService.setAutomationRuleEnabled(id, isEnabled);
  });

  safeHandle('enterprise:getRoles', () => {
    return enterpriseService.getRoles();
  });

  safeHandle('enterprise:createRole', (event, payload) => {
    authService.requireAdmin();
    const { roleKey, roleName, description } = payload || {};
    return enterpriseService.createRole(roleKey, roleName, description);
  });

  safeHandle('enterprise:setRolePermissions', (event, payload) => {
    authService.requireAdmin();
    const { roleKey, permissions } = payload || {};
    return enterpriseService.setRolePermissions(roleKey, permissions);
  });

  safeHandle('system:getLoadBalancerDiagnostics', () => {
    authService.requireAdmin();
    const loadBalancer = require('../services/loadBalancer.service');
    return loadBalancer.getDiagnostics();
  });
}

module.exports = { registerEnterpriseHandlers };
