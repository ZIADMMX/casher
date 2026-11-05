// AI features entry point. Implementation lives in services/ai/, SQL in repositories/ai.repository.js.
const {
  getAISettings,
  saveAISettings,
  askClaude,
} = require('./ai/llmClient');
const {
  predictStockouts,
  suggestPurchaseQuantities,
  suggestPricingAndDiscounts,
  analyzeDeadStock,
} = require('./ai/inventoryInsights');
const {
  detectSalesAnomalies,
} = require('./ai/anomalies');
const {
  askCopilot,
} = require('./ai/copilot');
const {
  generateArabicReport,
  analyzeStoreDataWithAI,
} = require('./ai/reports');
const {
  createPurchaseDraftFromSuggestions,
} = require('./ai/purchaseDraft');

module.exports = {
  getAISettings,
  saveAISettings,
  askClaude,
  predictStockouts,
  suggestPurchaseQuantities,
  detectSalesAnomalies,
  suggestPricingAndDiscounts,
  analyzeDeadStock,
  askCopilot,
  generateArabicReport,
  createPurchaseDraftFromSuggestions,
  analyzeStoreDataWithAI,
};
