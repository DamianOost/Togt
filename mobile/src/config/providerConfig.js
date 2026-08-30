import Constants from 'expo-constants';

const {
  resolveLocationCapabilityPolicy,
  resolveMapsPolicy,
} = require('./providerPolicy.cjs');

export const MAPS_POLICY = resolveMapsPolicy(Constants.expoConfig?.extra);
export const MAPS_AVAILABLE = MAPS_POLICY.available;
export const LOCATION_CAPABILITY_POLICY = resolveLocationCapabilityPolicy(Constants.expoConfig?.extra);
