const { safeHandle } = require('./safeHandle');
const authService = require('../services/auth.service');
const webhooksService = require('../services/webhooks.service');

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('معرّف غير صالح');
  return id;
}

// Webhooks send store data to outside URLs, so only the owner/admin manages them.
function registerWebhooksHandlers() {
  safeHandle('webhooks:getAll', () => {
    authService.requireAdmin();
    return { events: webhooksService.WEBHOOK_EVENTS, webhooks: webhooksService.list() };
  });

  safeHandle('webhooks:create', (_event, data) => {
    authService.requireAdmin();
    return webhooksService.create(data);
  });

  safeHandle('webhooks:update', (_event, { id, ...data } = {}) => {
    authService.requireAdmin();
    return webhooksService.update(toId(id), data);
  });

  safeHandle('webhooks:delete', (_event, id) => {
    authService.requireAdmin();
    return webhooksService.remove(toId(id));
  });

  safeHandle('webhooks:test', (_event, id) => {
    authService.requireAdmin();
    return webhooksService.test(toId(id));
  });
}

module.exports = { registerWebhooksHandlers };
