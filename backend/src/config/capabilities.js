const SCHEMA_VERSION = 1;
const CACHE_TTL_SECONDS = 300;
const MINIMUM_APP_VERSION = '1.0.0';

// P0-Triage is deliberately conservative. A provider being configured is
// not evidence that its complete customer, reconciliation, operational, and
// device gates have passed. These values stay false until that evidence is
// reviewed and the owning release explicitly enables the capability.
const CORE_FEATURES = Object.freeze({
  peach_checkout: Object.freeze({
    available: false,
    reason_code: 'hosted_checkout_not_proven',
  }),
  cash_settlement: Object.freeze({
    available: false,
    mode: 'out_of_app_unsettled',
    reason_code: 'bilateral_confirmation_not_implemented',
  }),
  identity_verification: Object.freeze({
    available: false,
    mode: 'disabled',
    assurance: 'none',
    reason_code: 'production_kyc_not_approved',
  }),
  selfie_identity_verification: Object.freeze({
    available: false,
    reason_code: 'biometric_match_not_implemented',
  }),
  remote_push: Object.freeze({
    available: false,
    provider: 'disabled',
    reason_code: 'delivery_not_proven',
  }),
  foreground_location_updates: Object.freeze({
    available: true,
    mode: 'active_app_only',
  }),
  background_tracking: Object.freeze({
    available: false,
    reason_code: 'background_service_not_implemented',
  }),
  booking_details_share: Object.freeze({
    available: true,
    mode: 'non_live_no_address',
  }),
  public_live_share: Object.freeze({
    available: false,
    reason_code: 'expiring_public_tokens_not_implemented',
  }),
  operated_sos: Object.freeze({
    available: false,
    reason_code: 'operations_acknowledgement_not_staffed',
  }),
  emergency_call: Object.freeze({
    available: true,
    mode: 'device_dialer',
  }),
  ai_assisted_intake: Object.freeze({
    available: false,
    reason_code: 'provider_privacy_and_evaluation_gates_not_approved',
  }),
  explainable_recommendations: Object.freeze({
    available: false,
    reason_code: 'ranking_fairness_gate_not_approved',
  }),
  android_live_updates: Object.freeze({
    available: false,
    reason_code: 'native_live_update_contract_not_proven',
  }),
  contextual_safety_education: Object.freeze({
    available: false,
    reason_code: 'education_measurement_gate_not_proven',
  }),
});

// Search/geocode endpoints are deliberately outside Wave 1. Even a configured
// provider and an Operations flag cannot advertise an endpoint that this
// server release does not implement.
const ADDRESS_PROVIDER_BOUNDARY_IMPLEMENTED = false;

function exactReleaseFlag(environment, name) {
  return environment?.[name] === 'true';
}

function addressProviderConfigured(environment) {
  const key = environment?.GOOGLE_ADDRESS_PROVIDER_API_KEY;
  return environment?.ADDRESS_PROVIDER === 'google'
    && typeof key === 'string'
    && key.trim().length >= 20;
}

function providerCapability(environment, releaseFlag, releaseReason) {
  if (!exactReleaseFlag(environment, releaseFlag)) {
    return Object.freeze({ available: false, reason_code: releaseReason });
  }
  if (!addressProviderConfigured(environment)) {
    return Object.freeze({ available: false, reason_code: 'address_provider_not_configured' });
  }
  if (!ADDRESS_PROVIDER_BOUNDARY_IMPLEMENTED) {
    return Object.freeze({ available: false, reason_code: 'address_provider_boundary_not_implemented' });
  }
  return Object.freeze({ available: true, provider: 'google_server_proxy' });
}

function locationFeatures(environment = process.env) {
  return Object.freeze({
    maps_display: exactReleaseFlag(environment, 'MAPS_DISPLAY_RELEASE_ENABLED')
      ? Object.freeze({ available: true, mode: 'android_google_maps' })
      : Object.freeze({ available: false, reason_code: 'maps_display_release_disabled' }),
    address_search: providerCapability(
      environment,
      'ADDRESS_SEARCH_RELEASE_ENABLED',
      'address_search_release_disabled'
    ),
    address_resolution: providerCapability(
      environment,
      'ADDRESS_RESOLUTION_RELEASE_ENABLED',
      'address_resolution_release_disabled'
    ),
    address_provenance_recording: exactReleaseFlag(environment, 'ADDRESS_PROVENANCE_RECORDING_ENABLED')
      ? Object.freeze({ available: true, mode: 'nullable_audit_recording' })
      : Object.freeze({ available: false, reason_code: 'address_provenance_contract_unavailable' }),
  });
}

function featuresFor(environment = process.env) {
  return Object.freeze({ ...CORE_FEATURES, ...locationFeatures(environment) });
}

// Export a complete default registry for schema generation and modules that
// inspect feature metadata at startup. Snapshot/action checks remain dynamic.
const FEATURES = featuresFor(process.env);

function featureAvailable(name, environment = process.env) {
  return featuresFor(environment)[name]?.available === true;
}

function capabilitySnapshot(now = new Date(), environment = process.env) {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now.toISOString(),
    ttl_seconds: CACHE_TTL_SECONDS,
    minimum_app_version: MINIMUM_APP_VERSION,
    features: featuresFor(environment),
  };
}

module.exports = {
  SCHEMA_VERSION,
  CACHE_TTL_SECONDS,
  MINIMUM_APP_VERSION,
  FEATURES,
  featuresFor,
  locationFeatures,
  addressProviderConfigured,
  featureAvailable,
  capabilitySnapshot,
};
