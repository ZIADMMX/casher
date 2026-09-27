const { createHash } = require('node:crypto');

const TASKS = {
  'health-check': async () => ({ healthy: true, pid: process.pid }),
  echo: async (payload) => payload,
  sha256: async (payload) => {
    if (typeof payload?.value !== 'string') {
      throw new TypeError('sha256 task requires a string value');
    }
    return createHash('sha256').update(payload.value).digest('hex');
  },
  delay: async (payload) => {
    const delayMs = Number(payload?.milliseconds);
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30000) {
      throw new RangeError('delay task milliseconds must be between 0 and 30000');
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { delayed: delayMs, pid: process.pid };
  },
};

async function runTask(message) {
  const task = TASKS[message.taskName];
  if (!task) throw new Error(`Unsupported resilience task: ${message.taskName}`);
  return task(message.payload);
}

process.on('message', async (message) => {
  if (message?.type !== 'run' || !message.requestId) return;

  try {
    const value = await runTask(message);
    process.send?.({ type: 'result', requestId: message.requestId, ok: true, value });
  } catch (err) {
    process.send?.({
      type: 'result',
      requestId: message.requestId,
      ok: false,
      error: { name: err.name, message: err.message, code: 'WORKER_TASK_ERROR' },
    });
  }
});

process.send?.({ type: 'ready', pid: process.pid });
