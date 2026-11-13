// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Webhooks
import { bridgeMethod } from './bridge.js';

export const getWebhooks = bridgeMethod('getWebhooks');
export const createWebhook = bridgeMethod('createWebhook');
export const updateWebhook = bridgeMethod('updateWebhook');
export const deleteWebhook = bridgeMethod('deleteWebhook');
export const testWebhook = bridgeMethod('testWebhook');
