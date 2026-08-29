'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { adaptRecurringPendingRequestsV1 } = require('../../src/data/grounded/recurrence.ts');
const { deriveRecurringSeriesActions } = require('../../src/features/trust/model.ts');

function series(overrides = {}) {
  return {
    schema: 'togt.trust.v1',
    id: '11111111-1111-4111-8111-111111111111',
    revision: 4,
    status: 'resume_requested',
    sourceProjectReference: '22222222-2222-4222-8222-222222222222',
    participants: {
      customer: { id: '33333333-3333-4333-8333-333333333333' },
      worker: { id: '44444444-4444-4444-8444-444444444444', displayName: 'Thabo' },
    },
    acceptances: [],
    occurrences: [],
    pendingOccurrenceChanges: [],
    pendingRequests: {
      resumeRequestedByRole: 'worker',
      cancellationRequestedByRole: null,
    },
    controls: {
      occurrenceAndWholeSeriesAreDistinct: true,
      bookingCreationIsAutomatic: false,
      eachOccurrenceRequiresBookingConfirmation: true,
      substitutionIsAutomatic: false,
      mutualAcceptanceRequired: true,
    },
    createdAt: '2026-08-29T08:00:00.000Z',
    updatedAt: '2026-08-29T09:00:00.000Z',
    ...overrides,
  };
}

test('recurrence adapter preserves role-only requester evidence and counterpart alone can accept resume', () => {
  const source = series();
  const pending = adaptRecurringPendingRequestsV1(source.pendingRequests, source.status);
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.value, {
    resumeRequestedByRole: 'worker',
    cancellationRequestedByRole: null,
  });
  const adapted = { ...source, pendingRequests: pending.value };
  assert.equal(deriveRecurringSeriesActions(adapted, 'customer', 'online').acceptResume, true);
  assert.equal(deriveRecurringSeriesActions(adapted, 'worker', 'online').acceptResume, false);
});

test('counterpart alone can accept whole-series cancellation', () => {
  const source = series({
    status: 'cancellation_requested',
    pendingRequests: {
      resumeRequestedByRole: null,
      cancellationRequestedByRole: 'customer',
    },
  });
  const pending = adaptRecurringPendingRequestsV1(source.pendingRequests, source.status);
  assert.equal(pending.ok, true);
  const adapted = { ...source, pendingRequests: pending.value };
  assert.equal(deriveRecurringSeriesActions(adapted, 'worker', 'online').acceptCancelSeries, true);
  assert.equal(deriveRecurringSeriesActions(adapted, 'customer', 'online').acceptCancelSeries, false);
});

test('adapter fails closed when requester evidence is absent, contradictory or contains an identity', () => {
  for (const broken of [
    series({ pendingRequests: undefined }),
    series({ pendingRequests: { resumeRequestedByRole: null, cancellationRequestedByRole: null } }),
    series({ pendingRequests: { resumeRequestedByRole: 'customer', cancellationRequestedByRole: 'worker' } }),
    series({ pendingRequests: { resumeRequestedByRole: '44444444-4444-4444-8444-444444444444', cancellationRequestedByRole: null } }),
  ]) {
    assert.equal(adaptRecurringPendingRequestsV1(broken.pendingRequests, broken.status).ok, false);
  }
});

test('non-pending series require both requester roles to be explicitly null', () => {
  const source = series({
    status: 'active',
    pendingRequests: { resumeRequestedByRole: null, cancellationRequestedByRole: null },
  });
  const pending = adaptRecurringPendingRequestsV1(source.pendingRequests, source.status);
  assert.equal(pending.ok, true);
  const active = { ...source, pendingRequests: pending.value };
  assert.equal(active.status, 'active');
  assert.equal(deriveRecurringSeriesActions(active, 'customer', 'offline').acceptResume, false);
});
