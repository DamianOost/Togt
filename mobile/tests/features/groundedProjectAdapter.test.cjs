'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptProjectHubV1,
  adaptProjectListItemV1,
  completionPaymentFromProjectV1,
  trackingEvidenceFromProjectV1,
} = require('../../src/data/grounded/projects.ts');

const ids = {
  project: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  worker: '33333333-3333-4333-8333-333333333333',
  service: '44444444-4444-4444-8444-444444444444',
  quote: '55555555-5555-4555-8555-555555555555',
  snapshot: '66666666-6666-4666-8666-666666666666',
  event: '77777777-7777-4777-8777-777777777777',
  issue: '88888888-8888-4888-8888-888888888888',
  payment: '99999999-9999-4999-8999-999999999999',
};

function project(overrides = {}) {
  return {
    schema: 'togt.project.v1',
    id: ids.project,
    revision: 4,
    segment: 'active',
    transactionalStatus: 'in_progress',
    operational: { phase: 'en_route', label: 'Worker on the way' },
    service: {
      id: ids.service,
      version: 3,
      label: 'Complex plumbing repair',
      snapshot: { materialsRules: { summary: 'Materials are itemised.' } },
    },
    schedule: { startsAt: '2026-09-02T10:00:00.000Z' },
    area: { precision: 'exact', address: '12 Exact Street, Cape Town' },
    participants: {
      customer: { id: ids.customer, displayName: 'Naledi' },
      worker: {
        id: ids.worker,
        displayName: 'Thabo',
        avatarUrl: 'https://example.test/thabo.png',
        phone: '0831234567',
        trust: { verified: true, rating: 4.8, reviewCount: 25 },
      },
    },
    commercial: {
      agreedTotal: '1000.00',
      currency: 'ZAR',
      frozenSnapshot: { id: ids.snapshot, version: 2, capturedAt: '2026-08-29T10:00:00.000Z' },
      acceptedQuote: {
        quoteId: ids.quote,
        quoteVersion: 5,
        scope: { scope: 'Replace the failed connector.', assumptions: ['Isolation valve works'] },
        commercial: { customerTotalAmount: '1000.00', currency: 'ZAR' },
      },
    },
    payment: { status: 'pending', amount: '1000.00', currency: 'ZAR', updatedAt: '2026-08-29T10:00:00.000Z' },
    completion: { status: 'not_requested' },
    scope: { items: [{ label: 'Replace connector' }] },
    workerLiveLocation: {
      coordinate: { latitude: -33.9249, longitude: 18.4241 },
      updatedAt: '2026-08-29T11:59:45.000Z',
      freshness: 'fresh',
    },
    timeline: [{
      id: ids.event,
      type: 'project.created',
      label: 'Project created',
      phase: 'matching',
      occurredAt: '2026-08-28T10:00:00.000Z',
    }],
    updatedAt: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

test('versioned quote Project maps only server-authored identity, price, worker and travel evidence', () => {
  const detail = adaptProjectHubV1(project());
  assert.equal(detail.ok, true, JSON.stringify(detail));
  assert.equal(detail.value.serviceId, ids.service);
  assert.equal(detail.value.worker.workerId, ids.worker);
  assert.equal(detail.value.worker.rating.average, 4.8);
  assert.equal(detail.value.commercial.price.kind, 'quote');
  assert.equal(detail.value.commercial.price.total.amountMinor, 100000);
  assert.equal(detail.value.commercial.scopeSummary, 'Replace the failed connector.');
  assert.equal(detail.value.payment.obligationStatus, 'due');
  assert.equal(detail.value.payment.checkoutCapability, 'unavailable');

  assert.deepEqual(trackingEvidenceFromProjectV1(project()), {
    visibility: 'available',
    capturedAt: '2026-08-29T11:59:45.000Z',
    latitude: -33.9249,
    longitude: 18.4241,
    accuracyMetres: null,
    etaLabel: null,
  });
});

test('legacy Project remains readable without inventing catalogue identity or pricing mode', () => {
  const legacy = project({
    service: { label: 'Legacy handyman job' },
    commercial: { agreedTotal: '850.00', currency: 'ZAR' },
    participants: {
      customer: { id: ids.customer, displayName: 'Naledi' },
      worker: { id: ids.worker, displayName: 'Thabo', trust: { verified: false, reviewCount: 0 } },
    },
  });
  const detail = adaptProjectHubV1(legacy);
  assert.equal(detail.ok, true, JSON.stringify(detail));
  assert.equal(detail.value.serviceId, null);
  assert.equal(detail.value.serviceVersion, null);
  assert.equal(detail.value.worker, null);
  assert.deepEqual(detail.value.commercial.price, {
    kind: 'recorded_total',
    total: { amountMinor: 85000, currency: 'ZAR' },
    label: 'Recorded Project total; pricing mode is not available.',
  });
  assert.equal(detail.value.commercial.pricingMode, 'recorded_total');
});

test('unknown lifecycle and payment evidence stays safe and non-actionable', () => {
  const detail = adaptProjectHubV1(project({
    operational: { phase: 'new_server_phase', label: 'Status unavailable' },
    payment: { status: 'new_provider_state', amount: '1000.00', currency: 'ZAR' },
  }));
  assert.equal(detail.ok, true);
  assert.equal(detail.value.phase, 'unknown');
  assert.equal(detail.value.payment.obligationStatus, 'unknown');
  assert.equal(detail.value.payment.amountDue, null);
  assert.equal(detail.value.payment.amountPaid, null);
});

test('malformed identity, schedule, service identity or money fail closed', () => {
  const bad = [
    project({ id: 'not-an-id' }),
    project({ schedule: { startsAt: 'not-a-date' } }),
    project({ service: { id: 'not-an-id', version: 3, label: 'Plumbing' } }),
    project({ commercial: { acceptedQuote: {
      quoteId: ids.quote,
      quoteVersion: 1,
      scope: { scope: 'Work' },
      commercial: { customerTotalAmount: '01.00', currency: 'ZAR' },
    } } }),
  ];
  assert.equal(adaptProjectListItemV1(bad[0]).ok, false);
  assert.equal(adaptProjectHubV1(bad[1]).ok, false);
  assert.equal(adaptProjectHubV1(bad[2]).ok, false);
  const malformedMoney = adaptProjectHubV1(bad[3]);
  assert.equal(malformedMoney.ok, true);
  assert.equal(malformedMoney.value.commercial.price.kind, 'not_yet_available');
});

test('completion maps bilateral server state and never invents a receipt or online checkout', () => {
  const completed = project({
    segment: 'past',
    transactionalStatus: 'completed',
    operational: { phase: 'closed', label: 'Completed' },
    completion: {
      status: 'confirmed',
      requestedAt: '2026-08-29T11:00:00.000Z',
    },
    payment: { status: 'paid', amount: '1000.00', currency: 'ZAR', updatedAt: '2026-08-29T12:00:00.000Z' },
  });
  const view = completionPaymentFromProjectV1(completed);
  assert.equal(view.ok, true, JSON.stringify(view));
  assert.equal(view.value.completion.status, 'confirmed');
  assert.equal(view.value.payment.obligationStatus, 'paid');
  assert.equal(view.value.receipt, null);
  assert.equal(view.value.retention.relationshipsAvailable, false);
  assert.equal(trackingEvidenceFromProjectV1(completed).visibility, 'hidden');
});

test('an authoritative dispute remains a separate open issue and not a completed Project', () => {
  const disputed = project({
    operational: { phase: 'completion_review', label: 'Issue under review' },
    completion: { status: 'disputed', issue: { id: ids.issue, reason: 'The leak remains.' } },
  });
  const detail = adaptProjectHubV1(disputed);
  assert.equal(detail.ok, true);
  assert.deepEqual(detail.value.openIssue, { issueId: ids.issue, label: 'The leak remains.' });
  assert.equal(completionPaymentFromProjectV1(disputed).value.completion.status, 'disputed');
});

test('a paid canonical payment record produces a truthful receipt without inventing method, fee or tax values', () => {
  const completed = project({
    segment: 'past',
    transactionalStatus: 'completed',
    operational: { phase: 'closed', label: 'Completed' },
    completion: { status: 'confirmed', requestedAt: '2026-08-29T11:00:00.000Z' },
    payment: {
      status: 'paid',
      recordId: ids.payment,
      amount: '1000.00',
      currency: 'ZAR',
      updatedAt: '2026-08-29T12:00:00.000Z',
    },
  });
  const view = completionPaymentFromProjectV1(completed);
  assert.equal(view.ok, true, JSON.stringify(view));
  assert.equal(view.value.receipt.receiptId, ids.payment);
  assert.equal(view.value.receipt.amount.amountMinor, 100000);
  assert.match(view.value.receipt.methodLabel, /not recorded/i);
  assert.match(view.value.receipt.feeAndTaxLabel, /No audited fee or tax breakdown/i);
});
