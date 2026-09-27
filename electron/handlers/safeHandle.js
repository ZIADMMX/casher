const { ipcMain } = require('electron');

/**
 * Register an IPC handler with predictable error shape and optional declarative schema validation.
 * Never expose implementation details or non-Error thrown values to the renderer.
 *
 * Usage:
 * safeHandle('channel:name', handler);
 * OR
 * safeHandle('channel:name', schema, handler);
 */
function safeHandle(channel, schemaOrHandler, maybeHandler) {
  const hasSchema = typeof maybeHandler === 'function';
  const schema = hasSchema ? schemaOrHandler : null;
  const handler = hasSchema ? maybeHandler : schemaOrHandler;

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (schema && typeof schema.validate === 'function') {
        const payload = args[0];
        schema.validate(payload);
      }
      return await handler(event, ...args);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'حدث خطأ غير متوقع';
      throw new Error(message);
    }
  });
}

module.exports = { safeHandle };
