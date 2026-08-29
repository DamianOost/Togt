'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createEditableAssistance,
  confirmedAssistanceToNeedText,
  createExplainableRecommendation,
  createPrivacySafeLiveUpdate,
  evaluateAssistedCapture,
  reviewAssistedField,
  shouldShowSafetyEducation,
  validateAssistanceEnvelope,
} = require('../../src/features/intelligence/model.ts');

function envelope(overrides = {}) {
  return {
    schemaVersion: 1,
    modelVersion: 'assist-1',
    promptVersion: 'intake-1',
    fields: [{
      fieldId: 'problem_description',
      value: 'The kitchen tap is leaking.',
      confidence: 0.82,
      sources: ['typed_text'],
      explanation: 'Taken from the customer’s typed description.',
    }],
    suggestedQuestions: [{ id: 'leak-location', question: 'Where is the leak?', reason: 'This changes the likely scope.' }],
    ...overrides,
  };
}

test('media assistance requires explicit processing consent and a live capability', () => {
  const input = { typedText: '', voiceAssetId: 'voice-1', photoAssetIds: [], processingConsent: false };
  assert.deepEqual(evaluateAssistedCapture(input, { available: true, reasonCode: 'available' }), {
    allowed: false,
    reasonCode: 'media_processing_consent_required',
  });
  assert.equal(evaluateAssistedCapture({ ...input, processingConsent: true }, {
    available: false,
    reasonCode: 'provider_disabled',
  }).reasonCode, 'provider_disabled');
});

test('typed assistance also requires explicit assisted-processing consent', () => {
  const input = { typedText: 'The kitchen tap is leaking', voiceAssetId: null, photoAssetIds: [], processingConsent: false };
  assert.deepEqual(evaluateAssistedCapture(input, { available: true, reasonCode: 'available' }), {
    allowed: false,
    reasonCode: 'assisted_processing_consent_required',
  });
  assert.equal(evaluateAssistedCapture({ ...input, processingConsent: true }, {
    available: true,
    reasonCode: 'available',
  }).allowed, true);
});

test('assistance output is versioned, bounded and cannot make consequential decisions', () => {
  assert.equal(validateAssistanceEnvelope(envelope()).schemaVersion, 1);
  for (const prohibited of ['workerId', 'finalPriceMinor', 'charge', 'verified', 'safetyResponse']) {
    assert.throws(() => validateAssistanceEnvelope({ ...envelope(), [prohibited]: 'not-allowed' }), /prohibited/);
  }
  assert.throws(() => validateAssistanceEnvelope(envelope({
    fields: [{ ...envelope().fields[0], confidence: 1.5 }],
  })), /between zero and one/);
});

test('every derived field remains unconfirmed until the customer reviews it', () => {
  const draft = createEditableAssistance(envelope());
  assert.equal(draft.readyForDeterministicBrief, false);
  assert.equal(draft.fields[0].status, 'needs_review');
  const confirmed = reviewAssistedField(draft, 'problem_description', 'The cold tap leaks below the basin.');
  assert.equal(confirmed.readyForDeterministicBrief, true);
  assert.equal(confirmed.fields[0].editedByUser, true);
  assert.equal(draft.fields[0].value, 'The kitchen tap is leaking.');
});

test('only a fully reviewed summary enters the visible deterministic need text', () => {
  const draft = createEditableAssistance(envelope({
    fields: [
      envelope().fields[0],
      {
        fieldId: 'urgency',
        value: 'Scheduled',
        confidence: 0.75,
        sources: ['typed_text'],
        explanation: 'No immediate timing was requested.',
      },
    ],
  }));
  assert.equal(confirmedAssistanceToNeedText(draft), null);
  const descriptionReviewed = reviewAssistedField(draft, 'problem_description', 'The tap leaks below the basin.');
  assert.equal(confirmedAssistanceToNeedText(descriptionReviewed), null);
  const fullyReviewed = reviewAssistedField(descriptionReviewed, 'urgency', 'Scheduled');
  assert.equal(
    confirmedAssistanceToNeedText(fullyReviewed),
    'The tap leaks below the basin.\nurgency: Scheduled',
  );
});

test('why-this-match uses only factual allowlisted reasons and labels paid placement', () => {
  const recommendation = createExplainableRecommendation({
    workerId: 'worker-1',
    rankingVersion: 'rank-1',
    reasons: [{ code: 'credential_fit', fact: 'Recorded plumbing credential matches this service requirement.' }],
    sponsored: true,
  });
  assert.equal(recommendation.placementLabel, 'Sponsored');
  assert.throws(() => createExplainableRecommendation({
    workerId: 'worker-1', rankingVersion: 'rank-1', reasons: [{ code: 'best', fact: 'Best worker' }], sponsored: false,
  }), /Unsupported match reason/);
});

test('live update projection contains no address, phone, chat or sensitive brief payload', () => {
  const update = createPrivacySafeLiveUpdate({
    projectId: 'project-1',
    revision: 4,
    phase: 'en_route',
    serviceLabel: 'Plumbing visit',
    statusLabel: 'Worker is on the way',
    actionLabel: 'View project',
    updatedAt: '2026-08-29T10:00:00.000Z',
    address: 'must not project',
    phone: 'must not project',
  });
  assert.deepEqual(Object.keys(update).sort(), [
    'actionLabel', 'phase', 'projectId', 'revision', 'schemaVersion', 'status', 'title', 'updatedAt',
  ]);
});

test('contextual safety education is frequency capped and cooled down', () => {
  assert.equal(shouldShowSafetyEducation({
    trigger: 'first_project_hub', now: '2026-08-29T00:00:00.000Z', shownAt: [],
  }), true);
  assert.equal(shouldShowSafetyEducation({
    trigger: 'first_project_hub', now: '2026-08-29T00:00:00.000Z', shownAt: ['2026-08-28T00:00:00.000Z'],
  }), false);
  assert.equal(shouldShowSafetyEducation({
    trigger: 'first_project_hub', now: '2026-08-29T00:00:00.000Z', shownAt: ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
  }), false);
});
