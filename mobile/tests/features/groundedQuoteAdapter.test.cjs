'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptCustomerOpenQuoteRequestListV1,
  adaptQuoteMatchingSnapshotV1,
} = require('../../src/data/grounded/quotes.ts');

const ids = {
  request: '11111111-1111-4111-8111-111111111111',
  service: '22222222-2222-4222-8222-222222222222',
  quote: '33333333-3333-4333-8333-333333333333',
  worker: '44444444-4444-4444-8444-444444444444',
  booking: '55555555-5555-4555-8555-555555555555',
};

function request(overrides = {}) {
  return {
    id: ids.request,
    version: 2,
    status: 'receiving',
    service: { id: ids.service, version: 3, label: 'Complex plumbing repair' },
    selectedQuoteId: null,
    bookingId: null,
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    id: ids.quote,
    requestId: ids.request,
    status: 'submitted',
    version: 4,
    scope: 'Replace the failed connector.',
    deliverables: ['Remove failed part', 'Fit replacement'],
    exclusions: ['Wall repair'],
    assumptions: ['Isolation valve works'],
    schedule: {
      startsAt: '2026-09-02T10:00:00.000Z',
      endsAt: '2026-09-02T12:00:00.000Z',
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
    validUntil: '2026-08-31T10:00:00.000Z',
    worker: {
      id: ids.worker,
      name: 'Synthetic Test Worker',
      avatarUrl: null,
      verification: { identityVerified: false },
      rating: { state: 'new_on_togt', average: null, count: 0 },
      serviceOptIn: 'active',
    },
    ...overrides,
  };
}

function listedRequest(overrides = {}) {
  return {
    id: ids.request,
    version: 2,
    status: 'receiving',
    service: { id: ids.service, version: 3, label: 'Complex plumbing repair' },
    area: { label: 'Roodepoort, Johannesburg', precision: 'broad' },
    schedule: {
      startsAt: '2026-09-02T10:00:00.000Z',
      timezone: 'Africa/Johannesburg',
    },
    quotesCloseAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    brief: { summary: 'Secret gate detail', accessInstructions: 'Secret code' },
    privateLocation: { address: '12 Exact Street', latitude: -26.1, longitude: 28.1 },
    customerId: 'customer-private-id',
    ...overrides,
  };
}

test('customer open-request recovery projects only broad, non-private list evidence', () => {
  const result = adaptCustomerOpenQuoteRequestListV1({
    quoteRequests: [listedRequest()],
    meta: { count: 1, role: 'customer' },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value[0]).sort(), [
    'broadAreaLabel',
    'quotesCloseLabel',
    'requestId',
    'requestVersion',
    'scheduleLabel',
    'serviceLabel',
    'status',
    'updatedAt',
  ]);
  assert.equal(result.value[0].requestId, ids.request);
  assert.equal(result.value[0].broadAreaLabel, 'Roodepoort, Johannesburg');
  assert.doesNotMatch(JSON.stringify(result.value), /Secret|Exact Street|privateLocation|accessInstructions|latitude|longitude|customerId/);
});

test('customer recovery filters terminal requests, sorts newest first and fails closed for a wrong role', () => {
  const olderId = '66666666-6666-4666-8666-666666666666';
  const newerId = '77777777-7777-4777-8777-777777777777';
  const response = {
    quoteRequests: [
      listedRequest({ id: olderId, status: 'open', updatedAt: '2026-08-29T10:00:00.000Z' }),
      listedRequest({ id: ids.request, status: 'cancelled' }),
      listedRequest({ id: newerId, updatedAt: '2026-08-30T11:00:00.000Z' }),
    ],
    meta: { count: 3, role: 'customer' },
  };
  const result = adaptCustomerOpenQuoteRequestListV1(response);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.map((item) => item.requestId), [newerId, olderId]);
  assert.deepEqual(adaptCustomerOpenQuoteRequestListV1({ ...response, meta: { role: 'worker' } }), {
    ok: false,
    reasonCode: 'invalid_quote_request_list_contract',
    field: 'response',
  });
});

test('customer recovery rejects malformed active request evidence instead of inventing a card', () => {
  assert.deepEqual(adaptCustomerOpenQuoteRequestListV1({
    quoteRequests: [listedRequest({ area: { label: 'Exact address', precision: 'exact' } })],
    meta: { count: 1, role: 'customer' },
  }), {
    ok: false,
    reasonCode: 'invalid_quote_request_list_contract',
    field: 'quoteRequest',
  });
});

test('open quote request becomes a truthful ready comparison only from complete quote evidence', () => {
  const result = adaptQuoteMatchingSnapshotV1(request(), [quote()]);
  assert.equal(result.ok, true);
  assert.equal(result.value.mode, 'receive_quotes');
  assert.equal(result.value.status, 'ready');
  assert.equal(result.value.projectId, ids.request);
  assert.equal(result.value.quotes[0].total.amountMinor, 100000);
  assert.equal(result.value.quotes[0].worker.rating, null);
  assert.deepEqual(result.value.quotes[0].worker.verification, []);
  assert.equal(result.value.quotes[0].worker.reliabilityLabel, null);
  assert.equal(result.value.quotes[0].worker.distanceLabel, null);
});

test('selected quote requires both server booking and selected quote identity', () => {
  const invalid = adaptQuoteMatchingSnapshotV1(request({ status: 'selected', selectedQuoteId: ids.quote }), [
    quote({ status: 'accepted' }),
  ]);
  assert.deepEqual(invalid, { ok: false, reasonCode: 'invalid_quote_contract', field: 'status' });

  const selected = adaptQuoteMatchingSnapshotV1(request({
    status: 'selected',
    selectedQuoteId: ids.quote,
    bookingId: ids.booking,
  }), [quote({ status: 'accepted' })]);
  assert.equal(selected.ok, true);
  assert.equal(selected.value.status, 'selected');
  assert.equal(selected.value.projectId, ids.booking);
});

test('invalid money, identity, schedule or missing worker evidence fails the whole comparison closed', () => {
  for (const broken of [
    quote({ commercial: { customerTotalAmount: 'not-money', currency: 'ZAR' } }),
    quote({ id: 'not-an-id' }),
    quote({ schedule: { startsAt: 'not-a-date', durationMinutes: 120 } }),
    quote({ worker: undefined }),
  ]) {
    assert.deepEqual(adaptQuoteMatchingSnapshotV1(request(), [broken]), {
      ok: false,
      reasonCode: 'invalid_quote_contract',
      field: 'quotes',
    });
  }
});

test('request terminal states remain distinct and never fabricate a selected Project', () => {
  assert.equal(adaptQuoteMatchingSnapshotV1(request({ status: 'no_quotes' }), []).value.status, 'no_quotes');
  assert.equal(adaptQuoteMatchingSnapshotV1(request({ status: 'cancelled' }), []).value.status, 'cancelled');
  assert.equal(adaptQuoteMatchingSnapshotV1(request({ status: 'expired' }), []).value.status, 'no_quotes');
});
