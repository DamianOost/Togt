import Constants from 'expo-constants';

const { resolveMapsPolicy } = require('./providerPolicy.cjs');

export const MAPS_POLICY = resolveMapsPolicy(Constants.expoConfig?.extra);
export const MAPS_AVAILABLE = MAPS_POLICY.available;
