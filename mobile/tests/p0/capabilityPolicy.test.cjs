'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BUILD_ALLOW_LIST,
  buildAllowListForPackagedFlags,
  capabilityExpiryDelayMs,
  evaluateCapabilityAtAction,
  evaluateCapabilities,
} = require('../../src/config/capabilityPolicy.cjs');

const NOW = Date.parse('2026-08-29T10:00:00.000Z');

function snapshot(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-08-29T09:59:00.000Z',
    ttl_seconds: 300,
    minimum_app_version: '1.0.0',
    features: {
      peach_checkout: { available: true },
      foreground_location_updates: { available: true },
      maps_display: { available: true },
      address_search: { available: false, reason_code: 'address_search_release_disabled' },
      address_resolution: { available: false, reason_code: 'address_provider_not_configured' },
      address_provenance_recording: { available: true },
      ai_assisted_intake: { available: true },
      explainable_recommendations: { available: true },
      android_live_updates: { available: true },
      contextual_safety_education: { available: true },
    },
    ...overrides,
  };
}

test('server cannot enable a provider disabled in this APK', () => {
  const result = evaluateCapabilities(snapshot(), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: BUILD_ALLOW_LIST,
  });
  assert.equal(result.valid, true);
  assert.equal(result.features.peach_checkout.available, false);
  assert.equal(result.features.peach_checkout.reason_code, 'disabled_in_this_build');
  assert.equal(result.features.foreground_location_updates.available, true);
  assert.equal(result.features.ai_assisted_intake.available, false);
  assert.equal(result.features.explainable_recommendations.available, false);
  assert.equal(result.features.android_live_updates.available, false);
  assert.equal(result.features.contextual_safety_education.available, false);
});

test('Phase 4 surfaces require both a packaged path and a fresh server capability', () => {
  const names = [
    ['ai_assisted_intake', 'aiAssistedIntake'],
    ['explainable_recommendations', 'explainableRecommendations'],
    ['android_live_updates', 'livePlatformStatus'],
    ['contextual_safety_education', 'contextualSafetyEducation'],
  ];

  for (const [capabilityName, packagedFlag] of names) {
    const serverOnPackageOff = evaluateCapabilities(snapshot(), {
      nowMs: NOW,
      appVersion: '1.0.0',
      allowList: buildAllowListForPackagedFlags({ [packagedFlag]: false }),
    });
    assert.equal(serverOnPackageOff.features[capabilityName].available, false);
    assert.equal(
      serverOnPackageOff.features[capabilityName].reason_code,
      'disabled_in_this_build'
    );

    const packageOnServerOff = evaluateCapabilities(snapshot({
      features: {
        ...snapshot().features,
        [capabilityName]: { available: false, reason_code: 'provider_not_configured' },
      },
    }), {
      nowMs: NOW,
      appVersion: '1.0.0',
      allowList: buildAllowListForPackagedFlags({ [packagedFlag]: true }),
    });
    assert.equal(packageOnServerOff.features[capabilityName].available, false);
    assert.equal(
      packageOnServerOff.features[capabilityName].reason_code,
      'provider_not_configured'
    );

    const bothOn = evaluateCapabilities(snapshot(), {
      nowMs: NOW,
      appVersion: '1.0.0',
      allowList: buildAllowListForPackagedFlags({ [packagedFlag]: true }),
    });
    assert.equal(bothOn.features[capabilityName].available, true);
  }
});

test('expired, malformed and incompatible capability data fails closed', () => {
  const expired = evaluateCapabilities(snapshot({ generated_at: '2026-08-29T09:00:00.000Z' }), {
    nowMs: NOW,
    appVersion: '1.0.0',
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.features.foreground_location_updates.available, false);

  const malformed = evaluateCapabilities({ schema_version: 99 }, { nowMs: NOW, appVersion: '1.0.0' });
  assert.equal(malformed.valid, false);

  const incompatible = evaluateCapabilities(snapshot({ minimum_app_version: '2.0.0' }), {
    nowMs: NOW,
    appVersion: '1.0.0',
  });
  assert.equal(incompatible.valid, false);
  assert.equal(incompatible.update_required, true);
});

test('location capabilities require both the packaged path and fresh server approval', () => {
  const packaged = {
    mapsDisplay: true,
    addressSearch: false,
    addressResolution: false,
    addressProvenanceRecording: true,
  };
  const packageOff = evaluateCapabilities(snapshot(), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags({ ...packaged, mapsDisplay: false }),
  });
  assert.equal(packageOff.features.maps_display.available, false);
  assert.equal(packageOff.features.maps_display.reason_code, 'disabled_in_this_build');

  const serverOff = evaluateCapabilities(snapshot({
    features: {
      ...snapshot().features,
      maps_display: { available: false, reason_code: 'maps_display_release_disabled' },
    },
  }), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags(packaged),
  });
  assert.equal(serverOff.features.maps_display.available, false);
  assert.equal(serverOff.features.maps_display.reason_code, 'maps_display_release_disabled');

  const enabled = evaluateCapabilities(snapshot(), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags(packaged),
  });
  assert.equal(enabled.features.maps_display.available, true);
  assert.equal(enabled.features.address_provenance_recording.available, true);
  assert.equal(enabled.features.address_search.available, false);
  assert.equal(enabled.features.address_search.reason_code, 'disabled_in_this_build');
  assert.equal(enabled.features.address_resolution.available, false);
  assert.equal(enabled.features.address_resolution.reason_code, 'disabled_in_this_build');

  const { address_provenance_recording: _missing, ...legacyFeatures } = snapshot().features;
  const legacyBackend = evaluateCapabilities(snapshot({ features: legacyFeatures }), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags(packaged),
  });
  assert.equal(legacyBackend.features.address_provenance_recording.available, false);
  assert.equal(
    legacyBackend.features.address_provenance_recording.reason_code,
    'address_provenance_contract_unavailable',
  );
});

test('expired capability data disables provenance recording even when both static gates are on', () => {
  const expired = evaluateCapabilities(snapshot({ generated_at: '2026-08-29T09:00:00.000Z' }), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags({ addressProvenanceRecording: true }),
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.features.address_provenance_recording.available, false);
  assert.equal(expired.features.address_provenance_recording.reason_code, 'capability_data_expired');
});

test('action-time evidence expires even when an earlier effective snapshot was available', () => {
  const effective = evaluateCapabilities(snapshot(), {
    nowMs: NOW,
    appVersion: '1.0.0',
    allowList: buildAllowListForPackagedFlags({
      mapsDisplay: true,
      addressProvenanceRecording: true,
    }),
  });
  assert.deepEqual(evaluateCapabilityAtAction(
    effective,
    'maps_display',
    Date.parse(effective.expires_at) - 1,
  ), { available: true, reason_code: 'capability_available' });
  assert.deepEqual(evaluateCapabilityAtAction(
    effective,
    'address_provenance_recording',
    Date.parse(effective.expires_at),
  ), { available: false, reason_code: 'capability_data_expired' });
  assert.deepEqual(evaluateCapabilityAtAction(effective, 'not_a_feature', NOW), {
    available: false,
    reason_code: 'unsupported_capability_name',
  });
  assert.equal(capabilityExpiryDelayMs(effective, Date.parse(effective.expires_at) - 25), 25);
  assert.equal(capabilityExpiryDelayMs(effective, Date.parse(effective.expires_at)), 0);
});
