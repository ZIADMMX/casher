// Every limit the service enforces lives here, so tuning cost and safety is a one-file edit.
module.exports = {
  MAX_STEPS: 6, // the last step is forced to be a plain answer (no tools offered)
  MAX_MESSAGES: 40,
  MAX_CONTENT_CHARS: 12000,
  MAX_TOOLS: 30,
  MAX_BODY_BYTES: 1024 * 1024,
  MAX_TOKENS: 1200,
  TEMPERATURE: 0.2,
  LLM_TIMEOUT_MS: 30000,
};
