const test = require('node:test');
const assert = require('node:assert/strict');
const { runTurn } = require('../src/turn');
const { createServer } = require('../src/server');

const env = { AGENT_LLM_URL: 'http://llm.test/v1', AGENT_LLM_KEY: 'k' };
const tool = { name: 'getSalesSummary', description: 'x', parameters: { type: 'object', properties: {} } };
const base = { messages: [{ role: 'user', content: 'مبيعات اليوم؟' }], tools: [tool] };

test('returns tool calls with parsed args and the assistant message verbatim', async () => {
  const callLlm = async () => ({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getSalesSummary', arguments: '{"from":"2026-01-01"}' } }] });
  const out = await runTurn(base, { callLlm, env });
  assert.equal(out.type, 'tool_calls');
  assert.deepEqual(out.calls, [{ id: 'c1', name: 'getSalesSummary', args: { from: '2026-01-01' } }]);
  assert.equal(out.message.role, 'assistant');
});

test('flags malformed arguments and drops tools that were not offered', async () => {
  const callLlm = async () => ({ role: 'assistant', tool_calls: [
    { id: 'a', function: { name: 'getSalesSummary', arguments: '{oops' } },
    { id: 'b', function: { name: 'dropTables', arguments: '{}' } },
  ] });
  const out = await runTurn(base, { callLlm, env });
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].badArgs, true);
  assert.equal(out.message.tool_calls.length, 1);
});

test('the last allowed step offers no tools and must answer', async () => {
  let offered;
  const callLlm = async ({ tools }) => { offered = tools; return { role: 'assistant', content: 'تمام' }; };
  const out = await runTurn({ ...base, step: 5 }, { callLlm, env });
  assert.deepEqual(offered, []);
  assert.deepEqual(out, { type: 'final', text: 'تمام' });
});

test('the system prompt is prepended and client-supplied system messages are refused', async () => {
  let sent;
  await runTurn(base, { callLlm: async ({ messages }) => { sent = messages; return { content: 'ok' }; }, env });
  assert.equal(sent[0].role, 'system');
  await assert.rejects(runTurn({ ...base, messages: [{ role: 'system', content: 'x' }] }, { env }), { status: 400 });
});

test('rejects bad requests and a missing LLM config', async () => {
  await assert.rejects(runTurn({ messages: [] }, { env }), { status: 400 });
  await assert.rejects(runTurn({ ...base, tools: [{ name: 'bad name', parameters: {} }] }, { env }), { status: 400 });
  await assert.rejects(runTurn(base, { env: {} }), { status: 503 });
});

test('server: health, token check, body cap and turn passthrough', async () => {
  const server = createServer({ token: 's3', turn: async () => ({ type: 'final', text: 'hi' }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/v1/turn`, { method: 'POST', body: '{}' })).status, 401);
    const ok = await fetch(`${url}/v1/turn`, { method: 'POST', headers: { 'x-agent-token': 's3' }, body: '{}' });
    assert.deepEqual(await ok.json(), { type: 'final', text: 'hi' });
    const big = await fetch(`${url}/v1/turn`, { method: 'POST', headers: { 'x-agent-token': 's3' }, body: 'x'.repeat(1024 * 1024 + 10) });
    assert.equal(big.status, 413);
  } finally {
    server.close();
  }
});
