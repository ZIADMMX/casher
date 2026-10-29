const { safeHandle } = require('./safeHandle');
const aiService = require('../services/ai.service');

function registerAIHandlers() {
  safeHandle('ai:getSettings', () => {
    return aiService.getAISettings();
  });

  safeHandle('ai:saveSettings', (event, settingsData) => {
    return aiService.saveAISettings(settingsData);
  });

  safeHandle('ai:askClaude', (event, payload) => {
    const { prompt, context } = payload || {};
    return aiService.askClaude(prompt, context);
  });

  safeHandle('ai:analyzeStore', () => {
    return aiService.analyzeStoreDataWithAI();
  });

  safeHandle('ai:predictStockouts', (event, options) => {
    return aiService.predictStockouts(options);
  });

  safeHandle('ai:suggestPurchases', (event, options) => {
    return aiService.suggestPurchaseQuantities(options);
  });

  safeHandle('ai:detectAnomalies', (event, options) => {
    return aiService.detectSalesAnomalies(options);
  });

  safeHandle('ai:suggestPricing', (event, options) => {
    return aiService.suggestPricingAndDiscounts(options);
  });

  safeHandle('ai:analyzeDeadStock', (event, options) => {
    return aiService.analyzeDeadStock(options);
  });

  safeHandle('ai:askCopilot', (event, payload) => {
    const { prompt, context } = payload || {};
    return aiService.askCopilot(prompt, context);
  });

  safeHandle('ai:generateReport', (event, payload) => {
    const { reportType, dateRange } = payload || {};
    return aiService.generateArabicReport(reportType, dateRange);
  });

  safeHandle('ai:createPurchaseDraft', (event, payload) => {
    const { items, supplierId, notes } = payload || {};
    return aiService.createPurchaseDraftFromSuggestions(items, supplierId, notes);
  });
}

module.exports = { registerAIHandlers };
