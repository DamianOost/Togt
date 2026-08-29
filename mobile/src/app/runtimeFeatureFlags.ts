import Constants from 'expo-constants';
import {
  isPackagedFeatureEnabled,
  resolvePackagedFeatureFlagsFromExtra,
} from './featureFlags';
import type { PackagedFeatureFlagName } from './featureFlags';

/**
 * Immutable feature snapshot generated into this APK. This is deliberately
 * separate from server/provider capabilities: a packaged UI path and its
 * operational provider must each pass their own gate.
 */
export const PACKAGED_FEATURE_FLAGS = resolvePackagedFeatureFlagsFromExtra(
  Constants.expoConfig?.extra,
);

export function packagedFeatureEnabled(name: PackagedFeatureFlagName): boolean {
  return isPackagedFeatureEnabled(PACKAGED_FEATURE_FLAGS, name);
}
