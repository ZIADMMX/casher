// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Screen Designer & UI Customization Engine
import { bridgeMethod } from './bridge.js';

export const getUIConfig = bridgeMethod('getUIConfig');
export const saveUIConfig = bridgeMethod('saveUIConfig');
export const resetUIConfig = bridgeMethod('resetUIConfig');
export const exportUIConfig = bridgeMethod('exportUIConfig');
export const importUIConfig = bridgeMethod('importUIConfig');
export const getAvailableWidgets = bridgeMethod('getAvailableWidgets');
export const reorderUIItems = bridgeMethod('reorderUIItems');
export const onRateLimitBlocked = bridgeMethod('onRateLimitBlocked');
