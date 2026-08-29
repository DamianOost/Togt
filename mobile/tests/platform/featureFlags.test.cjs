'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PACKAGED_FEATURE_FLAG_DEFAULTS,
  isGroundedMomentumShellEnabled,
  isPackagedFeatureEnabled,
  resolvePackagedFeatureFlags,
  resolvePackagedFeatureFlagsFromExtra,
} = require('../../src/app/featureFlags.ts');

test('all packaged feature defaults fail closed', () => {
  assert.ok(Object.keys(PACKAGED_FEATURE_FLAG_DEFAULTS).length >= 2);
  assert.deepEqual(new Set(Object.values(PACKAGED_FEATURE_FLAG_DEFAULTS)), new Set([false]));

  const missing = resolvePackagedFeatureFlags(undefined);
  assert.equal(missing.valid, false);
  assert.equal(isGroundedMomentumShellEnabled(missing), false);
  assert.equal(isPackagedFeatureEnabled(missing, 'aiAssistedIntake'), false);
});

test('only exact true in a supported packaged schema enables a known flag', () => {
  const snapshot = resolvePackagedFeatureFlags({
    schemaVersion: 1,
    flags: {
      groundedMomentumShell: true,
      customerFlagship: 'true',
      workerExperience: 1,
      unknownRemoteFlag: true,
    },
  });

  assert.equal(snapshot.valid, true);
  assert.equal(isGroundedMomentumShellEnabled(snapshot), true);
  assert.equal(snapshot.flags.customerFlagship, false);
  assert.equal(snapshot.flags.workerExperience, false);
  assert.deepEqual(snapshot.invalidFlags, ['customerFlagship', 'workerExperience']);
  assert.equal(Object.hasOwn(snapshot.flags, 'unknownRemoteFlag'), false);
});

test('an unversioned or unsupported schema cannot enable the shell', () => {
  const unversioned = resolvePackagedFeatureFlags({ flags: { groundedMomentumShell: true } });
  const future = resolvePackagedFeatureFlags({
    schemaVersion: 2,
    flags: { groundedMomentumShell: true },
  });

  assert.equal(isGroundedMomentumShellEnabled(unversioned), false);
  assert.equal(isGroundedMomentumShellEnabled(future), false);
});

test('the Grounded Momentum shell is the master rollback switch for child flags', () => {
  const snapshot = resolvePackagedFeatureFlags({
    schemaVersion: 1,
    flags: {
      groundedMomentumShell: false,
      customerFlagship: true,
      aiAssistedIntake: true,
    },
  });

  assert.equal(snapshot.flags.customerFlagship, true);
  assert.equal(isPackagedFeatureEnabled(snapshot, 'customerFlagship'), false);
  assert.equal(isPackagedFeatureEnabled(snapshot, 'aiAssistedIntake'), false);
});

test('current packaged Expo extra maps through the explicit legacy shell alias', () => {
  const enabled = resolvePackagedFeatureFlagsFromExtra({
    features: { groundedMomentum: true },
  });
  const malformed = resolvePackagedFeatureFlagsFromExtra({
    features: { groundedMomentum: 'true' },
  });

  assert.equal(isGroundedMomentumShellEnabled(enabled), true);
  assert.equal(isGroundedMomentumShellEnabled(malformed), false);
});
