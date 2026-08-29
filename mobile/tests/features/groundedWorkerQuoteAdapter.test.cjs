'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptWorkerQuoteCommandV1,
  adaptWorkerQuoteRequestDetailV1,
  adaptWorkerQuoteRequestListV1,
} = require('../../src/data/grounded/workerQuotes.ts');

const ids = {
  request: '11111111-1111-4111-8111-111111111111',
  service: '22222222-2222-4222-8222-222222222222',
  quote: '33333333-3333-4333-8333-333333333333',
  otherRequest: '44444444-4444-4444-8444-444444444444',
};

function request(overrides = {}) {
  return {
    id: ids.request,
    version: 2,
    status: 'receiving',
    service: {
      id: ids.service,
      version: 3,
      label: 'Complex plumbing repair',
      briefSchema: { questions: [
        { id: 'leak_location', label: 'Where is the leak?' },
        { id: 'water_isolated', label: 'Is the water isolated?' },
      ] },
      workerEligibility: { requiresIdentityVerified: true, credentialIds: ['trade.plumbing'] },
    },
    brief: {
      schemaVersion: 1,
      answers: { leak_location: 'Kitchen sink — [contact removed]', water_isolated: true },
      media: [{ id: 'opaque-media-reference', kind: 'image' }],
      summary: 'A connector is leaking. [contact removed]',
    },
    area: { label: 'Rondebosch, Cape Town', precision: 'broad' },
    schedule: {
      startsAt: '2026-09-02T08:00:00.000Z',
      endsAt: '2026-09-02T10:00:00.000Z',
      timezone: 'Africa/Johannesburg',
      flexibility: 'Morning preferred',
    },
    questionsDeadlineAt: '2026-08-30T08:00:00.000Z',
    quotesCloseAt: '2026-08-31T08:00:00.000Z',
    selectedAt: null,
    createdAt: '2026-08-29T08:00:00.000Z',
    updatedAt: '2026-08-29T09:00:00.000Z',
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    id: ids.quote,
    requestId: ids.request,
    status: 'submitted',
    version: 4,
    scope: 'Replace the failed connector and pressure-test it.',
    deliverables: ['Replace connector', 'Pressure test'],
    exclusions: ['Cabinet repair'],
    assumptions: ['Isolation valve works'],
    schedule: {
      startsAt: '2026-09-02T08:00:00.000Z',
      endsAt: '2026-09-02T10:00:00.000Z',
      durationMinutes: 120,
      timezone: 'Africa/Johannesburg',
    },
    commercial: {
      labourAmount: '750.00',
      materialsAmount: '250.00',
      customerTotalAmount: '1000.00',
      currency: 'ZAR',
      platformFee: { state: 'not_configured', amount: null },
      workerNet: { state: 'not_available', amount: null },
    },
    validUntil: '2026-08-30T08:00:00.000Z',
    submittedAt: '2026-08-29T09:00:00.000Z',
    acceptedAt: null,
    declinedAt: null,
    expiredAt: null,
    withdrawnAt: null,
    lostAt: null,
    createdAt: '2026-08-29T08:30:00.000Z',
    updatedAt: '2026-08-29T09:00:00.000Z',
    ...overrides,
  };
}

test('worker inbox and detail adapt only privacy-safe request evidence and the worker own quote', () => {
  const list = adaptWorkerQuoteRequestListV1({
    quoteRequests: [request()],
    meta: { count: 1, role: 'worker' },
  });
  assert.equal(list.ok, true);
  assert.equal(list.value[0].service.identityVerificationRequired, true);
  assert.deepEqual(list.value[0].service.credentialIds, ['trade.plumbing']);
  assert.equal(list.value[0].brief.answers[0].label, 'Where is the leak?');
  assert.equal(list.value[0].brief.mediaCount, 1);
  assert.equal(Object.hasOwn(list.value[0], 'customerId'), false);

  const detail = adaptWorkerQuoteRequestDetailV1({ quoteRequest: request(), ownQuote: quote() });
  assert.equal(detail.ok, true);
  assert.equal(detail.value.ownQuote.id, ids.quote);
  assert.equal(detail.value.ownQuote.customerTotalMinor, 100000);
  assert.equal(detail.value.ownQuote.platformFee.state, 'not_configured');
  assert.equal(Object.hasOwn(detail.value, 'quotes'), false);
});

test('worker request adapter fails closed on exact location, customer identity or unsanitised contact evidence', () => {
  for (const unsafe of [
    request({ privateLocation: { address: '12 Exact Street' } }),
    request({ customerId: '55555555-5555-4555-8555-555555555555' }),
    request({ brief: { answers: { leak_location: 'Call 082 123 4567' }, media: [], summary: null } }),
    request({ brief: { answers: { location: { address: '12 Exact Street' } }, media: [], summary: null } }),
  ]) {
    assert.deepEqual(adaptWorkerQuoteRequestDetailV1({ quoteRequest: unsafe, ownQuote: null }), {
      ok: false,
      reasonCode: 'invalid_worker_quote_contract',
      field: 'quoteRequest',
    });
  }
});

test('own quote must belong to this request and carry internally consistent server money/schedule evidence', () => {
  for (const broken of [
    quote({ requestId: ids.otherRequest }),
    quote({ commercial: { labourAmount: '750.00', materialsAmount: '250.00', customerTotalAmount: '999.00', currency: 'ZAR', platformFee: { state: 'not_configured', amount: null }, workerNet: { state: 'not_available', amount: null } } }),
    quote({ schedule: { startsAt: '2026-09-02T08:00:00.000Z', endsAt: '2026-09-02T10:00:00.000Z', durationMinutes: 60, timezone: 'Africa/Johannesburg' } }),
  ]) {
    const result = adaptWorkerQuoteRequestDetailV1({ quoteRequest: request(), ownQuote: broken });
    assert.equal(result.ok, false);
  }
});

test('quote command adapter accepts partial drafts but requires complete submitted offers', () => {
  const draft = adaptWorkerQuoteCommandV1({ quote: quote({
    status: 'draft',
    scope: 'Initial scope',
    deliverables: [],
    schedule: { startsAt: null, endsAt: null, durationMinutes: null, timezone: 'Africa/Johannesburg' },
    commercial: {
      labourAmount: null,
      materialsAmount: null,
      customerTotalAmount: null,
      currency: 'ZAR',
      platformFee: { state: 'not_configured', amount: null },
      workerNet: { state: 'not_available', amount: null },
    },
    validUntil: null,
  }) });
  assert.equal(draft.ok, true);
  assert.equal(draft.value.status, 'draft');

  const incompleteSubmitted = adaptWorkerQuoteCommandV1({ quote: quote({ status: 'submitted', deliverables: [] }) });
  assert.equal(incompleteSubmitted.ok, false);
});
