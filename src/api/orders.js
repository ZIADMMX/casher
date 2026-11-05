// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Operations & Orders Center
import { bridgeMethod } from './bridge.js';

export const getAllOrders = bridgeMethod('getAllOrders');
export const getOrderById = bridgeMethod('getOrderById');
export const createOrder = bridgeMethod('createOrder');
export const addOrderItem = bridgeMethod('addOrderItem');
export const updateOrderStatus = bridgeMethod('updateOrderStatus');
export const assignOrder = bridgeMethod('assignOrder');
export const addOrderComment = bridgeMethod('addOrderComment');
export const addOrderAttachment = bridgeMethod('addOrderAttachment');
export const getOrderStats = bridgeMethod('getOrderStats');
