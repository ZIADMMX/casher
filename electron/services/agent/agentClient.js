// The only code that talks to agent-service (the isolated LLM brain). Contract: shared/agentContract.json.
const SettingsRepository = require('../../repositories/settings.repository');

const DEFAULT_URL = 'http://127.0.0.1:4410';
const TIMEOUT_MS = 45000;

async function callTurn(body) {
  const base = (SettingsRepository.get('agent_service_url') || process.env.AGENT_SERVICE_URL || DEFAULT_URL).replace(/\/$/, '');
  const token = SettingsRepository.get('agent_service_token') || process.env.AGENT_SERVICE_TOKEN;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-agent-token'] = token;

  let res;
  try {
    res = await fetch(`${base}/v1/turn`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error('خدمة المساعد غير شغالة. شغّلها (npm run agent) أو راجع عنوانها في الإعدادات.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خدمة المساعد رجعت HTTP ${res.status}`);
  return data;
}

module.exports = { callTurn };
