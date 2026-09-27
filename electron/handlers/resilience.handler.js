const { safeHandle } = require('./safeHandle');
const resilienceService = require('../services/resilience.service');

function registerResilienceHandlers() {
  safeHandle('resilience:getHealth', () => {
    return resilienceService.getSystemBackboneHealth();
  });
}

module.exports = { registerResilienceHandlers };
