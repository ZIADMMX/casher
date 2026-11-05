// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Onboarding Wizard APIs
import { bridgeMethod } from './bridge.js';

export const getOnboardingState = bridgeMethod('getOnboardingState');
export const getOnboardingPresets = bridgeMethod('getOnboardingPresets');
export const getOnboardingPreset = bridgeMethod('getOnboardingPreset');
export const activateOnboardingPreset = bridgeMethod('activateOnboardingPreset');
export const updateOnboardingState = bridgeMethod('updateOnboardingState');
export const previewOnboardingCatalog = bridgeMethod('previewOnboardingCatalog');
export const provisionOnboarding = bridgeMethod('provisionOnboarding');
export const resetOnboarding = bridgeMethod('resetOnboarding');
