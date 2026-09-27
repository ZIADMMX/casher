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
}

module.exports = { registerAIHandlers };
