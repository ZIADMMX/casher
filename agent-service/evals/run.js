// Live eval: sends each question through runTurn with the real tool manifest and checks the first tool choice.
//   AGENT_LLM_URL=... AGENT_LLM_KEY=... node evals/run.js
// Refresh tools.json after changing desktop tools:  node scripts/dump-agent-tools.js  (from the repo root)
const { runTurn } = require('../src/turn');
const cases = require('./cases.json');
const tools = require('./tools.json');

(async () => {
  let failed = 0;
  for (const c of cases) {
    let verdict;
    try {
      const out = await runTurn({ messages: [{ role: 'user', content: c.q }], tools, context: { lang: 'ar' } });
      const first = out.type === 'tool_calls' ? out.calls[0].name : null;
      const ok = c.expectNoTool ? first === null : first === c.expectTool;
      verdict = `${ok ? 'PASS' : 'FAIL'}  ${c.q}  -> ${first || 'no tool'}${ok ? '' : `  (expected ${c.expectNoTool ? 'no tool' : c.expectTool})`}`;
      if (!ok) failed += 1;
    } catch (e) {
      failed += 1;
      verdict = `ERR   ${c.q}  -> ${e.message}`;
    }
    console.log(verdict);
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  process.exit(failed ? 1 : 0);
})();
