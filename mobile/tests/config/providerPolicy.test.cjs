'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LOCATION_CAPABILITY_SCHEMA_VERSION,
  MAPS_PROVIDER_GOOGLE,
  resolveLocationCapabilityPolicy,
  resolveMapsPolicy,
} = require('../../src/config/providerPolicy.cjs');

test('maps provider policy enables only a packaged Google provider', () => {
  assert.equal(MAPS_PROVIDER_GOOGLE, 'google');
  assert.deepEqual(
    resolveMapsPolicy({ providers: { maps: 'google' } }),
    { available: true, provider: 'google' }
  );
});

test('maps provider policy fails closed for disabled, missing, and unknown values', () => {
  assert.deepEqual(
    resolveMapsPolicy({ providers: { maps: 'disabled' } }),
    { available: false, provider: 'disabled' }
  );
  assert.deepEqual(resolveMapsPolicy({}), { available: false, provider: 'disabled' });
  assert.deepEqual(resolveMapsPolicy(null), { available: false, provider: 'disabled' });
  assert.deepEqual(
    resolveMapsPolicy({ providers: { maps: 'unexpected' } }),
    { available: false, provider: 'unexpected' }
  );
});

test('location capability policy intersects the packaged map contract with the provider', () => {
  assert.equal(LOCATION_CAPABILITY_SCHEMA_VERSION, 1);
  const packaged = {
    schemaVersion: 1,
    mapsDisplay: true,
    addressSearch: false,
    addressResolution: false,
    addressProvenanceRecording: true,
  };
  assert.deepEqual(resolveLocationCapabilityPolicy({
    providers: { maps: 'google' },
    locationCapabilities: packaged,
  }), {
    valid: true,
    reasonCode: 'location_capability_contract_valid',
    mapsDisplay: true,
    addressSearch: false,
    addressResolution: false,
    addressProvenanceRecording: true,
  });
  assert.equal(resolveLocationCapabilityPolicy({
    providers: { maps: 'disabled' },
    locationCapabilities: packaged,
  }).mapsDisplay, false);
});

test('missing, malformed and unsupported packaged location contracts fail closed', () => {
  for (const extra of [
    null,
    { providers: { maps: 'google' } },
    { providers: { maps: 'google' }, locationCapabilities: { schemaVersion: 2 } },
    {
      providers: { maps: 'google' },
      locationCapabilities: {
        schemaVersion: 1,
        mapsDisplay: 'true',
        addressSearch: false,
        addressResolution: false,
        addressProvenanceRecording: true,
      },
    },
  ]) {
    const result = resolveLocationCapabilityPolicy(extra);
    assert.equal(result.valid, false);
    assert.equal(result.mapsDisplay, false);
    assert.equal(result.addressProvenanceRecording, false);
  }
});
