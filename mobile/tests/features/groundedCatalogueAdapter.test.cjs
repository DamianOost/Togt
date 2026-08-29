'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptCatalogueServiceV1,
  catalogueShortcuts,
  catalogueSuggestions,
  commercialTermsFromCatalogue,
  decimalZarToMinor,
  pricingExplanation,
  toIntakeCatalogueSnapshot,
} = require('../../src/data/grounded/catalogue.ts');

function raw(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    version: 3,
    schemaVersion: 1,
    canonicalKey: 'burst_pipe_quote',
    categoryKey: 'plumbing',
    label: 'Complex plumbing repair',
    description: 'Remote quote after a structured brief.',
    pricingMode: 'remote_quote',
    fulfilmentMode: 'receive_quotes',
    riskTier: 'standard',
    requiredQuestionIds: ['leak_location'],
    briefSchema: {
      questions: [{
        id: 'leak_location',
        prompt: 'Where is the leak?',
        type: 'single_select',
        options: [{ value: 'kitchen', label: 'Kitchen' }],
      }],
    },
    pricingRules: { finalPrice: 'accepted_quote_only' },
    materialsRules: { summary: 'Materials must be itemised in the quote.' },
    minimumDurationMinutes: 60,
    callOutFee: null,
    currency: 'ZAR',
    cancellationPolicyVersion: 'quote-v1',
    recurrenceEligible: false,
    publishedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function adapt(overrides = {}) {
  const result = adaptCatalogueServiceV1(raw(overrides));
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

test('catalogue adapter accepts only a complete published v1 identity and question contract', () => {
  const service = adapt();
  assert.equal(service.id, raw().id);
  assert.equal(service.version, 3);
  assert.equal(service.questions[0].questionId, 'leak_location');
  assert.equal(service.questions[0].required, true);
  assert.equal(Object.isFrozen(service), true);

  const malformed = adaptCatalogueServiceV1(raw({
    id: 'not-an-id',
    requiredQuestionIds: ['missing_question'],
  }));
  assert.equal(malformed.ok, false);
  assert.ok(malformed.fields.includes('id'));
  assert.ok(malformed.fields.includes('briefSchema'));
});

test('service version maps to one truthful pricing and fulfilment mode without supply claims', () => {
  const service = adapt();
  assert.deepEqual(toIntakeCatalogueSnapshot(service), {
    serviceId: service.id,
    serviceVersion: 3,
    label: service.label,
    requiredQuestionIds: ['leak_location'],
    allowedPricingModes: ['remote_quote'],
    allowedFulfilmentModes: ['receive_quotes'],
    permitsNow: false,
    photoRequirement: 'optional',
  });
  assert.equal(pricingExplanation(service).mode, 'remote_quote');
  assert.equal('availability' in service, false);
  assert.equal('workers' in service, false);
});

test('commercial terms never fabricate a fixed price, fee, cap or diagnostic deliverable', () => {
  const quoteTerms = commercialTermsFromCatalogue(adapt());
  assert.equal(quoteTerms.pricingMode, 'remote_quote');
  assert.equal(quoteTerms.requestFeeMinor, null);
  assert.equal(quoteTerms.finalPriceStatus, 'not_available_until_quote');

  const fixedMissingEvidence = adapt({
    pricingMode: 'fixed_instant',
    fulfilmentMode: 'compare_workers',
    pricingRules: {},
  });
  assert.equal(commercialTermsFromCatalogue(fixedMissingEvidence), null);

  const diagnosticMissingEvidence = adapt({
    pricingMode: 'diagnostic_visit',
    fulfilmentMode: 'book_diagnostic_visit',
    callOutFee: '250.00',
    pricingRules: {},
  });
  assert.equal(commercialTermsFromCatalogue(diagnosticMissingEvidence), null);
});

test('exact server-authored fixed values convert to safe ZAR minor units', () => {
  assert.equal(decimalZarToMinor('1250.5'), 125050);
  assert.equal(decimalZarToMinor('01.00'), null);
  assert.equal(decimalZarToMinor('1.234'), null);
  const fixed = adapt({
    pricingMode: 'fixed_instant',
    fulfilmentMode: 'fast_match',
    pricingRules: {
      labourAmount: '400.00',
      platformFee: '40.00',
      allInTotal: '440.00',
      permitsNow: true,
    },
  });
  assert.deepEqual(commercialTermsFromCatalogue(fixed), {
    pricingMode: 'fixed',
    labourAmountMinor: 40000,
    platformFeeMinor: 4000,
    allInTotalMinor: 44000,
    materialsAssumption: 'Materials must be itemised in the quote.',
    cancellationSummary: 'Cancellation policy quote-v1',
  });
});

test('deterministic suggestions and shortcuts use only real published catalogue entries', () => {
  const plumbing = adapt();
  const electrical = adapt({
    id: '22222222-2222-4222-8222-222222222222',
    canonicalKey: 'socket_repair',
    categoryKey: 'electrical',
    label: 'Socket repair',
    description: 'Repair one electrical socket.',
  });
  assert.deepEqual(catalogueSuggestions([plumbing, electrical], 'plumbing quote').map((item) => item.serviceId), [plumbing.id]);
  assert.deepEqual(catalogueShortcuts([plumbing, electrical]).map((item) => item.serviceId), [plumbing.id, electrical.id]);
  assert.deepEqual(catalogueSuggestions([plumbing], ''), []);
});
