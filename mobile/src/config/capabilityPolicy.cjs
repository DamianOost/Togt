'use strict';

const SUPPORTED_SCHEMA_VERSION = 1;

const FEATURE_NAMES = Object.freeze([
  'peach_checkout',
  'cash_settlement',
  'identity_verification',
  'selfie_identity_verification',
  'remote_push',
  'foreground_location_updates',
  'maps_display',
  'address_search',
  'address_resolution',
  'address_provenance_recording',
  'background_tracking',
  'booking_details_share',
  'public_live_share',
  'operated_sos',
  'emergency_call',
  'ai_assisted_intake',
  'explainable_recommendations',
  'android_live_updates',
  'contextual_safety_education',
]);

// A server flag cannot turn on code/provider paths that this APK was not
// approved to expose. High-consequence providers remain false for P0-Triage.
const BUILD_ALLOW_LIST = Object.freeze({
  peach_checkout: false,
  cash_settlement: false,
  identity_verification: false,
  selfie_identity_verification: false,
  remote_push: false,
  foreground_location_updates: true,
  maps_display: false,
  address_search: false,
  address_resolution: false,
  address_provenance_recording: false,
  background_tracking: false,
  booking_details_share: true,
  public_live_share: false,
  operated_sos: false,
  emergency_call: true,
  ai_assisted_intake: false,
  explainable_recommendations: false,
  android_live_updates: false,
  contextual_safety_education: false,
});

const MISSING_SERVER_FEATURE_REASONS = Object.freeze({
  maps_display: 'maps_display_release_disabled',
  address_search: 'address_search_release_disabled',
  address_resolution: 'address_provider_not_configured',
  address_provenance_recording: 'address_provenance_contract_unavailable',
});

function buildAllowListForPackagedFlags(flags = {}) {
  return Object.freeze({
    ...BUILD_ALLOW_LIST,
    ai_assisted_intake: flags.aiAssistedIntake === true,
    explainable_recommendations: flags.explainableRecommendations === true,
    android_live_updates: flags.livePlatformStatus === true,
    contextual_safety_education: flags.contextualSafetyEducation === true,
    maps_display: flags.mapsDisplay === true,
    address_search: flags.addressSearch === true,
    address_resolution: flags.addressResolution === true,
    address_provenance_recording: flags.addressProvenanceRecording === true,
  });
}

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function disabledFeatures(reasonCode) {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, {
    available: false,
    reason_code: reasonCode,
  }]));
}

function failClosed(reasonCode = 'capability_data_unavailable') {
  return {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    valid: false,
    stale: true,
    update_required: false,
    reason_code: reasonCode,
    generated_at: null,
    expires_at: null,
    features: disabledFeatures(reasonCode),
  };
}

function evaluateCapabilities(snapshot, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const appVersion = options.appVersion || '0.0.0';
  const allowList = options.allowList || BUILD_ALLOW_LIST;

  if (!snapshot || snapshot.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return failClosed('unsupported_capability_schema');
  }

  const generatedMs = Date.parse(snapshot.generated_at);
  const ttlSeconds = Number(snapshot.ttl_seconds);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return failClosed('invalid_capability_freshness');
  }

  const expiresMs = generatedMs + (ttlSeconds * 1000);
  if (!Number.isFinite(nowMs) || nowMs >= expiresMs) {
    const result = failClosed('capability_data_expired');
    result.generated_at = snapshot.generated_at;
    result.expires_at = new Date(expiresMs).toISOString();
    return result;
  }

  const versionComparison = compareVersions(appVersion, snapshot.minimum_app_version);
  if (versionComparison === null || versionComparison < 0) {
    const result = failClosed('minimum_app_version_not_met');
    result.update_required = true;
    result.minimum_app_version = snapshot.minimum_app_version;
    result.generated_at = snapshot.generated_at;
    result.expires_at = new Date(expiresMs).toISOString();
    return result;
  }

  const features = {};
  for (const name of FEATURE_NAMES) {
    const serverFeature = snapshot.features?.[name];
    const available = allowList[name] === true && serverFeature?.available === true;
    features[name] = {
      ...(serverFeature || {}),
      available,
      reason_code: available
        ? undefined
        : (allowList[name] === true
          ? serverFeature?.reason_code
            || MISSING_SERVER_FEATURE_REASONS[name]
            || 'disabled_by_server'
          : 'disabled_in_this_build'),
    };
  }

  return {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    valid: true,
    stale: false,
    update_required: false,
    reason_code: null,
    minimum_app_version: snapshot.minimum_app_version,
    generated_at: snapshot.generated_at,
    expires_at: new Date(expiresMs).toISOString(),
    features,
  };
}

function evaluateCapabilityAtAction(effective, name, nowMs = Date.now()) {
  if (!FEATURE_NAMES.includes(name)) {
    return Object.freeze({ available: false, reason_code: 'unsupported_capability_name' });
  }
  if (!effective || effective.valid !== true || effective.stale === true) {
    return Object.freeze({
      available: false,
      reason_code: effective?.reason_code || 'capability_data_unavailable',
    });
  }
  const expiresMs = Date.parse(effective.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || nowMs >= expiresMs) {
    return Object.freeze({ available: false, reason_code: 'capability_data_expired' });
  }
  const feature = effective.features?.[name];
  return Object.freeze(feature?.available === true
    ? { available: true, reason_code: feature.reason_code || 'capability_available' }
    : { available: false, reason_code: feature?.reason_code || 'disabled_by_server' });
}

function capabilityExpiryDelayMs(effective, nowMs = Date.now()) {
  const expiresMs = Date.parse(effective?.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return 0;
  return Math.max(0, expiresMs - nowMs);
}

module.exports = {
  SUPPORTED_SCHEMA_VERSION,
  FEATURE_NAMES,
  BUILD_ALLOW_LIST,
  MISSING_SERVER_FEATURE_REASONS,
  buildAllowListForPackagedFlags,
  capabilityExpiryDelayMs,
  compareVersions,
  evaluateCapabilityAtAction,
  evaluateCapabilities,
  failClosed,
};
