// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Delivery apps
import { bridgeMethod } from './bridge.js';

export const getDeliveryOrders = bridgeMethod('getDeliveryOrders');
export const getDeliveryInbox = bridgeMethod('getDeliveryInbox');
export const addDeliveryOrder = bridgeMethod('addDeliveryOrder');
export const updateDeliveryOrderDetails = bridgeMethod('updateDeliveryOrderDetails');
export const acceptDeliveryOrder = bridgeMethod('acceptDeliveryOrder');
export const rejectDeliveryOrder = bridgeMethod('rejectDeliveryOrder');
