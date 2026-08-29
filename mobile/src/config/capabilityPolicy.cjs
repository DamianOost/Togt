'use strict';

const SUPPORTED_SCHEMA_VERSION = 1;

const FEATURE_NAMES = Object.freeze([
  'peach_checkout',
  'cash_settlement',
  'identity_verification',
  'selfie_identity_verification',
  'remote_push',
  'foreground_location_updates',
  'background_tracking',
  'booking_details_share',
  'public_live_share',
  'operated_sos',
  'emergency_call',
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
  background_tracking: false,
  booking_details_share: true,
  public_live_share: false,
  operated_sos: false,
  emergency_call: true,
});

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
  if (nowMs > expiresMs) {
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
          ? serverFeature?.reason_code || 'disabled_by_server'
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

module.exports = {
  SUPPORTED_SCHEMA_VERSION,
  FEATURE_NAMES,
  BUILD_ALLOW_LIST,
  compareVersions,
  evaluateCapabilities,
  failClosed,
};
