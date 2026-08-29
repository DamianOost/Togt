'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { adaptGroundedFulfilmentV1 } = require('../../src/data/grounded/fulfilment.ts');
const {
  adaptWorkerCompletionV1,
  adaptWorkerJobDetailV1,
  workerActiveWorkFromFulfilmentV1,
  workerScopeFromFulfilmentV1,
} = require('../../src/data/grounded/workerLifecycle.ts');

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  worker: '33333333-3333-4333-8333-333333333333',
  service: '44444444-4444-4444-8444-444444444444',
  event: '55555555-5555-4555-8555-555555555555',
  change: '66666666-6666-4666-8666-666666666666',
};

function project(overrides = {}) {
  return {
    schema: 'togt.project.v1',
    id: ids.project,
    revision: 0,
    segment: 'upcoming',
    transactionalStatus: 'accepted',
    operational: { phase: 'scheduled', label: 'Scheduled' },
    service: { id: ids.service, version: 1, label: 'Plumbing repair' },
    schedule: { startsAt: '2026-09-02T10:00:00.000Z' },
    area: { precision: 'approximate', label: 'Approximate job area' },
    participants: {
      customer: { id: ids.customer, displayName: 'Naledi' },
      worker: { id: ids.worker, displayName: 'Thabo', trust: { verified: true, reviewCount: 0 } },
    },
    commercial: { agreedTotal: '850.00', currency: 'ZAR' },
    payment: { status: 'not_created', currency: 'ZAR' },
    completion: { status: 'not_requested' },
    scope: { items: [{ label: 'Repair the leaking tap' }] },
    timeline: [{ id: ids.event, type: 'project.created', label: 'Project created', phase: 'scheduled', occurredAt: '2026-08-29T10:00:00.000Z' }],
    updatedAt: '2026-08-29T11:00:00.000Z',
    ...overrides,
  };
}

function scope(overrides = {}) {
  return {
    version: 1,
    baseVersion: null,
    status: 'confirmed',
    source: 'on_site',
    proposedByRole: 'worker',
    snapshot: {
      description: 'Repair the leaking tap.',
      items: ['Replace washer'],
      materialsResponsibility: 'Worker supplies washer.',
      estimatedMinutes: 60,
    },
    confirmations: { customer: '2026-08-29T10:05:00.000Z', worker: '2026-08-29T10:00:00.000Z' },
    declinedAt: null,
    createdAt: '2026-08-29T09:55:00.000Z',
    ...overrides,
  };
}

function fulfilment(overrides = {}) {
  return {
    schema: 'togt.fulfilment.v1',
    projectId: ids.project,
    revision: 0,
    transactionalStatus: 'accepted',
    operationalPhase: 'scheduled',
    schedule: { revision: 1, startsAt: '2026-09-02T10:00:00.000Z' },
    location: { precision: 'approximate', label: 'Approximate job area', coordinate: { latitude: -33.92, longitude: 18.42 } },
    participants: {
      customer: { displayName: 'Naledi', avatarUrl: null, phone: null },
      worker: { displayName: 'Thabo', avatarUrl: null, phone: null },
    },
    scope: { current: null, proposal: null, history: [] },
    start: { status: 'not_issued', customerCanReveal: false, workerMustEnter: true, workStartedAt: null },
    reschedules: [],
    changeOrders: [],
    allowedActions: {
      startRoute: true, markArrived: false, proposeScope: false, decideScope: false,
      revealStartPin: false, startWork: false, proposeReschedule: true, decideReschedule: false,
      proposeChangeOrder: false, decideChangeOrder: false, reportNoShow: true, requestReplacement: false,
    },
    integrity: { policySnapshotPresent: true, policyVersion: 'ops-v1', readOnly: false },
    updatedAt: '2026-08-29T11:00:00.000Z',
    ...overrides,
  };
}

function canonical(raw) {
  const result = adaptGroundedFulfilmentV1(raw);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

test('scheduled Worker view keeps address/contact masked and uses exact route permission', () => {
  const view = adaptWorkerJobDetailV1(project(), canonical(fulfilment()));
  assert.equal(view.ok, true, JSON.stringify(view));
  assert.equal(view.value.stateVersion, 0);
  assert.equal(view.value.privacy.exactRevealAuthorised, false);
  assert.equal(view.value.privacy.contactRevealAuthorised, false);
  assert.equal(view.value.commandPermissions.find((item) => item.command === 'start_route').allowed, true);
  assert.equal(view.value.commercial.status, 'unavailable');
});

test('route access can reveal exact address/contact without inventing location sharing', () => {
  const route = canonical(fulfilment({
    revision: 1,
    operationalPhase: 'en_route',
    location: { precision: 'exact', address: '12 Exact Street, Cape Town', coordinate: { latitude: -33.9249, longitude: 18.4241 } },
    participants: {
      customer: { displayName: 'Naledi', avatarUrl: null, phone: '0821234567' },
      worker: { displayName: 'Thabo', avatarUrl: null, phone: null },
    },
    allowedActions: { ...fulfilment().allowedActions, startRoute: false, markArrived: true },
  }));
  const detail = adaptWorkerJobDetailV1(project({
    revision: 1,
    segment: 'active',
    operational: { phase: 'en_route', label: 'Worker on the way' },
    area: { precision: 'exact', address: '12 Exact Street, Cape Town' },
  }), route);
  assert.equal(detail.ok, true);
  assert.equal(detail.value.privacy.exactRevealAuthorised, true);
  assert.equal(detail.value.privacy.contact.value, '0821234567');
  assert.equal(detail.value.tracking.status, 'not_started');
  assert.equal(detail.value.commandPermissions.find((item) => item.command === 'mark_arrived').allowed, true);
});

test('Worker scope exposes only PIN-entry policy and never the customer PIN value', () => {
  const value = canonical(fulfilment({
    revision: 3,
    operationalPhase: 'scope_confirmation',
    scope: { current: scope(), proposal: null, history: [] },
    start: {
      status: 'active', scopeVersion: 1, failedAttempts: 1, attemptsRemaining: 4,
      expiresAt: '2026-08-29T11:15:00.000Z', customerCanReveal: false, workerMustEnter: true, workStartedAt: null,
    },
    allowedActions: { ...fulfilment().allowedActions, startRoute: false, startWork: true },
  }));
  const view = workerScopeFromFulfilmentV1(value);
  assert.equal(view.ok, true);
  assert.equal(view.value.status, 'confirmed');
  assert.equal(view.value.pinPolicy.value.status, 'entry_allowed');
  assert.equal(view.value.pinPolicy.value.attemptsRemaining, 4);
  assert.equal(JSON.stringify(view.value).includes('012345'), false);
});

test('active work keeps customer total separate from unavailable Worker net', () => {
  const value = canonical(fulfilment({
    revision: 5,
    transactionalStatus: 'in_progress',
    operationalPhase: 'work_active',
    scope: { current: scope(), proposal: null, history: [] },
    start: {
      status: 'consumed', scopeVersion: 1, failedAttempts: 0, attemptsRemaining: 5,
      expiresAt: null, customerCanReveal: false, workerMustEnter: false, workStartedAt: '2026-08-29T10:00:00.000Z',
    },
    changeOrders: [{
      id: ids.change,
      version: 1,
      baseScopeVersion: 1,
      status: 'approved',
      description: 'Replace valve',
      addedScopeItems: ['Replace valve'],
      extraMinutes: 30,
      commercial: {
        labourAmount: '100.00', materialsAmount: '50.00', additionalAmount: '150.00',
        originalTotalAmount: '850.00', revisedTotalAmount: '1000.00', currency: 'ZAR',
      },
      expiresAt: null,
    }],
    allowedActions: { ...fulfilment().allowedActions, startRoute: false, proposeChangeOrder: true },
  }));
  const work = workerActiveWorkFromFulfilmentV1(value);
  assert.equal(work.ok, true);
  assert.equal(work.value.currentApprovedTotal.value.amountMinor, 100000);
  assert.equal(work.value.currentExpectedNet.status, 'unavailable');
  assert.equal(work.value.changeOrders[0].additionalExpectedNet.status, 'unavailable');
  assert.equal(work.value.canRequestCompletion, true);
});

test('completion stays bilateral and payment/payout remain separate evidence', () => {
  const view = adaptWorkerCompletionV1(project({
    revision: 4,
    segment: 'active',
    transactionalStatus: 'in_progress',
    operational: { phase: 'completion_review', label: 'Waiting for customer review' },
    completion: { status: 'requested', requestedAt: '2026-08-29T10:30:00.000Z' },
    payment: { status: 'pending', amount: '850.00', currency: 'ZAR', updatedAt: '2026-08-29T10:30:00.000Z' },
  }));
  assert.equal(view.ok, true);
  assert.equal(view.value.status, 'requested');
  assert.equal(view.value.paymentState.value, 'awaiting_reconciliation');
  assert.equal(view.value.finalCommercialSnapshotId, null);
  assert.equal(view.value.finalExpectedNet.status, 'unavailable');
  assert.equal(view.value.payoutEligibility.status, 'unavailable');
});

test('mismatched Project identity fails the combined Worker adapter closed', () => {
  const other = project({ id: '77777777-7777-4777-8777-777777777777' });
  assert.equal(adaptWorkerJobDetailV1(other, canonical(fulfilment())).ok, false);
});
