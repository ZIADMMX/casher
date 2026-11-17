// The assistant loop. The model (agent-service) decides; this side runs the tools against the local
// database, under the current user's permissions. Write tools never run from the model: they become
// a proposal that only an explicit confirmation executes.
const crypto = require('node:crypto');
const { TOOLS, manifest } = require('./tools');

const MAX_STEPS = 6; // keep equal to agent-service policy.MAX_STEPS
const MAX_PROMPT_CHARS = 2000;
const MAX_HISTORY = 30;
const MAX_RESULT_CHARS = 6000;
const PROPOSAL_TTL_MS = 10 * 60 * 1000;

const proposals = new Map(); // id -> { userId, tool, args, summary, expires }

function realDeps() {
  const auth = require('../auth.service');
  const SettingsRepository = require('../../repositories/settings.repository');
  const { getAISettings } = require('../ai/llmClient');
  return {
    turn: require('./agentClient').callTurn,
    can: (permission) => auth.hasGrantedPermission(permission),
    userId: () => auth.getCurrentSession()?.id ?? null,
    sector: () => SettingsRepository.get('business_type') || null,
    llm: () => {
      const s = getAISettings();
      if (!s.isEnabled) throw new Error('المساعد الذكي معطّل من الإعدادات');
      return s.apiKey && s.apiUrl ? { apiUrl: s.apiUrl, apiKey: s.apiKey, model: s.model } : undefined;
    },
    audit: (entry) => require('../audit.service').logAction(entry),
    tools: TOOLS,
  };
}

function audit(d, tool, args, severity = 'info') {
  try {
    d.audit({ actionType: 'ai_agent_tool', title: `المساعد: ${tool.name}`, details: JSON.stringify(args ?? {}).slice(0, 500), severity });
  } catch {
    // an audit failure must not break the user's request
  }
}

const sectorOk = (tool, sector) => !tool.sectors || (sector && tool.sectors.includes(sector));

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && ['user', 'assistant', 'tool'].includes(m.role))
    .slice(-MAX_HISTORY);
}

function clip(value) {
  const json = JSON.stringify(value ?? null);
  return json.length > MAX_RESULT_CHARS ? JSON.stringify({ truncated: true, preview: json.slice(0, MAX_RESULT_CHARS) }) : json;
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, p] of proposals) if (p.expires < now) proposals.delete(id);
}

async function askAgent(payload, overrides = {}) {
  const d = { ...realDeps(), ...overrides };
  const prompt = String(payload?.prompt ?? '').trim();
  if (!prompt) throw new Error('اكتب سؤالك أولاً');
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error('السؤال طويل جداً');

  const sector = d.sector();
  const allowed = d.tools.filter((t) => sectorOk(t, sector) && d.can(t.permission));
  const offered = manifest(allowed);
  const llm = d.llm();
  const messages = [...sanitizeHistory(payload?.history), { role: 'user', content: prompt }];
  const steps = [];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const out = await d.turn({ messages, tools: offered, context: { sector, lang: 'ar' }, step, llm });
    if (out.type === 'final') {
      const reply = out.text || 'لم أتمكن من صياغة رد. جرّب سؤالاً أبسط.';
      messages.push({ role: 'assistant', content: reply });
      return { reply, history: messages, steps };
    }
    messages.push(out.message);

    let proposal = null;
    for (const call of out.calls) {
      const tool = allowed.find((t) => t.name === call.name);
      let result;
      if (!tool || call.badArgs) {
        result = { error: 'أداة غير متاحة أو معاملات غير صالحة' };
      } else if (tool.write) {
        try {
          if (proposal) throw new Error('مقترح واحد في المرة');
          const args = tool.validate(call.args);
          proposal = { id: crypto.randomUUID(), userId: d.userId(), tool, args, summary: tool.summarize(args), expires: Date.now() + PROPOSAL_TTL_MS };
          result = { status: 'awaiting_user_confirmation' };
        } catch (e) {
          result = { error: e.message };
        }
      } else {
        try {
          result = tool.run(call.args || {});
          steps.push({ tool: tool.name, ok: true });
          audit(d, tool, call.args);
        } catch (e) {
          result = { error: e.message };
          steps.push({ tool: tool.name, ok: false });
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: clip(result) });
    }

    if (proposal) {
      purgeExpired();
      proposals.set(proposal.id, proposal);
      const reply = `جهّزت ${proposal.summary}. محتاج تأكيدك قبل التنفيذ.`;
      messages.push({ role: 'assistant', content: reply });
      return { reply, history: messages, steps, proposal: { id: proposal.id, tool: proposal.tool.name, summary: proposal.summary, args: proposal.args } };
    }
  }
  return { reply: 'لم أستطع إكمال الطلب في عدد الخطوات المسموح. جرّب سؤالاً أبسط.', history: messages, steps };
}

function takeProposal(id, d) {
  purgeExpired();
  const p = proposals.get(id);
  if (!p) throw new Error('المقترح غير موجود أو انتهت صلاحيته');
  if (p.userId !== d.userId()) throw new Error('هذا المقترح لمستخدم آخر');
  proposals.delete(id);
  return p;
}

async function confirmProposal(id, overrides = {}) {
  const d = { ...realDeps(), ...overrides };
  const p = takeProposal(id, d);
  if (!d.can(p.tool.permission)) throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
  const result = p.tool.run(p.args);
  audit(d, p.tool, p.args, 'warning');
  return { ok: true, result };
}

function rejectProposal(id, overrides = {}) {
  takeProposal(id, { ...realDeps(), ...overrides });
  return { ok: true };
}

module.exports = { askAgent, confirmProposal, rejectProposal, MAX_STEPS };
