import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import api from './api';
import { packagedFeatureEnabled } from '../app/runtimeFeatureFlags';
import { LOCATION_CAPABILITY_POLICY } from '../config/providerConfig';

const {
  buildAllowListForPackagedFlags,
  capabilityExpiryDelayMs: effectiveCapabilityExpiryDelayMs,
  evaluateCapabilityAtAction,
  evaluateCapabilities,
  failClosed,
} = require('../config/capabilityPolicy.cjs');

const CACHE_KEY = 'runtime_capabilities:v1';
let inFlight = null;
const PACKAGED_CAPABILITY_ALLOW_LIST = buildAllowListForPackagedFlags({
  aiAssistedIntake: packagedFeatureEnabled('aiAssistedIntake'),
  explainableRecommendations: packagedFeatureEnabled('explainableRecommendations'),
  livePlatformStatus: packagedFeatureEnabled('livePlatformStatus'),
  contextualSafetyEducation: packagedFeatureEnabled('contextualSafetyEducation'),
  mapsDisplay: LOCATION_CAPABILITY_POLICY.mapsDisplay,
  addressSearch: LOCATION_CAPABILITY_POLICY.addressSearch,
  addressResolution: LOCATION_CAPABILITY_POLICY.addressResolution,
  addressProvenanceRecording: LOCATION_CAPABILITY_POLICY.addressProvenanceRecording,
});

function appVersion() {
  return Constants.expoConfig?.version
    || Constants.manifest2?.extra?.expoClient?.version
    || '0.0.0';
}

function evaluate(snapshot) {
  return evaluateCapabilities(snapshot, {
    appVersion: appVersion(),
    allowList: PACKAGED_CAPABILITY_ALLOW_LIST,
  });
}

async function readFreshCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const effective = evaluate(JSON.parse(raw));
    return effective.valid ? effective : null;
  } catch {
    return null;
  }
}

async function fetchCapabilities() {
  try {
    const response = await api.get('/api/capabilities', { timeout: 4000 });
    const effective = evaluate(response.data);
    if (!effective.valid) return effective;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(response.data));
    return effective;
  } catch {
    return (await readFreshCache()) || failClosed('capability_data_unavailable');
  }
}

export async function getEffectiveCapabilities({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await readFreshCache();
    if (cached) return cached;
  }
  if (!inFlight) {
    inFlight = fetchCapabilities().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function failClosedCapabilities(reasonCode) {
  return failClosed(reasonCode);
}

export function capabilityEnabled(capabilities, name) {
  return capabilities?.valid === true && capabilities.features?.[name]?.available === true;
}

export function capabilityExpiryDelayMs(capabilities, nowMs = Date.now()) {
  return effectiveCapabilityExpiryDelayMs(capabilities, nowMs);
}

function capabilityExplanation(reasonCode) {
  const explanations = {
    capability_data_expired: 'Service availability changed or expired. Refresh and try again.',
    disabled_in_this_build: 'This capability is not included in this app build.',
    maps_display_release_disabled: 'Map pin placement is temporarily unavailable.',
    address_search_release_disabled: 'Address search is not available yet. Enter the address manually.',
    address_provider_not_configured: 'Provider-assisted address resolution is not configured.',
    address_provenance_contract_unavailable: 'A service update is required before this job can be sent safely.',
  };
  return explanations[reasonCode] || 'This capability is not currently available.';
}

export function capabilityStateAtAction(capabilities, name, nowMs = Date.now()) {
  const effective = evaluateCapabilityAtAction(capabilities, name, nowMs);
  const reasonCode = effective.reason_code;
  if (effective.available !== true) {
    return Object.freeze({ status: 'unavailable', reasonCode, explanation: capabilityExplanation(reasonCode) });
  }
  return Object.freeze({
    status: 'available',
    reasonCode,
    explanation: 'Available for this build and the current service configuration.',
  });
}

export async function getCapabilityStateAtAction(name, options = {}) {
  const capabilities = await getEffectiveCapabilities({ forceRefresh: options.forceRefresh !== false });
  // Evaluate after the asynchronous refresh completes. Capturing Date.now in
  // the function arguments could accept a snapshot that expired in flight.
  return capabilityStateAtAction(capabilities, name, options.nowMs ?? Date.now());
}
