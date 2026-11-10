const { ipcMain } = require('electron');
const authService = require('../services/auth.service');
const { getPermissionForChannel } = require('../security/permissions');
const { requireActiveLicense } = require('../services/licenseGuard.service');
const {
  checkActionRateLimit,
  normalizeActionPath,
  tryAcquireRequestSlot,
  HIGH_VOLUME_ACTIONS,
} = require('../services/rateLimiter');

const MUTATING_ACTION = /^(add|create|update|delete|remove|save|process|open|close|record|change|reset|import|restore|transfer|adjust|count|sync|submit|approve|reject|reschedule|cancel|receive|pay|activate|deactivate|generate|start|stop|set|toggle|assign|mark|clear|void|archive|complete|convert|reorder|move|anonymize|selectAttachment|checkIn|checkOut|clockIn|clockOut)/i;

function getRateLimitedAction(channel, args) {
  if (channel === 'auth:login' || channel === 'central:login') return 'POST /auth/login';
  if (channel === 'central:request') {
    const request = args[0];
    const method = String(request?.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
    if (HIGH_VOLUME_ACTIONS.has(`${method} ${normalizeActionPath(request?.route)}`)) return null;
    return `${method} ${request?.route || '/'}`;
  }

  if (HIGH_VOLUME_ACTIONS.has(channel)) return null;
  const action = channel.split(':').pop() || '';
  return MUTATING_ACTION.test(action) ? channel : null;
}

function notifyRateLimit(event, retryAfterMs, action, reason = 'rate_limit') {
  const sender = event?.sender;
  if (!sender || sender.isDestroyed?.()) return;
  sender.send('system:rateLimitBlocked', { retryAfterMs, action, reason });
}

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
    const releaseSlot = tryAcquireRequestSlot();
    if (!releaseSlot) {
      notifyRateLimit(event, 1000, channel, 'server_busy');
      throw new Error('الخادم مشغول حاليًا، يرجى المحاولة بعد لحظات.');
    }

    try {
      if (channel !== 'license:getStatus' && channel !== 'license:activate') {
        await requireActiveLicense(event);
      }

      if (schema && typeof schema.validate === 'function') {
        const payload = args[0];
        schema.validate(payload);
      }
      const action = getRateLimitedAction(channel, args);
      if (action) {
        const session = authService.getCurrentSession(event?.sender?.id);
        const identity = session?.id != null ? `user:${session.id}` : `window:${event?.sender?.id ?? 'default'}`;
        const result = await checkActionRateLimit(identity, action);
        if (!result.allowed) {
          const error = new Error('تم إيقاف هذه العملية مؤقتًا بسبب تكرار المحاولة. يرجى الانتظار قبل إعادة المحاولة.');
          error.code = 'RATE_LIMITED';
          error.retryAfterMs = result.retryAfterMs;
          throw error;
        }
      }
      if (channel.startsWith('auth:') || channel.startsWith('central:') || channel.startsWith('license:')) {
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
      if (error?.code === 'RATE_LIMITED' || error?.code === 'SERVER_BUSY') {
        notifyRateLimit(
          event,
          error.retryAfterMs,
          error.action || channel,
          error.code === 'SERVER_BUSY' ? 'server_busy' : 'rate_limit'
        );
      }
      throw new Error(message);
    } finally {
      releaseSlot();
    }
  });
}

module.exports = { safeHandle };
