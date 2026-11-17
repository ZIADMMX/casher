// Which endpoint and model answer a turn. Edit pickModel to route by task or sector.
function pickModel(requestLlm, env) {
  return requestLlm?.model || env.AGENT_MODEL || 'gpt-4o-mini';
}

function resolveLlm(requestLlm, env = process.env) {
  const apiUrl = requestLlm?.apiUrl || env.AGENT_LLM_URL;
  const apiKey = requestLlm?.apiKey || env.AGENT_LLM_KEY;
  if (!apiUrl || !apiKey) {
    const err = new Error('مفتاح أو رابط الذكاء الاصطناعي غير مضبوط');
    err.status = 503;
    throw err;
  }
  return { apiUrl, apiKey, model: pickModel(requestLlm, env) };
}

module.exports = { resolveLlm, pickModel };
