'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BUILD_ALLOW_LIST,
  buildAllowListForPackagedFlags,
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
