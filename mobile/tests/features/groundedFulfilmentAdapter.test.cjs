'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptGroundedFulfilmentV1,
  customerActiveWorkFromFulfilmentV1,
  customerScopeFromFulfilmentV1,
} = require('../../src/data/grounded/fulfilment.ts');

const projectId = '11111111-1111-4111-8111-111111111111';
const changeId = '22222222-2222-4222-8222-222222222222';
const rescheduleId = '33333333-3333-4333-8333-333333333333';

function scope(overrides = {}) {
  return {
    version: 1,
    baseVersion: null,
    status: 'confirmed',
    source: 'on_site',
    proposedByRole: 'worker',
    snapshot: {
      description: 'Replace the failed connector.',
      items: ['Remove failed connector', 'Fit replacement'],
      materialsResponsibility: 'Worker supplies the connector.',
      estimatedMinutes: 90,
    },
    confirmations: {
      customer: '2026-08-29T11:05:00.000Z',
      worker: '2026-08-29T11:00:00.000Z',
    },
    declinedAt: null,
    createdAt: '2026-08-29T10:55:00.000Z',
    ...overrides,
  };
}

function fulfilment(overrides = {}) {
  return {
    schema: 'togt.fulfilment.v1',
    projectId,
    revision: 0,
    transactionalStatus: 'accepted',
    operationalPhase: 'scheduled',
    schedule: { revision: 1, startsAt: '2026-09-02T10:00:00.000Z' },
    travel: {
      enRouteAt: null,
      arrivedAt: null,
      exactAccessGrantedAt: null,
      accessRevokedAt: null,
      accessRevokedReason: null,
    },
    location: {
      precision: 'exact',
      address: '12 Exact Street, Cape Town',
      coordinate: { latitude: -33.9249, longitude: 18.4241 },
    },
    participants: {
      customer: { displayName: 'Naledi', avatarUrl: null, phone: null },
      worker: { displayName: 'Thabo', avatarUrl: null, phone: '0831234567' },
    },
    scope: { current: null, proposal: null, history: [] },
    start: {
      status: 'not_issued',
      customerCanReveal: false,
      workerMustEnter: false,
      workStartedAt: null,
    },
    reschedules: [],
    changeOrders: [],
    recovery: { noShows: [], replacement: null },
    integrity: { policySnapshotPresent: true, policyVersion: 'ops-v1', readOnly: false },
    allowedActions: {
      startRoute: false,
      markArrived: false,
      proposeScope: false,
      decideScope: false,
      revealStartPin: false,
      startWork: false,
      proposeReschedule: false,
      decideReschedule: false,
      proposeChangeOrder: false,
      decideChangeOrder: false,
      reportNoShow: false,
      requestReplacement: false,
    },
    updatedAt: '2026-08-29T11:00:00.000Z',
    ...overrides,
  };
}

function adapt(raw) {
  const result = adaptGroundedFulfilmentV1(raw);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

test('canonical fulfilment accepts initial revision zero and preserves privacy authority', () => {
  const value = adapt(fulfilment());
  assert.equal(value.revision, 0);
  assert.equal(value.location.precision, 'exact');
  assert.equal(value.participants.worker.phone, '0831234567');
  assert.equal(customerScopeFromFulfilmentV1(value).ok, false);
});

test('worker proposal maps to pending customer confirmation without inventing a PIN or price', () => {
  const proposal = scope({
    status: 'proposed',
    confirmations: { customer: null, worker: '2026-08-29T11:00:00.000Z' },
  });
  const value = adapt(fulfilment({
    revision: 2,
    operationalPhase: 'scope_confirmation',
    scope: { current: null, proposal, history: [] },
    start: { status: 'not_issued', customerCanReveal: false, workerMustEnter: false, workStartedAt: null },
  }));
  const view = customerScopeFromFulfilmentV1(value);
  assert.equal(view.ok, true);
  assert.equal(view.value.scope.status, 'pending_customer');
  assert.equal(view.value.scope.startPin.status, 'hidden');
  assert.equal(view.value.scope.startPin.value, null);
  assert.equal(view.value.scope.totalOrCap, null);
});

test('a customer PIN appears only from an active challenge and exact six-digit reveal response', () => {
  const current = scope();
  const value = adapt(fulfilment({
    revision: 3,
    operationalPhase: 'scope_confirmation',
    scope: { current, proposal: null, history: [] },
    start: {
      status: 'active',
      scopeVersion: 1,
      failedAttempts: 0,
      attemptsRemaining: 5,
      expiresAt: '2026-08-29T11:15:00.000Z',
      customerCanReveal: true,
      workerMustEnter: false,
      workStartedAt: null,
    },
  }));
  assert.equal(customerScopeFromFulfilmentV1(value).value.scope.startPin.status, 'hidden');
  assert.equal(customerScopeFromFulfilmentV1(value, '012345').value.scope.startPin.status, 'available');
  assert.equal(customerScopeFromFulfilmentV1(value, '012345').value.scope.startPin.value, '012345');
  assert.equal(customerScopeFromFulfilmentV1(value, '12345').ok, false);
});

test('active work maps only arithmetically consistent change-order ledger evidence', () => {
  const current = scope();
  const value = adapt(fulfilment({
    revision: 5,
    transactionalStatus: 'in_progress',
    operationalPhase: 'work_active',
    scope: { current, proposal: null, history: [] },
    start: {
      status: 'consumed',
      scopeVersion: 1,
      failedAttempts: 0,
      attemptsRemaining: 5,
      expiresAt: '2026-08-29T11:15:00.000Z',
      customerCanReveal: false,
      workerMustEnter: false,
      workStartedAt: '2026-08-29T10:00:00.000Z',
    },
    changeOrders: [{
      id: changeId,
      version: 2,
      baseScopeVersion: 1,
      status: 'approved',
      description: 'Replace the isolation valve.',
      addedScopeItems: ['Replace valve'],
      extraMinutes: 30,
      commercial: {
        labourAmount: '100.00',
        materialsAmount: '50.00',
        additionalAmount: '150.00',
        originalTotalAmount: '850.00',
        revisedTotalAmount: '1000.00',
        currency: 'ZAR',
      },
      expiresAt: null,
      decidedAt: '2026-08-29T10:30:00.000Z',
    }],
  }));
  const work = customerActiveWorkFromFulfilmentV1(value);
  assert.equal(work.ok, true);
  assert.equal(work.value.runningEstimate.amountMinor, 100000);
  assert.equal(work.value.changeOrders[0].additionalAmount.amountMinor, 15000);
  assert.equal(work.value.elapsedLabel, '1 h');
});

test('bilateral reschedule evidence preserves proposer role, expiry and decision state', () => {
  const value = adapt(fulfilment({
    revision: 3,
    reschedules: [{
      id: rescheduleId,
      version: 1,
      scheduleRevision: 1,
      status: 'pending',
      proposedByRole: 'customer',
      originalStartsAt: '2026-09-02T10:00:00.000Z',
      proposedStartsAt: '2026-09-03T10:00:00.000Z',
      reason: 'A later morning works better.',
      expiresAt: '2026-09-01T10:00:00.000Z',
      decidedAt: null,
    }],
    allowedActions: { ...fulfilment().allowedActions, decideReschedule: true },
  }));
  assert.equal(value.reschedules[0].id, rescheduleId);
  assert.equal(value.reschedules[0].proposedByRole, 'customer');
  assert.equal(value.allowedActions.decideReschedule, true);

  const inconsistent = fulfilment({
    reschedules: [{
      id: rescheduleId,
      version: 1,
      scheduleRevision: 1,
      status: 'accepted',
      proposedByRole: 'worker',
      originalStartsAt: '2026-09-02T10:00:00.000Z',
      proposedStartsAt: '2026-09-03T10:00:00.000Z',
      reason: null,
      expiresAt: '2026-09-01T10:00:00.000Z',
      decidedAt: null,
    }],
  });
  assert.equal(adaptGroundedFulfilmentV1(inconsistent).ok, false);
});

test('malformed coordinates, money arithmetic, action flags, and revisions fail closed', () => {
  const cases = [
    fulfilment({ revision: -1 }),
    fulfilment({ location: { precision: 'exact', address: 'Somewhere', coordinate: { latitude: 120, longitude: 18 } } }),
    fulfilment({ allowedActions: { ...fulfilment().allowedActions, startRoute: 'yes' } }),
    fulfilment({ changeOrders: [{
      id: changeId,
      version: 1,
      baseScopeVersion: 1,
      status: 'pending',
      description: 'Extra work',
      addedScopeItems: ['Extra'],
      extraMinutes: null,
      commercial: {
        labourAmount: '100.00', materialsAmount: '50.00', additionalAmount: '140.00',
        originalTotalAmount: '850.00', revisedTotalAmount: '990.00', currency: 'ZAR',
      },
      expiresAt: null,
    }] }),
  ];
  for (const raw of cases) assert.equal(adaptGroundedFulfilmentV1(raw).ok, false);
});

test('unknown future phase and missing integrity policy do not become actionable', () => {
  assert.equal(adaptGroundedFulfilmentV1(fulfilment({ operationalPhase: 'teleported' })).ok, false);
  const readOnly = adapt(fulfilment({
    integrity: { policySnapshotPresent: false, policyVersion: null, readOnly: true },
  }));
  assert.equal(readOnly.integrity.readOnly, true);
  assert.equal(Object.values(readOnly.allowedActions).every((allowed) => allowed === false), true);
});
