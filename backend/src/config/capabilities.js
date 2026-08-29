const SCHEMA_VERSION = 1;
const CACHE_TTL_SECONDS = 300;
const MINIMUM_APP_VERSION = '1.0.0';

// P0-Triage is deliberately conservative. A provider being configured is
// not evidence that its complete customer, reconciliation, operational, and
// device gates have passed. These values stay false until that evidence is
// reviewed and the owning release explicitly enables the capability.
const FEATURES = Object.freeze({
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
});

function featureAvailable(name) {
  return FEATURES[name]?.available === true;
}

function capabilitySnapshot(now = new Date()) {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now.toISOString(),
    ttl_seconds: CACHE_TTL_SECONDS,
    minimum_app_version: MINIMUM_APP_VERSION,
    features: FEATURES,
  };
}

module.exports = {
  SCHEMA_VERSION,
  CACHE_TTL_SECONDS,
  MINIMUM_APP_VERSION,
  FEATURES,
  featureAvailable,
  capabilitySnapshot,
};
