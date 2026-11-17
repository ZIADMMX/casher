// One stateless turn: validate the request, ask the LLM, answer with tool calls or a final text.
const policy = require('./policy');
const { loadPrompt } = require('./prompts');
const { resolveLlm } = require('./models');

const ROLES = new Set(['user', 'assistant', 'tool']);

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function validateRequest(req) {
  if (!req || typeof req !== 'object') throw bad('طلب غير صالح');
  const { messages, tools = [] } = req;
  if (!Array.isArray(messages) || !messages.length || messages.length > policy.MAX_MESSAGES) throw bad('messages غير صالحة');
  for (const m of messages) {
    if (!m || !ROLES.has(m.role)) throw bad('دور رسالة غير مسموح');
    if (m.content != null && (typeof m.content !== 'string' || m.content.length > policy.MAX_CONTENT_CHARS)) throw bad('محتوى رسالة غير صالح');
  }
  if (!Array.isArray(tools) || tools.length > policy.MAX_TOOLS) throw bad('tools غير صالحة');
  for (const t of tools) {
    if (!t || typeof t.name !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(t.name) || typeof t.parameters !== 'object') throw bad('تعريف أداة غير صالح');
  }
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return { args: raw };
  try {
    const args = JSON.parse(raw || '{}');
    return args && typeof args === 'object' && !Array.isArray(args) ? { args } : { args: {}, badArgs: true };
  } catch {
    return { args: {}, badArgs: true };
  }
}

async function runTurn(req, { callLlm = require('./llm').callLlm, env = process.env } = {}) {
  validateRequest(req);
  const llm = resolveLlm(req.llm, env);
  const step = Number(req.step) || 0;
  // The final allowed step offers no tools, so the model has to answer.
  const tools = step >= policy.MAX_STEPS - 1 ? [] : (req.tools || []);
  const system = { role: 'system', content: loadPrompt(req.context?.sector) };

  const message = await callLlm({ llm, messages: [system, ...req.messages], tools });

  if (tools.length && message.tool_calls?.length) {
    const known = new Set(tools.map((t) => t.name));
    const accepted = message.tool_calls.filter((c) => known.has(c.function?.name));
    if (accepted.length) {
      // The assistant message goes back verbatim so the desktop can append it to the history.
      const calls = accepted.map((c) => ({ id: c.id, name: c.function.name, ...parseArgs(c.function.arguments) }));
      return { type: 'tool_calls', calls, message: { ...message, tool_calls: accepted } };
    }
  }
  return { type: 'final', text: message.content || '' };
}

module.exports = { runTurn, validateRequest };
