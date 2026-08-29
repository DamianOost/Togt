'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BUILD_ALLOW_LIST,
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
