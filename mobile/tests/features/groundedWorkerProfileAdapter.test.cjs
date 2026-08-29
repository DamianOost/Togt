'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  accountReadinessFromWorkerProfileV1,
  adaptWorkerActivationV1,
  adaptWorkerServicesProfileV1,
} = require('../../src/data/grounded/workerProfile.ts');

const ids = {
  worker: '11111111-1111-4111-8111-111111111111',
  service: '22222222-2222-4222-8222-222222222222',
  offering: '33333333-3333-4333-8333-333333333333',
};

const unavailable = (reasonCode = 'evidence_unavailable') => ({
  status: 'unavailable',
  reasonCode,
  explanation: 'No authoritative evidence is available.',
});

function activationItem(kind, overrides = {}) {
  return {
    itemId: kind.replaceAll('_', '-'),
    kind,
    title: kind.replaceAll('_', ' '),
    status: 'complete',
    required: true,
    visibility: ['account_contact', 'payout_method', 'foreground_location', 'safety_emergency', 'first_job_readiness'].includes(kind) ? 'private' : 'public',
    evidenceLabel: 'Server evidence recorded.',
    remedy: null,
    destinationKey: 'WorkerServicesProfile',
    ...overrides,
  };
}

const kinds = [
  'account_contact', 'identity_assurance', 'profile_photo', 'about_experience',
  'eligible_service', 'pricing_acceptance', 'service_area', 'payout_method',
  'foreground_location', 'safety_emergency', 'first_job_readiness',
];

const acknowledgementKinds = ['foreground_location', 'safety_policy', 'first_job_readiness'];

function acknowledgementPolicy(kind) {
  return {
    kind,
    status: 'available',
    expectedRevision: 1,
    acknowledgedCurrent: true,
    policyVersion: `${kind}-2026.08`,
    title: `${kind.replaceAll('_', ' ')} policy`,
    body: 'Versioned activation content with a truthful capability boundary.',
    acknowledgementLabel: 'I have reviewed this content',
  };
}

function activation(overrides = {}) {
  return {
    schemaVersion: 1,
    workerId: ids.worker,
    stateVersion: 7,
    items: kinds.map((kind) => activationItem(kind, kind === 'payout_method' ? { status: 'not_required', required: false } : {})),
    acknowledgementPolicies: acknowledgementKinds.map(acknowledgementPolicy),
    onlinePermission: {
      status: 'supported',
      source: 'server',
      observedAt: '2026-08-29T12:00:00.000Z',
      value: {
        allowed: true,
        reasonCode: 'worker_online_prerequisites_passed',
        explanation: 'Server prerequisites passed.',
      },
    },
    lastUpdatedAt: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

function servicesProfile(overrides = {}) {
  return {
    schema: 'togt.worker-profile.v1',
    workerId: ids.worker,
    stateVersion: 7,
    services: [{
      offeringId: ids.offering,
      stateVersion: 2,
      facts: {
        serviceId: ids.service,
        serviceVersion: 3,
        canonicalCategory: 'plumbing',
        catalogueLabel: 'Plumbing repair quote',
        pricingMode: 'remote_quote',
        riskTier: 'credentialed',
        requiredCredentials: ['trade.plumbing'],
        fixedCustomerAmount: unavailable('fixed_customer_amount_unavailable'),
        fixedWorkerNet: unavailable('fixed_worker_net_unavailable'),
        hourlyRateBounds: unavailable('hourly_bounds_unavailable'),
        fixedPayoutRule: null,
      },
      customerFacingTitle: 'Careful plumbing repairs',
      description: 'Clear inspection and scoped quotes for household plumbing repairs.',
      hourlyRate: null,
      minimumDurationMinutes: 60,
      callOutAmount: null,
      serviceAreaLabel: 'Rondebosch, Cape Town',
      portfolio: [],
      active: false,
      credentialEvidence: [{ credentialId: 'trade.plumbing', label: 'Plumbing registration', status: 'missing' }],
      mutation: { state: 'idle', message: null, confirmedAt: null },
    }],
    publicProfile: {
      profileId: ids.worker,
      stateVersion: 2,
      displayName: 'Thabo Ndlovu',
      about: 'Experienced household repair professional.',
      profilePhoto: {
        status: 'supported', source: 'server', observedAt: '2026-08-29T12:00:00.000Z',
        value: { uri: 'https://images.example.test/worker.jpg' },
      },
      photoReplacement: { state: 'idle', previewUri: null, progressPercent: null, message: null },
      publicBadges: [
        { badgeId: 'identity_assurance', label: 'Identity assurance', detail: 'Authoritative evidence is unavailable.', status: 'not_verified' },
      ],
      serviceAreaLabel: 'Rondebosch, Cape Town',
      privateDetailLabels: [
        { detailId: 'contact', label: 'Contact details', statusLabel: 'Stored privately' },
        { detailId: 'payout_method', label: 'Payout method', statusLabel: 'Unavailable; payout readiness is not claimed' },
      ],
      mutation: { state: 'idle', message: null, confirmedAt: null },
    },
    lastUpdatedAt: '2026-08-29T12:00:00.000Z',
    capabilities: {
      portfolioUpload: unavailable('portfolio_upload_not_implemented'),
      credentialSubmission: unavailable('credential_registry_not_implemented'),
      payoutAccount: unavailable('payout_capability_not_approved'),
    },
    ...overrides,
  };
}

test('strict v1 adapters preserve only canonical Worker evidence and exact service version facts', () => {
  const profile = adaptWorkerServicesProfileV1(servicesProfile());
  assert.equal(profile.ok, true, JSON.stringify(profile));
  assert.equal(profile.value.snapshot.workerId, ids.worker);
  assert.equal(profile.value.snapshot.services[0].facts.serviceVersion, 3);
  assert.equal(profile.value.snapshot.services[0].facts.pricingMode, 'remote_quote');
  assert.equal(profile.value.snapshot.services[0].credentialEvidence[0].status, 'missing');
  assert.equal(profile.value.snapshot.services[0].facts.fixedWorkerNet.status, 'unavailable');
  assert.equal(profile.value.capabilities.payoutAccount.status, 'unavailable');

  const checklist = adaptWorkerActivationV1(activation());
  assert.equal(checklist.ok, true, JSON.stringify(checklist));
  assert.equal(checklist.value.items.length, 11);
  assert.equal(checklist.value.onlinePermission.value.allowed, true);
});

test('account readiness derives identity, payout and safety from canonical evidence without filling gaps', () => {
  const profile = adaptWorkerServicesProfileV1(servicesProfile());
  const checklist = adaptWorkerActivationV1(activation({
    items: kinds.map((kind) => activationItem(kind,
      kind === 'identity_assurance' ? { status: 'pending_review', evidenceLabel: null, remedy: 'Await authoritative review.' }
        : kind === 'payout_method' ? { status: 'not_required', required: false }
          : {})),
  }));
  assert.equal(profile.ok, true);
  assert.equal(checklist.ok, true);
  const account = accountReadinessFromWorkerProfileV1(profile.value, checklist.value);
  assert.equal(account.ok, true, JSON.stringify(account));
  assert.equal(account.value.entries.find((entry) => entry.kind === 'verification_credentials').status, 'action_required');
  assert.match(account.value.entries.find((entry) => entry.kind === 'verification_credentials').detail, /not verified/);
  assert.equal(account.value.entries.find((entry) => entry.kind === 'payout_method').status, 'unavailable');
  assert.equal(account.value.entries.find((entry) => entry.kind === 'notifications_quiet_hours').destinationKey, 'NotificationControls');
  assert.equal(account.value.entries.find((entry) => entry.kind === 'trust_fairness').destinationKey, 'TrustFairness');
  assert.equal(account.value.publicProfilePreviewUri, 'https://images.example.test/worker.jpg');
});

test('missing checklist kinds, malformed money, unsafe images and supported unavailable capabilities fail closed', () => {
  assert.equal(adaptWorkerActivationV1(activation({ items: kinds.slice(0, 10).map((kind) => activationItem(kind)) })).ok, false);
  assert.equal(adaptWorkerActivationV1(activation({ acknowledgementPolicies: acknowledgementKinds.slice(0, 2).map(acknowledgementPolicy) })).ok, false);

  const malformedMoney = servicesProfile();
  malformedMoney.services[0].hourlyRate = { currency: 'USD', amountMinor: 100 };
  assert.equal(adaptWorkerServicesProfileV1(malformedMoney).ok, false);

  const unsafePhoto = servicesProfile();
  unsafePhoto.publicProfile.profilePhoto.value.uri = 'javascript:alert(1)';
  assert.equal(adaptWorkerServicesProfileV1(unsafePhoto).ok, false);

  const inventedPayout = servicesProfile();
  inventedPayout.capabilities.payoutAccount = {
    status: 'supported', source: 'server', observedAt: '2026-08-29T12:00:00.000Z', value: { ready: true },
  };
  assert.equal(adaptWorkerServicesProfileV1(inventedPayout).ok, false);
});

test('profile and activation identities must agree before W11 is produced', () => {
  const profile = adaptWorkerServicesProfileV1(servicesProfile());
  const checklist = adaptWorkerActivationV1(activation({ workerId: '99999999-9999-4999-8999-999999999999' }));
  assert.equal(profile.ok, true);
  assert.equal(checklist.ok, true);
  assert.equal(accountReadinessFromWorkerProfileV1(profile.value, checklist.value).ok, false);
});
