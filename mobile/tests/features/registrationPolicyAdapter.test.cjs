'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function moduleUnderTest() {
  return import('../../src/data/grounded/registrationPolicy.ts');
}

function policy(overrides = {}) {
  return {
    schema: 'togt.registration-policy.v1',
    available: true,
    releaseChannel: 'internal_testing',
    productionApproved: false,
    reasonCode: null,
    revision: 'a'.repeat(64),
    documents: [
      { kind: 'terms', title: 'TOGT Terms', version: 'terms-v1', url: 'https://togt.test/terms', required: true },
      { kind: 'privacy', title: 'TOGT Privacy', version: 'privacy-v1', url: 'https://togt.test/privacy', required: true },
    ],
    ...overrides,
  };
}

test('accepts exactly two explicit, versioned HTTPS registration policies', async () => {
  const { adaptRegistrationPolicyV1 } = await moduleUnderTest();
  const result = adaptRegistrationPolicyV1(policy());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.documents.map((document) => document.kind), ['terms', 'privacy']);
});

test('accepts an explicit fail-closed unavailable contract', async () => {
  const { adaptRegistrationPolicyV1 } = await moduleUnderTest();
  const result = adaptRegistrationPolicyV1(policy({
    available: false,
    productionApproved: false,
    reasonCode: 'registration_policy_not_approved',
    revision: null,
    documents: [],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.available, false);
});

test('rejects missing, duplicate or bundled document kinds', async () => {
  const { adaptRegistrationPolicyV1 } = await moduleUnderTest();
  assert.equal(adaptRegistrationPolicyV1(policy({ documents: [] })).ok, false);
  assert.equal(adaptRegistrationPolicyV1(policy({
    documents: [policy().documents[0], policy().documents[0]],
  })).ok, false);
  assert.equal(adaptRegistrationPolicyV1(policy({
    documents: [policy().documents[0], { ...policy().documents[1], kind: 'marketing' }],
  })).ok, false);
});

test('rejects insecure or unapproved production policy claims', async () => {
  const { adaptRegistrationPolicyV1 } = await moduleUnderTest();
  assert.equal(adaptRegistrationPolicyV1(policy({
    documents: [{ ...policy().documents[0], url: 'http://togt.test/terms' }, policy().documents[1]],
  })).ok, false);
  assert.equal(adaptRegistrationPolicyV1(policy({
    releaseChannel: 'production',
    productionApproved: false,
  })).ok, false);
});
