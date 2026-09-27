const { safeHandle } = require('./safeHandle');
const commissionsService = require('../services/commissions.service');

function registerCommissionsHandlers() {
  safeHandle('commissions:getAllRules', () => {
    return commissionsService.getAllRules();
  });

  safeHandle('commissions:createRule', (event, ruleData) => {
    return commissionsService.createRule(ruleData);
  });

  safeHandle('commissions:updateRule', (event, payload) => {
    const { id, ruleData } = payload || {};
    return commissionsService.updateRule(id, ruleData);
  });

  safeHandle('commissions:toggleRule', (event, ruleId) => {
    return commissionsService.toggleRuleActive(ruleId);
  });

  safeHandle('commissions:deleteRule', (event, ruleId) => {
    return commissionsService.deleteRule(ruleId);
  });

  safeHandle('commissions:getAllEarnings', (event, filters) => {
    return commissionsService.getAllEarnings(filters);
  });

  safeHandle('commissions:payoutEarnings', (event, payload) => {
    const { userId, amount, paymentMethod, notes } = payload || {};
    return commissionsService.payoutEarnings(userId, amount, paymentMethod, notes, {});
  });

  safeHandle('commissions:getSummary', () => {
    return commissionsService.getSummaryKPIs();
  });
}

module.exports = { registerCommissionsHandlers };
