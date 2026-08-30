'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deriveWorkerQuoteActions,
  hasWorkerQuoteFormErrors,
  validateWorkerQuoteForSubmission,
  workerQuoteFormFromEvidence,
  workerQuoteIdempotencyKey,
  workerQuoteMutationFromForm,
} = require('../../src/features/worker/quotes/model.ts');

const request = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  version: 2,
  status: 'open',
  service: { id: '22222222-2222-4222-8222-222222222222', version: 1, label: 'Repair', identityVerificationRequired: true, credentialIds: [] },
  brief: { summary: null, answers: [], materialsResponsibility: 'worker', mediaCount: 0 },
  broadAreaLabel: 'Rondebosch',
  startsAt: '2026-09-02T08:00:00.000Z',
  endsAt: '2026-09-02T10:00:00.000Z',
  flexibility: null,
  questionsDeadlineAt: '2026-08-30T08:00:00.000Z',
  quotesCloseAt: '2026-08-31T08:00:00.000Z',
  createdAt: '2026-08-29T08:00:00.000Z',
  updatedAt: '2026-08-29T08:00:00.000Z',
});

function completeForm(overrides = {}) {
  return Object.freeze({
    scope: 'Replace the failed connector and pressure-test it.',
    deliverables: 'Replace connector\nPressure test',
    exclusions: 'Cabinet repair',
    assumptions: 'Isolation valve works',
    proposedStartAt: '2026-09-02T08:00:00.000Z',
    proposedEndAt: '2026-09-02T10:00:00.000Z',
    durationMinutes: '120',
    labourAmount: '750',
    materialsAmount: '250.0',
    validUntil: '2026-08-30T08:00:00.000Z',
    ...overrides,
  });
}

test('complete worker quote is validated against request window, expiry, duration and positive total', () => {
  const valid = validateWorkerQuoteForSubmission(completeForm(), request, '2026-08-29T10:00:00.000Z');
  assert.deepEqual(valid, {});
  assert.equal(hasWorkerQuoteFormErrors(valid), false);

  const invalid = validateWorkerQuoteForSubmission(completeForm({
    durationMinutes: '60',
    validUntil: '2026-09-03T08:00:00.000Z',
    labourAmount: '0',
    materialsAmount: '0',
  }), request, '2026-08-29T10:00:00.000Z');
  assert.match(invalid.durationMinutes, /equal/);
  assert.match(invalid.validUntil, /no later/);
  assert.match(invalid.labourAmount, /greater than zero/);
});

test('customer-supplied materials reject a nonzero worker materials charge before submission', () => {
  const errors = validateWorkerQuoteForSubmission(
    completeForm({ materialsAmount: '10.00' }),
    { ...request, brief: { ...request.brief, materialsResponsibility: 'customer' } },
    '2026-08-29T10:00:00.000Z'
  );
  assert.match(errors.materialsAmount, /customer-supplied/);
  assert.deepEqual(validateWorkerQuoteForSubmission(
    completeForm({ materialsAmount: '0' }),
    { ...request, brief: { ...request.brief, materialsResponsibility: 'customer' } },
    '2026-08-29T10:00:00.000Z'
  ), {});
});

test('mutation canonicalises server fields and never authors fee, net, identity or status', () => {
  const mutation = workerQuoteMutationFromForm(completeForm());
  assert.deepEqual(mutation.deliverables, ['Replace connector', 'Pressure test']);
  assert.equal(mutation.labourAmount, '750.00');
  assert.equal(mutation.materialsAmount, '250.00');
  assert.equal(mutation.proposedStartAt, '2026-09-02T08:00:00.000Z');
  for (const serverOwned of ['status', 'workerId', 'platformFee', 'workerNet', 'customerTotalAmount']) {
    assert.equal(Object.hasOwn(mutation, serverOwned), false);
  }
});

test('permissions keep terminal and offline requests read-only while allowing server attempts on open requests', () => {
  const online = deriveWorkerQuoteActions({ request, quote: null, connection: 'online' });
  assert.equal(online.canSaveDraft, true);
  assert.equal(online.canSubmit, true);
  assert.equal(online.canWithdraw, false);

  const offline = deriveWorkerQuoteActions({ request, quote: null, connection: 'offline' });
  assert.equal(offline.canSaveDraft, false);
  assert.match(offline.reason, /never|not|Reconnect/i);

  const terminal = deriveWorkerQuoteActions({ request: { ...request, status: 'selected' }, quote: { status: 'lost' }, connection: 'online' });
  assert.equal(terminal.readOnly, true);
  assert.equal(terminal.canSubmit, false);
});

test('idempotency key is stable for a replay and changes with content or quote version', () => {
  const quote = workerQuoteMutationFromForm(completeForm());
  const base = { command: 'create_submit', requestId: request.id, version: request.version, quote };
  const first = workerQuoteIdempotencyKey(base);
  assert.equal(workerQuoteIdempotencyKey(base), first);
  assert.notEqual(workerQuoteIdempotencyKey({ ...base, quote: { ...quote, labourAmount: '751.00' } }), first);
  assert.notEqual(workerQuoteIdempotencyKey({ ...base, version: 3 }), first);
  assert.match(first, /^worker-quote:create_submit:/);
});

test('new quote form starts from server request schedule and quote deadline without inventing fees', () => {
  const form = workerQuoteFormFromEvidence(request, null);
  assert.equal(form.proposedStartAt, request.startsAt);
  assert.equal(form.proposedEndAt, request.endsAt);
  assert.equal(form.durationMinutes, '120');
  assert.equal(form.validUntil, request.quotesCloseAt);
  assert.equal(Object.hasOwn(form, 'platformFee'), false);
});
