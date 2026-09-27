const { initDatabase } = require('../../electron/database/db');
initDatabase();

const { getAISettings, saveAISettings, askClaude } = require('../../electron/services/ai.service');

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
});
