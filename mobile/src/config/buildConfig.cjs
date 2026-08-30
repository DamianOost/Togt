'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  classifyApiBaseUrl,
  normalizeAppEnvironment,
  resolveApiBaseUrl,
} = require('./apiBaseUrl.cjs');

const ANDROID_PACKAGE_NAME = 'za.togt.app';
const APP_SCHEME = 'togt';
const BUILD_PROVIDERS = new Set(['local_gradle', 'eas']);
const PUSH_PROVIDERS = new Set(['disabled', 'expo', 'fcm']);
const MAPS_PROVIDERS = new Set(['disabled', 'google']);
const ANDROID_CLEARTEXT_CONFIG_CLASSES = new Set([
  'development-local',
  'development-lan',
]);
const ANDROID_CONFIG_CLASSES = new Set([
  ...ANDROID_CLEARTEXT_CONFIG_CLASSES,
  'development-secure',
  'preview',
  'production',
]);

function readChoice(environment, name, allowed, fallback) {
  const value = environment[name]?.trim().toLowerCase() || fallback;
  if (!allowed.has(value)) {
    throw new Error(`${name} must be one of ${Array.from(allowed).join(', ')}.`);
  }
  return value;
}

function readBoolean(environment, name, fallback = false) {
  const rawValue = environment[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = rawValue.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function requireValue(environment, name, reason) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required ${reason}.`);
  return value;
}

function resolveAppEnvironment(environment) {
  const explicit = environment.EXPO_PUBLIC_APP_ENV?.trim();
  if (explicit) return normalizeAppEnvironment(explicit);

  const easProfile = environment.EAS_BUILD_PROFILE?.trim().toLowerCase();
  if (easProfile === 'preview' || easProfile === 'production') return easProfile;
  return 'development';
}

function allowsAndroidCleartext(configClass) {
  if (!ANDROID_CONFIG_CLASSES.has(configClass)) {
    throw new Error(
      `Unsupported Android cleartext configuration class: ${configClass || 'missing'}.`
    );
  }
  return ANDROID_CLEARTEXT_CONFIG_CLASSES.has(configClass);
}

function resolveBuildConfiguration(environment = process.env) {
  const appEnvironment = resolveAppEnvironment(environment);
  const buildProvider = readChoice(
    environment,
    'ANDROID_BUILD_PROVIDER',
    BUILD_PROVIDERS,
    environment.EAS_BUILD_PROFILE ? 'eas' : 'local_gradle'
  );
  const pushProvider = readChoice(
    environment,
    'EXPO_PUBLIC_PUSH_PROVIDER',
    PUSH_PROVIDERS,
    'disabled'
  );
  const mapsProvider = readChoice(
    environment,
    'EXPO_PUBLIC_MAPS_PROVIDER',
    MAPS_PROVIDERS,
    'disabled'
  );
  const peachAllowed = readBoolean(environment, 'EXPO_PUBLIC_ENABLE_PEACH', false);
  const groundedMomentumEnabled = readBoolean(
    environment,
    'TOGT_GROUNDED_MOMENTUM',
    appEnvironment === 'development'
  );
  const experienceDefault = groundedMomentumEnabled && appEnvironment === 'development';
  const featureFlags = Object.freeze({
    groundedMomentumShell: groundedMomentumEnabled,
    customerFlagship: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_CUSTOMER_FLAGSHIP',
      experienceDefault
    ),
    workerExperience: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_WORKER_EXPERIENCE',
      experienceDefault
    ),
    relationships: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_RELATIONSHIPS',
      false
    ),
    aiAssistedIntake: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_AI_ASSISTED_INTAKE',
      false
    ),
    explainableRecommendations: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_EXPLAINABLE_RECOMMENDATIONS',
      false
    ),
    livePlatformStatus: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_LIVE_PLATFORM_STATUS',
      false
    ),
    contextualSafetyEducation: groundedMomentumEnabled && readBoolean(
      environment,
      'TOGT_CONTEXTUAL_SAFETY_EDUCATION',
      false
    ),
    darkTheme: groundedMomentumEnabled && readBoolean(environment, 'TOGT_DARK_THEME', false),
  });
  const locationCapabilities = Object.freeze({
    schemaVersion: 1,
    mapsDisplay: featureFlags.customerFlagship && mapsProvider === 'google',
    // Provider search/resolution remain deliberately absent in Wave 1.
    addressSearch: false,
    addressResolution: false,
    addressProvenanceRecording: featureFlags.customerFlagship,
  });

  const configuredPackage = environment.ANDROID_PACKAGE_NAME?.trim() || ANDROID_PACKAGE_NAME;
  if (configuredPackage !== ANDROID_PACKAGE_NAME) {
    throw new Error(`ANDROID_PACKAGE_NAME is locked to ${ANDROID_PACKAGE_NAME}.`);
  }

  const apiBaseUrl = resolveApiBaseUrl({
    configuredUrl: environment.EXPO_PUBLIC_API_BASE_URL,
    appEnvironment,
  });
  const configClass = classifyApiBaseUrl(apiBaseUrl, appEnvironment);

  let easProjectId = environment.EAS_PROJECT_ID?.trim() || null;
  if (buildProvider === 'eas' || pushProvider === 'expo') {
    easProjectId = requireValue(
      environment,
      'EAS_PROJECT_ID',
      `when ${buildProvider === 'eas' ? 'ANDROID_BUILD_PROVIDER=eas' : 'Expo Push is enabled'}`
    );
  }

  let googleServicesFile = null;
  if (pushProvider === 'fcm') {
    googleServicesFile = path.resolve(
      requireValue(environment, 'GOOGLE_SERVICES_JSON', 'when FCM push is enabled')
    );
    if (!fs.existsSync(googleServicesFile) || !fs.statSync(googleServicesFile).isFile()) {
      throw new Error('GOOGLE_SERVICES_JSON must point to a readable file when FCM push is enabled.');
    }
  }

  let googleMapsAndroidApiKey = null;
  if (mapsProvider === 'google') {
    googleMapsAndroidApiKey = requireValue(
      environment,
      'GOOGLE_MAPS_ANDROID_API_KEY',
      'when Google Maps is enabled'
    );
    if (/^(?:replace|example|your[-_]|<)/i.test(googleMapsAndroidApiKey)) {
      throw new Error('GOOGLE_MAPS_ANDROID_API_KEY must not be a placeholder.');
    }
  }

  return Object.freeze({
    androidCleartextAllowed: allowsAndroidCleartext(configClass),
    apiBaseUrl,
    appEnvironment,
    buildProvider,
    configClass,
    easProjectId,
    featureFlags,
    googleMapsAndroidApiKey,
    googleServicesFile,
    groundedMomentumEnabled,
    locationCapabilities,
    mapsProvider,
    packageName: ANDROID_PACKAGE_NAME,
    peachAllowed,
    pushProvider,
    scheme: APP_SCHEME,
  });
}

module.exports = {
  APP_SCHEME,
  ANDROID_CLEARTEXT_CONFIG_CLASSES,
  ANDROID_CONFIG_CLASSES,
  ANDROID_PACKAGE_NAME,
  BUILD_PROVIDERS,
  MAPS_PROVIDERS,
  PUSH_PROVIDERS,
  allowsAndroidCleartext,
  readBoolean,
  resolveAppEnvironment,
  resolveBuildConfiguration,
};
