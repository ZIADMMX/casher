const { initDatabase } = require('../../electron/database/db');
initDatabase();

const {
  getAISettings,
  saveAISettings,
  askClaude,
  predictStockouts,
  detectSalesAnomalies,
} = require('../../electron/services/ai.service');

describe('AI Service Unit Tests', () => {
  test('getAISettings returns empty defaults when no provider is configured', () => {
    saveAISettings({ apiKey: '', apiUrl: '', model: 'gpt-4o-mini', isEnabled: false });
    const settings = getAISettings();
    expect(settings.apiKey).toBe('');
    expect(settings.apiUrl).toBe('');
    expect(settings.model).toBe('gpt-4o-mini');
  });

  test('saveAISettings updates AI configuration in settings repository', () => {
    const updated = saveAISettings({
      apiKey: 'test-key-123',
      apiUrl: 'https://example.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      isEnabled: true,
    });

    expect(updated.apiKey).toBe('test-key-123');
    expect(updated.apiUrl).toBe('https://example.com/v1/chat/completions');
    expect(updated.model).toBe('gpt-4o-mini');

    saveAISettings({ apiKey: '', apiUrl: '', model: 'gpt-4o-mini', isEnabled: false });
  });

  test('askClaude function is exported and defined', () => {
    expect(typeof askClaude).toBe('function');
  });

  test('stockout and anomaly date filters safely handle untrusted values', () => {
    expect(() => predictStockouts({
      daysWindow: "30') OR 1=1 --",
      warehouseId: '1 OR 1=1',
      includeAll: true,
    })).not.toThrow();

    const anomalies = detectSalesAnomalies({ days: "30') OR 1=1 --" });
    expect(anomalies.evaluatedDays).toBe(30);
    expect(Array.isArray(anomalies.anomalies)).toBe(true);
  });
});
