// AI provider settings and the HTTP call to the configured LLM endpoint.
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');
const SettingsRepository = require('../../repositories/settings.repository');
const { logError } = require('../logger.service');

const DEFAULT_API_KEY = '';

const DEFAULT_API_URL = '';

const DEFAULT_MODEL = 'gpt-4o-mini';

function getAISettings() {
  const apiKey = SettingsRepository.get('codecraft_api_key') || DEFAULT_API_KEY;
  const apiUrl = SettingsRepository.get('codecraft_api_url') || DEFAULT_API_URL;
  const model = SettingsRepository.get('ai_model') || DEFAULT_MODEL;
  const isEnabled = SettingsRepository.get('ai_enabled') !== '0';

  return {
    apiKey,
    apiUrl,
    model,
    isEnabled,
    maskedKey: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.slice(-4)}` : '',
  };
}

function saveAISettings(settingsData) {
  if (settingsData.apiKey !== undefined) SettingsRepository.set('codecraft_api_key', settingsData.apiKey);
  if (settingsData.apiUrl !== undefined) SettingsRepository.set('codecraft_api_url', settingsData.apiUrl);
  if (settingsData.model !== undefined) SettingsRepository.set('ai_model', settingsData.model);
  if (settingsData.isEnabled !== undefined) SettingsRepository.set('ai_enabled', settingsData.isEnabled ? '1' : '0');

  return getAISettings();
}

async function askClaude(prompt, context = {}) {
  const config = getAISettings();
  if (!config.apiKey || !config.apiUrl) {
    throw new Error('لم يتم ضبط مفتاح API أو رابط الخدمة للذكاء الاصطناعي');
  }

  const systemMessage = {
    role: 'system',
    content: `أنت المستشار الذكي لتحليلات الأعمال وإدارة المخزون والمبيعات في نظام (foxcloud POS).
إجاباتك دقيقة، احترافية، ومباشرة وباللغة العربية الفصحى. تستخدم التنسيق الجميل (Markdown) والجداول والقوائم النقطية عند الحاجة.
السياق والبيانات الحية المتاحة من قاعدة البيانات:
${JSON.stringify(context, null, 2)}`,
  };

  const userMessage = { role: 'user', content: prompt };

  const bodyData = JSON.stringify({
    model: config.model,
    messages: [systemMessage, userMessage],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const parsedUrl = new URL(config.apiUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Length': Buffer.byteLength(bodyData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const data = JSON.parse(responseBody);
            const content = data.choices?.[0]?.message?.content || data.content || responseBody;
            resolve({ success: true, response: content, usage: data.usage || null });
          } else {
            let errJson;
            try {
              errJson = JSON.parse(responseBody);
            } catch {}
            const errorMsg = errJson?.error?.message || errJson?.message || `HTTP ${res.statusCode}: ${res.statusMessage}`;
            reject(new Error(`AI API Error: ${errorMsg}`));
          }
        } catch (e) {
          reject(new Error(`فشل تحليل استجابة الذكاء الاصطناعي: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      logError('AIService', err);
      reject(new Error(`اتصال شبكي غير متاح بالخدمة: ${err.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('انتهت المهلة المحددة للاتصال بمحرك الذكاء الاصطناعي (Timeout)'));
    });

    req.write(bodyData);
    req.end();
  });
}

module.exports = {
  getAISettings,
  saveAISettings,
  askClaude,
};
