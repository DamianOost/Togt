const { FEATURES } = require('../../config/capabilities');
const {
  RECOMMENDATION_SCHEMA_VERSION,
  assertSafeText,
  boundedText,
  fail,
  isoInstant,
  stableId,
} = require('./contracts');

const RANKING_VERSION = 'grounded-deterministic-v1';
const REASON_CODES = new Set([
  'credential_fit',
  'verified_availability',
  'service_area_fit',
  'reliability_evidence',
  'price_compatibility',
  'past_customer_relationship',
]);

function nonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${name}_invalid`, `${name} must be a non-negative integer`);
  return number;
}

function factualReason(evidence) {
  if (!evidence || !REASON_CODES.has(evidence.code)) {
    fail('recommendation_reason_invalid', 'Recommendation evidence type is unsupported');
  }
  const evidenceAsOf = isoInstant(evidence.evidenceAsOf, 'evidence_as_of');
  switch (evidence.code) {
    case 'credential_fit':
      if (evidence.activeOptIn !== true) fail('recommendation_evidence_unverified', 'Service fit needs an active catalogue opt-in');
      {
        const serviceLabel = boundedText(evidence.serviceLabel, 'service_label', 80);
        assertSafeText(serviceLabel, 'recommendation.service_label');
        return { code: evidence.code, fact: `Offers ${serviceLabel} on TOGT`, evidenceAsOf };
      }
    case 'verified_availability':
      if (evidence.verified !== true) fail('recommendation_evidence_unverified', 'Availability must be verified');
      return { code: evidence.code, fact: 'Availability was confirmed for the requested window', evidenceAsOf };
    case 'service_area_fit':
      if (evidence.verified !== true) fail('recommendation_evidence_unverified', 'Service-area fit must be verified');
      return { code: evidence.code, fact: 'The requested broad area is within this Worker’s service area', evidenceAsOf };
    case 'reliability_evidence': {
      const count = nonNegativeInteger(evidence.completedProjectCount, 'completed_project_count');
      return { code: evidence.code, fact: `${count} completed TOGT Project${count === 1 ? '' : 's'} recorded`, evidenceAsOf };
    }
    case 'price_compatibility':
      if (evidence.validQuote !== true) fail('recommendation_evidence_unverified', 'Price compatibility requires a valid quote');
      return { code: evidence.code, fact: 'A valid ZAR quote is available for this request', evidenceAsOf };
    case 'past_customer_relationship': {
      const count = nonNegativeInteger(evidence.priorCompletedProjectCount, 'prior_completed_project_count');
      if (count < 1) fail('recommendation_evidence_unverified', 'Past relationship needs completion evidence');
      return { code: evidence.code, fact: `${count} prior completed Project${count === 1 ? '' : 's'} with you`, evidenceAsOf };
    }
    default:
      fail('recommendation_reason_invalid', 'Recommendation evidence type is unsupported');
  }
}

function createExplainableRecommendation(input) {
  if (!input || !Array.isArray(input.evidence) || input.evidence.length < 1 || input.evidence.length > REASON_CODES.size) {
    fail('recommendation_evidence_invalid', 'Recommendation needs 1-6 structured evidence items');
  }
  const reasons = input.evidence.map(factualReason);
  if (new Set(reasons.map((reason) => reason.code)).size !== reasons.length) {
    fail('recommendation_evidence_invalid', 'Recommendation evidence cannot contain duplicate reason types');
  }
  const sponsored = input.sponsored === true;
  return Object.freeze({
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    workerId: stableId(input.workerId, 'worker_id', { uuid: true }),
    rankingVersion: stableId(input.rankingVersion || RANKING_VERSION, 'ranking_version'),
    reasons: Object.freeze(reasons.map(Object.freeze)),
    placement: Object.freeze({ sponsored, label: sponsored ? 'Sponsored' : null }),
    claims: Object.freeze({ bestMatch: false, guaranteedOutcome: false }),
    manualComparisonAvailable: true,
  });
}

function createRecommendationService({
  capability = FEATURES.explainable_recommendations,
  source,
} = {}) {
  return Object.freeze({
    async explanation(actor, requestId, workerId) {
      if (actor?.role !== 'customer') {
        fail('auth_forbidden_role', 'Recommendation explanations are customer-only', 403);
      }
      if (capability?.available !== true) {
        fail('capability_unavailable', 'Explainable recommendations are unavailable', 503, {
          capability: 'explainable_recommendations',
          reasonCode: capability?.reason_code || 'ranking_fairness_gate_not_approved',
          manualComparisonAvailable: true,
        });
      }
      if (!source || typeof source.getEvidence !== 'function') {
        fail('recommendation_source_unavailable', 'Recommendation evidence source is unavailable', 503);
      }
      const evidence = await source.getEvidence(actor, requestId, workerId);
      if (!evidence) fail('recommendation_not_found', 'Recommendation evidence was not found', 404);
      if (String(evidence.workerId).toLowerCase() !== String(workerId).toLowerCase()) {
        fail('recommendation_source_mismatch', 'Recommendation evidence identity did not match the request', 500);
      }
      return createExplainableRecommendation(evidence);
    },
  });
}

module.exports = {
  RANKING_VERSION,
  REASON_CODES,
  factualReason,
  createExplainableRecommendation,
  createRecommendationService,
};
