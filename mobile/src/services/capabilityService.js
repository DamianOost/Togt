import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import api from './api';

const {
  BUILD_ALLOW_LIST,
  evaluateCapabilities,
  failClosed,
} = require('../config/capabilityPolicy.cjs');

const CACHE_KEY = 'runtime_capabilities:v1';
let inFlight = null;

function appVersion() {
  return Constants.expoConfig?.version
    || Constants.manifest2?.extra?.expoClient?.version
    || '0.0.0';
}

function evaluate(snapshot) {
  return evaluateCapabilities(snapshot, {
    appVersion: appVersion(),
    allowList: BUILD_ALLOW_LIST,
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
