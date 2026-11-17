// One OpenAI-compatible chat/completions call. apiUrl is the full endpoint URL.
const policy = require('./policy');

function fail(message) {
  const err = new Error(message);
  err.status = 502;
  return err;
}

async function callLlm({ llm, messages, tools }) {
  const body = {
    model: llm.model,
    messages,
    temperature: policy.TEMPERATURE,
    max_tokens: policy.MAX_TOKENS,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = 'auto';
  }

  let res;
  try {
    res = await fetch(llm.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(policy.LLM_TIMEOUT_MS),
    });
  } catch (e) {
    throw fail(`تعذّر الاتصال بمحرك الذكاء الاصطناعي: ${e.name === 'TimeoutError' ? 'انتهت المهلة' : e.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`AI API Error: ${data?.error?.message || data?.message || `HTTP ${res.status}`}`);
  const message = data.choices?.[0]?.message;
  if (!message) throw fail('رد غير مفهوم من محرك الذكاء الاصطناعي');
  return message;
}

module.exports = { callLlm };
