// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Restaurant Tables
import { bridgeMethod } from './bridge.js';

export const getTables = bridgeMethod('getTables');
export const addTable = bridgeMethod('addTable');
export const removeTable = bridgeMethod('removeTable');
export const openTableTab = bridgeMethod('openTableTab');
export const getOpenTableTab = bridgeMethod('getOpenTableTab');
export const sendTableRound = bridgeMethod('sendTableRound');
export const cancelTableTab = bridgeMethod('cancelTableTab');
export const getReservations = bridgeMethod('getReservations');
export const getUpcomingReservations = bridgeMethod('getUpcomingReservations');
export const createReservation = bridgeMethod('createReservation');
export const updateReservation = bridgeMethod('updateReservation');
export const setReservationStatus = bridgeMethod('setReservationStatus');
export const seatReservation = bridgeMethod('seatReservation');
export const getRecipe = bridgeMethod('getRecipe');
export const setRecipe = bridgeMethod('setRecipe');
