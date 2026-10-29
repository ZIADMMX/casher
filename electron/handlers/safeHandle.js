const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const { getPermissionForChannel } = require('../security/permissions');

/**
 * Register an IPC handler with predictable error shape and optional declarative schema validation.
 * Never expose implementation details or non-Error thrown values to the renderer.
 *
 * Usage:
 * safeHandle('channel:name', handler);
 * OR
 * safeHandle('channel:name', schema, handler);
 */
function safeHandle(channel, schemaOrHandler, maybeHandler, options = {}) {
  const hasSchema = typeof maybeHandler === 'function';
  const schema = hasSchema ? schemaOrHandler : null;
  const handler = hasSchema ? maybeHandler : schemaOrHandler;
  if (!hasSchema && maybeHandler && typeof maybeHandler === 'object') {
    options = maybeHandler;
  }

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (schema && typeof schema.validate === 'function') {
        const payload = args[0];
        schema.validate(payload);
      }
      if (channel.startsWith('auth:') || channel.startsWith('central:')) {
        return await handler(event, ...args);
      }

      const session = authService.getCurrentSession(event?.sender?.id);
      return await authService.runWithSession(session, async () => {
        if (typeof options.authorize === 'function') {
          await options.authorize(event, ...args);
          return handler(event, ...args);
        }

        const permission = getPermissionForChannel(channel, args);
        return await authService.runWithPermission(permission, async () => {
          authService.requirePermission(permission);
          return handler(event, ...args);
        });
      });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'حدث خطأ غير متوقع';
      throw new Error(message);
    }
  });
}

module.exports = { safeHandle };
