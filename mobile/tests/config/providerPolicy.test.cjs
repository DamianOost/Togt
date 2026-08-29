'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAPS_PROVIDER_GOOGLE,
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
