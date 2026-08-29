'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptAssistedIntakeResponseV1,
  adaptProjectLiveStatusV1,
  adaptRecommendationExplanationV1,
} = require('../../src/data/grounded/intelligence.ts');

const ids = Object.freeze({
  project: '11111111-1111-4111-8111-111111111111',
  request: '22222222-2222-4222-8222-222222222222',
  worker: '33333333-3333-4333-8333-333333333333',
  otherWorker: '44444444-4444-4444-8444-444444444444',
});

function assisted(overrides = {}) {
  return {
    assistance: {
      schemaVersion: 1,
      modelVersion: 'eval-model-v1',
      promptVersion: 'intake-v1',
      fields: [{
        fieldId: 'problem_description',
        value: 'A kitchen tap is dripping',
        confidence: 0.9,
        sources: ['typed_text'],
        explanation: 'The customer described a dripping kitchen tap',
        status: 'needs_review',
        editedByUser: false,
      }],
      suggestedQuestions: [],
      readyForDeterministicBrief: false,
    },
    confirmation: {
      everyDerivedFieldRequired: true,
      finalWorkerSelectedByAI: false,
      finalPriceSetByAI: false,
      paymentActionTakenByAI: false,
      identityOrSafetyDecisionTakenByAI: false,
    },
    processing: {
      providerId: 'approved-eval-provider',
      providerAdapterVersion: 1,
      retainedByTogt: false,
      eligibleForGeneralAnalytics: false,
      consentPolicyVersion: 'ai-processing-v1',
    },
    ...overrides,
  };
}

function recommendation(overrides = {}) {
  return {
    recommendation: {
      schemaVersion: 1,
      workerId: ids.worker,
      rankingVersion: 'grounded-deterministic-v1',
      reasons: [{
        code: 'credential_fit',
        fact: 'Offers Plumbing on TOGT',
        evidenceAsOf: '2026-08-29T10:00:00.000Z',
      }],
      placement: { sponsored: true, label: 'Sponsored' },
      claims: { bestMatch: false, guaranteedOutcome: false },
      manualComparisonAvailable: true,
      ...overrides,
    },
  };
}

function live(overrides = {}) {
  return {
    liveStatus: {
      schemaVersion: 1,
      projectId: ids.project,
      revision: 0,
      state: 'active',
      phase: 'en_route',
      title: 'Plumbing',
      status: 'Worker en route',
      actionLabel: 'View arrival',
      updatedAt: '2026-08-29T10:00:00.000Z',
      ...overrides,
    },
  };
}

test('assisted response accepts only review-required, non-consequential provider output', () => {
  const result = adaptAssistedIntakeResponseV1(assisted());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.assistance.readyForDeterministicBrief, false);
  assert.equal(result.value.assistance.fields[0].status, 'needs_review');
  assert.equal(result.value.confirmation.finalWorkerSelectedByAI, false);
  assert.equal(result.value.confirmation.finalPriceSetByAI, false);
  assert.equal(result.value.processing.retainedByTogt, false);
  assert.equal(result.value.processing.eligibleForGeneralAnalytics, false);
});

test('assisted response fails closed on decision claims, retention drift and unknown fields', () => {
  const automaticWorker = assisted({
    confirmation: { ...assisted().confirmation, finalWorkerSelectedByAI: true },
  });
  const retained = assisted({
    processing: { ...assisted().processing, retainedByTogt: true },
  });
  const expanded = assisted();
  expanded.assistance.fields[0].selectedWorkerId = ids.worker;
  const alreadyConfirmed = assisted();
  alreadyConfirmed.assistance.fields[0].status = 'confirmed';
  for (const invalid of [automaticWorker, retained, expanded, alreadyConfirmed]) {
    assert.equal(adaptAssistedIntakeResponseV1(invalid).ok, false);
  }
});

test('uncertain assisted fields require an explicit clarifying question', () => {
  const raw = assisted();
  raw.assistance.fields[0].confidence = 0.6;
  assert.deepEqual(adaptAssistedIntakeResponseV1(raw), {
    ok: false,
    reasonCode: 'invalid_assisted_intake_contract',
    field: 'assistance.suggestedQuestions',
  });
  raw.assistance.suggestedQuestions = [{
    id: 'tap-location',
    question: 'Which room contains the tap?',
    reason: 'The location affects preparation',
  }];
  assert.equal(adaptAssistedIntakeResponseV1(raw).ok, true);
});

test('recommendation adapter preserves factual dated reasons and visible sponsorship', () => {
  const result = adaptRecommendationExplanationV1(recommendation(), ids.worker);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.workerId, ids.worker);
  assert.equal(result.value.placementLabel, 'Sponsored');
  assert.equal(result.value.bestMatchClaimed, false);
  assert.equal(result.value.guaranteedOutcomeClaimed, false);
  assert.equal(result.value.manualComparisonAvailable, true);
  assert.equal(result.value.reasons[0].evidenceAsOf, '2026-08-29T10:00:00.000Z');
});

test('recommendation adapter rejects hidden claims, disguised superlatives and identity drift', () => {
  const claim = recommendation({ claims: { bestMatch: true, guaranteedOutcome: false } });
  const superlative = recommendation({
    reasons: [{
      code: 'credential_fit',
      fact: 'Best worker for this service',
      evidenceAsOf: '2026-08-29T10:00:00.000Z',
    }],
  });
  assert.equal(adaptRecommendationExplanationV1(claim, ids.worker).ok, false);
  assert.equal(adaptRecommendationExplanationV1(superlative, ids.worker).ok, false);
  assert.equal(adaptRecommendationExplanationV1(recommendation(), ids.otherWorker).ok, false);
});

test('live-status adapter accepts only a privacy-safe allowlisted active projection', () => {
  const result = adaptProjectLiveStatusV1(live(), ids.project);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Object.keys(result.value).sort(), [
    'actionLabel', 'phase', 'projectId', 'revision', 'schemaVersion', 'state', 'status', 'title', 'updatedAt',
  ]);
  assert.equal(result.value.revision, 0);
});

test('live-status adapter rejects contact, exact coordinates, extra private fields and identity drift', () => {
  const phone = live({ title: 'Call 082 123 4567' });
  const coordinates = live({ status: 'At -33.9249, 18.4241' });
  const extra = live({ address: '12 Private Street' });
  for (const invalid of [phone, coordinates, extra]) {
    assert.equal(adaptProjectLiveStatusV1(invalid, ids.project).ok, false);
  }
  assert.equal(adaptProjectLiveStatusV1(live(), '55555555-5555-4555-8555-555555555555').ok, false);
});

test('terminal live status is minimal and rejects stale active fields', () => {
  const result = adaptProjectLiveStatusV1({
    liveStatus: {
      schemaVersion: 1,
      projectId: ids.project,
      revision: 9,
      state: 'ended',
      updatedAt: '2026-08-29T12:00:00.000Z',
    },
  }, ids.project);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Object.keys(result.value).sort(), ['projectId', 'revision', 'schemaVersion', 'state', 'updatedAt']);
  assert.equal(adaptProjectLiveStatusV1(live({ state: 'ended' }), ids.project).ok, false);
});
