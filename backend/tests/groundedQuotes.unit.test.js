const {
  normalizeRequestInput,
  normalizeQuoteInput,
  mergeQuoteInput,
  assertCompleteQuote,
  hashPayload,
} = require('../src/services/groundedQuotes/contracts');
const {
  catalogueService,
  sanitizeWorkerBrief,
} = require('../src/services/groundedQuotes/projections');

const now = new Date('2026-08-29T10:00:00.000Z');

function serviceRow() {
  return {
    service_id: '11111111-1111-4111-8111-111111111111',
    service_version: 3,
    schema_version: 1,
    canonical_key: 'burst_pipe_quote',
    category_key: 'plumbing',
    label_en_za: 'Complex plumbing repair',
    description_en_za: 'Remote quote after a structured brief.',
    pricing_mode: 'remote_quote',
    fulfilment_mode: 'receive_quotes',
    risk_tier: 'standard',
    required_question_ids: ['leak_location', 'water_isolated'],
    brief_schema: { questions: [
      {
        id: 'leak_location',
        type: 'single_select',
        label: 'Where is the leak?',
        options: [{ value: 'kitchen', label: 'Kitchen' }, { value: 'bathroom', label: 'Bathroom' }],
      },
      { id: 'water_isolated', type: 'boolean', label: 'Is the water isolated?' },
    ] },
    pricing_rules: { finalPrice: 'accepted_quote_only' },
    materials_rules: { disclosure: 'required' },
    change_order_rules: { approval: 'customer' },
    minimum_duration_minutes: 60,
    call_out_fee: null,
    currency: 'ZAR',
    cancellation_policy_version: 'quote-v1',
    recurrence_eligible: false,
    worker_eligibility: { requiresIdentityVerified: true },
    published_at: '2026-08-20T00:00:00.000Z',
  };
}

test('catalogue projection carries stable service/version truth and no availability claim', () => {
  const service = catalogueService(serviceRow());
  expect(service.id).toBe('11111111-1111-4111-8111-111111111111');
  expect(service.version).toBe(3);
  expect(service.pricingMode).toBe('remote_quote');
  expect(service.requiredQuestionIds).toEqual(['leak_location', 'water_isolated']);
  expect(service).not.toHaveProperty('availability');
  expect(service).not.toHaveProperty('workers');
});

test('worker brief projection strips location keys and contact-shaped text recursively', () => {
  const projected = sanitizeWorkerBrief({
    answers: {
      issue: 'Please call 082 123 4567 or me@example.com',
      nested: { address: '12 Exact Street', safe: 'Kitchen sink' },
    },
    latitude: -33.9,
  });
  expect(JSON.stringify(projected)).not.toContain('082');
  expect(JSON.stringify(projected)).not.toContain('@example.com');
  expect(JSON.stringify(projected)).not.toContain('Exact Street');
  expect(projected.answers.nested.safe).toBe('Kitchen sink');
});

test('request input is driven by required question IDs and keeps exact location separate', () => {
  const body = {
    brief: {
      answers: { leak_location: 'kitchen', water_isolated: true },
      materialsResponsibility: 'worker',
      summary: 'Leak under the sink',
    },
    broadAreaLabel: 'Rondebosch, Cape Town',
    privateLocation: {
      address: '12 Exact Street, Rondebosch',
      latitude: -33.96,
      longitude: 18.47,
      accessInstructions: 'Use pedestrian gate',
    },
    schedule: {
      startsAt: '2026-09-02T10:00:00.000Z',
      endsAt: '2026-09-02T12:00:00.000Z',
      timezone: 'Africa/Johannesburg',
    },
    questionsDeadlineAt: '2026-08-30T10:00:00.000Z',
    quotesCloseAt: '2026-08-31T10:00:00.000Z',
  };
  const normalized = normalizeRequestInput(body, serviceRow(), now);
  expect(normalized.brief.answers.water_isolated).toBe(true);
  expect(normalized.brief.materialsResponsibility).toBe('worker');
  expect(normalized.broadAreaLabel).toBe('Rondebosch, Cape Town');
  expect(normalized.privateLocation.address).toContain('Exact Street');

  expect(() => normalizeRequestInput({
    ...body,
    brief: { answers: { leak_location: 'kitchen' }, materialsResponsibility: 'worker' },
  }, serviceRow(), now)).toThrow('Required service questions are unanswered');

  expect(() => normalizeRequestInput({
    ...body,
    brief: { ...body.brief, materialsResponsibility: 'invented' },
  }, serviceRow(), now)).toThrow('Materials responsibility is required');

  expect(() => normalizeRequestInput({
    ...body,
    brief: { ...body.brief, answers: { leak_location: 'garage', water_isolated: true } },
  }, serviceRow(), now)).toThrow('Brief answers do not match the published question contract');

  expect(() => normalizeRequestInput({
    ...body,
    brief: { ...body.brief, answers: { leak_location: 'kitchen', water_isolated: 'yes' } },
  }, serviceRow(), now)).toThrow('Brief answers do not match the published question contract');

  const hiddenQuestionService = serviceRow();
  hiddenQuestionService.brief_schema = {
    questions: [
      { id: 'leak_location', type: 'single_select', options: [{ value: 'kitchen' }] },
      { id: 'water_isolated', type: 'boolean', label: 'Is the water isolated?' },
    ],
  };
  expect(() => normalizeRequestInput(body, hiddenQuestionService, now))
    .toThrow('This service brief is not available');

  const oversizedQuestionIdService = serviceRow();
  oversizedQuestionIdService.brief_schema.questions[0].id = `q_${'a'.repeat(79)}`;
  expect(() => normalizeRequestInput(body, oversizedQuestionIdService, now))
    .toThrow('This service brief is not available');
});

test('draft patches merge without inventing missing commercial values; complete quote validates', () => {
  const draft = normalizeQuoteInput({ scope: 'Replace the failed connector' });
  const merged = mergeQuoteInput({
    scope: null,
    deliverables: [],
    exclusions: [],
    assumptions: [],
    proposedStartAt: null,
    proposedEndAt: null,
    durationMinutes: null,
    labourAmount: null,
    materialsAmount: null,
    validUntil: null,
  }, draft);
  expect(merged.scope).toBe('Replace the failed connector');
  expect(merged.labourAmount).toBeNull();

  const complete = normalizeQuoteInput({
    scope: 'Replace the failed connector',
    deliverables: ['Remove failed part', 'Fit replacement'],
    exclusions: ['Wall repair'],
    assumptions: ['Isolation valve works'],
    proposedStartAt: '2026-09-02T10:00:00.000Z',
    proposedEndAt: '2026-09-02T12:00:00.000Z',
    durationMinutes: 120,
    labourAmount: '750.00',
    materialsAmount: '250.00',
    validUntil: '2026-08-31T10:00:00.000Z',
  }, { requireComplete: true });
  assertCompleteQuote(complete, {
    quotes_close_at: '2026-09-01T10:00:00.000Z',
    schedule_snapshot: { startsAt: '2026-09-02T10:00:00.000Z' },
  }, now);
  expect(complete.labourAmount).toBe('750.00');
});

test('idempotency hashes are stable across JSON property order', () => {
  expect(hashPayload({ b: 2, a: { y: 2, x: 1 } }))
    .toBe(hashPayload({ a: { x: 1, y: 2 }, b: 2 }));
});
