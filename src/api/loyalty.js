// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Loyalty points
import { bridgeMethod } from './bridge.js';

export const getLoyaltySettings = bridgeMethod('getLoyaltySettings');
export const getLoyaltyPoints = bridgeMethod('getLoyaltyPoints');
export const getLoyaltyHistory = bridgeMethod('getLoyaltyHistory');
export const adjustLoyaltyPoints = bridgeMethod('adjustLoyaltyPoints');
