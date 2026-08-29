import {
  createEditableAssistance,
  validateAssistanceEnvelope,
} from '../../features/intelligence/model.ts';
import type {
  AssistFieldId,
  AssistSource,
  EditableAssistance,
  MatchReasonCode,
} from '../../features/intelligence/model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PRIVATE_TEXT = /(?:\+27|0)\s*[1-8][\d\s()-]{8,13}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{13}\b|-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}|\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{0,60}\s+(?:street|road|avenue|drive|lane|close|crescent|boulevard|highway)\b/i;
const UNSAFE_ASSISTANCE_TEXT = /ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions?|messages?)|(?:system|developer)\s*(?:prompt|message)\s*:|\b(?:gas\s+leak|active\s+fire|sparking\s+wires?|electric\s+shock|structural\s+collapse|weapon|explosive|bomb)\b/i;
const PRICING_MODE_RECOMMENDATIONS = new Set(['fixed_price', 'remote_quote', 'diagnostic_then_quote', 'fast_match']);

type JsonRecord = Record<string, unknown>;

export type IntelligenceAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      reasonCode:
        | 'invalid_assisted_intake_contract'
        | 'invalid_recommendation_contract'
        | 'invalid_live_status_contract';
      field: string;
    }>;

export type AssistedIntakeResponseV1 = Readonly<{
  assistance: EditableAssistance;
  confirmation: Readonly<{
    everyDerivedFieldRequired: true;
    finalWorkerSelectedByAI: false;
    finalPriceSetByAI: false;
    paymentActionTakenByAI: false;
    identityOrSafetyDecisionTakenByAI: false;
  }>;
  processing: Readonly<{
    providerId: string;
    providerAdapterVersion: 1;
    retainedByTogt: false;
    eligibleForGeneralAnalytics: false;
    consentPolicyVersion: string;
  }>;
}>;

export type RecommendationReasonV1 = Readonly<{
  code: MatchReasonCode;
  fact: string;
  evidenceAsOf: string;
}>;

export type RecommendationExplanationV1 = Readonly<{
  schemaVersion: 1;
  workerId: string;
  rankingVersion: string;
  reasons: readonly RecommendationReasonV1[];
  placementLabel: 'Sponsored' | null;
  bestMatchClaimed: false;
  guaranteedOutcomeClaimed: false;
  manualComparisonAvailable: true;
}>;

export type LiveStatusPhaseV1 =
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'work_active'
  | 'completion_review'
  | 'payment_pending';

type ProjectLiveStatusBaseV1 = Readonly<{
  schemaVersion: 1;
  projectId: string;
  revision: number;
  updatedAt: string;
}>;

export type ProjectLiveStatusV1 =
  | (ProjectLiveStatusBaseV1 & Readonly<{
      state: 'active';
      phase: LiveStatusPhaseV1;
      title: string;
      status: string;
      actionLabel: string | null;
    }>)
  | (ProjectLiveStatusBaseV1 & Readonly<{ state: 'ended' | 'not_eligible' }>);

const FIELD_IDS = new Set<AssistFieldId>([
  'likely_service',
  'problem_description',
  'urgency',
  'materials_clues',
  'complexity',
  'pricing_mode_recommendation',
]);
const SOURCES = new Set<AssistSource>(['typed_text', 'voice_transcript', 'work_photo', 'service_catalogue']);
const REASON_CODES = new Set<MatchReasonCode>([
  'credential_fit',
  'verified_availability',
  'service_area_fit',
  'reliability_evidence',
  'price_compatibility',
  'past_customer_relationship',
]);
const LIVE_PHASES = new Set<LiveStatusPhaseV1>([
  'accepted',
  'en_route',
  'arrived',
  'work_active',
  'completion_review',
  'payment_pending',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return expected.length === actual.length && expected.every((key, index) => key === actual[index]);
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function stableId(value: unknown, max = 160): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max && STABLE_ID.test(candidate) ? candidate : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max && !candidate.includes('\u0000') ? candidate : null;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function nonNegativeRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeAssistanceText(value: unknown, max: number): string | null {
  const candidate = text(value, max);
  return candidate && !PRIVATE_TEXT.test(candidate) && !UNSAFE_ASSISTANCE_TEXT.test(candidate) ? candidate : null;
}

function factualRecommendationReason(code: MatchReasonCode, fact: string): boolean {
  if (PRIVATE_TEXT.test(fact)) return false;
  const templates: Readonly<Record<MatchReasonCode, RegExp>> = Object.freeze({
    credential_fit: /^Offers [\p{L}\p{N}][\p{L}\p{N} &(),.'/-]{0,79} on TOGT$/u,
    verified_availability: /^Availability was confirmed for the requested window$/,
    service_area_fit: /^The requested broad area is within this Worker’s service area$/,
    reliability_evidence: /^\d+ completed TOGT Projects? recorded$/,
    price_compatibility: /^A valid ZAR quote is available for this request$/,
    past_customer_relationship: /^\d+ prior completed Projects? with you$/,
  });
  return templates[code].test(fact);
}

function invalid<T>(
  reasonCode: Extract<IntelligenceAdaptResult<T>, { ok: false }>['reasonCode'],
  field: string,
): IntelligenceAdaptResult<T> {
  return Object.freeze({ ok: false, reasonCode, field });
}

export function adaptAssistedIntakeResponseV1(input: unknown): IntelligenceAdaptResult<AssistedIntakeResponseV1> {
  const reasonCode = 'invalid_assisted_intake_contract' as const;
  if (!isRecord(input) || !hasExactKeys(input, ['assistance', 'confirmation', 'processing'])) {
    return invalid(reasonCode, 'response');
  }
  const assistance = isRecord(input.assistance) ? input.assistance : null;
  const confirmation = isRecord(input.confirmation) ? input.confirmation : null;
  const processing = isRecord(input.processing) ? input.processing : null;
  if (!assistance || !confirmation || !processing) return invalid(reasonCode, 'response');
  if (!hasExactKeys(assistance, [
    'schemaVersion', 'modelVersion', 'promptVersion', 'fields', 'suggestedQuestions', 'readyForDeterministicBrief',
  ]) || assistance.schemaVersion !== 1 || assistance.readyForDeterministicBrief !== false
      || !stableId(assistance.modelVersion) || !stableId(assistance.promptVersion)
      || !Array.isArray(assistance.fields) || assistance.fields.length > FIELD_IDS.size
      || !Array.isArray(assistance.suggestedQuestions) || assistance.suggestedQuestions.length > 12) {
    return invalid(reasonCode, 'assistance');
  }

  const seenFields = new Set<AssistFieldId>();
  for (const rawField of assistance.fields) {
    if (!isRecord(rawField) || !hasExactKeys(rawField, [
      'fieldId', 'value', 'confidence', 'sources', 'explanation', 'status', 'editedByUser',
    ])) return invalid(reasonCode, 'assistance.fields');
    const fieldId = rawField.fieldId as AssistFieldId;
    if (!FIELD_IDS.has(fieldId) || seenFields.has(fieldId)
        || !safeAssistanceText(rawField.value, 1_000) || !safeAssistanceText(rawField.explanation, 320)
        || typeof rawField.confidence !== 'number' || rawField.confidence < 0 || rawField.confidence > 1
        || !Array.isArray(rawField.sources) || rawField.sources.length === 0 || rawField.sources.length > SOURCES.size
        || rawField.sources.some((source) => !SOURCES.has(source as AssistSource))
        || new Set(rawField.sources).size !== rawField.sources.length
        || rawField.status !== 'needs_review' || rawField.editedByUser !== false
        || (fieldId === 'pricing_mode_recommendation' && !PRICING_MODE_RECOMMENDATIONS.has(String(rawField.value)))) {
      return invalid(reasonCode, 'assistance.fields');
    }
    seenFields.add(fieldId);
  }

  const seenQuestions = new Set<string>();
  for (const rawQuestion of assistance.suggestedQuestions) {
    if (!isRecord(rawQuestion) || !hasExactKeys(rawQuestion, ['id', 'question', 'reason'])) {
      return invalid(reasonCode, 'assistance.suggestedQuestions');
    }
    const questionId = stableId(rawQuestion.id);
    if (!questionId || seenQuestions.has(questionId)
        || !safeAssistanceText(rawQuestion.question, 320) || !safeAssistanceText(rawQuestion.reason, 320)) {
      return invalid(reasonCode, 'assistance.suggestedQuestions');
    }
    seenQuestions.add(questionId);
  }
  const uncertain = assistance.fields.some((field) => isRecord(field)
    && typeof field.confidence === 'number' && field.confidence < 0.7);
  if (uncertain && assistance.suggestedQuestions.length === 0) {
    return invalid(reasonCode, 'assistance.suggestedQuestions');
  }

  if (!hasExactKeys(confirmation, [
    'everyDerivedFieldRequired',
    'finalWorkerSelectedByAI',
    'finalPriceSetByAI',
    'paymentActionTakenByAI',
    'identityOrSafetyDecisionTakenByAI',
  ]) || confirmation.everyDerivedFieldRequired !== true
      || confirmation.finalWorkerSelectedByAI !== false
      || confirmation.finalPriceSetByAI !== false
      || confirmation.paymentActionTakenByAI !== false
      || confirmation.identityOrSafetyDecisionTakenByAI !== false) {
    return invalid(reasonCode, 'confirmation');
  }

  const providerId = stableId(processing.providerId);
  const consentPolicyVersion = stableId(processing.consentPolicyVersion);
  if (!hasExactKeys(processing, [
    'providerId',
    'providerAdapterVersion',
    'retainedByTogt',
    'eligibleForGeneralAnalytics',
    'consentPolicyVersion',
  ]) || !providerId || processing.providerAdapterVersion !== 1
      || processing.retainedByTogt !== false
      || processing.eligibleForGeneralAnalytics !== false
      || !consentPolicyVersion) {
    return invalid(reasonCode, 'processing');
  }

  try {
    const raw = validateAssistanceEnvelope({
      schemaVersion: assistance.schemaVersion,
      modelVersion: assistance.modelVersion,
      promptVersion: assistance.promptVersion,
      fields: assistance.fields,
      suggestedQuestions: assistance.suggestedQuestions,
    });
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        assistance: createEditableAssistance(raw),
        confirmation: Object.freeze({
          everyDerivedFieldRequired: true,
          finalWorkerSelectedByAI: false,
          finalPriceSetByAI: false,
          paymentActionTakenByAI: false,
          identityOrSafetyDecisionTakenByAI: false,
        }),
        processing: Object.freeze({
          providerId,
          providerAdapterVersion: 1,
          retainedByTogt: false,
          eligibleForGeneralAnalytics: false,
          consentPolicyVersion,
        }),
      }),
    });
  } catch {
    return invalid(reasonCode, 'assistance');
  }
}

export function adaptRecommendationExplanationV1(
  input: unknown,
  expectedWorkerId?: string,
): IntelligenceAdaptResult<RecommendationExplanationV1> {
  const reasonCode = 'invalid_recommendation_contract' as const;
  if (!isRecord(input) || !hasExactKeys(input, ['recommendation']) || !isRecord(input.recommendation)) {
    return invalid(reasonCode, 'response');
  }
  const raw = input.recommendation;
  if (!hasExactKeys(raw, [
    'schemaVersion', 'workerId', 'rankingVersion', 'reasons', 'placement', 'claims', 'manualComparisonAvailable',
  ]) || raw.schemaVersion !== 1 || !Array.isArray(raw.reasons)
      || raw.reasons.length < 1 || raw.reasons.length > REASON_CODES.size
      || raw.manualComparisonAvailable !== true) {
    return invalid(reasonCode, 'recommendation');
  }
  const workerId = uuid(raw.workerId);
  const rankingVersion = stableId(raw.rankingVersion);
  if (!workerId || !rankingVersion || (expectedWorkerId && workerId !== uuid(expectedWorkerId))) {
    return invalid(reasonCode, 'recommendation.identity');
  }
  const seen = new Set<MatchReasonCode>();
  const reasons: RecommendationReasonV1[] = [];
  for (const item of raw.reasons) {
    if (!isRecord(item) || !hasExactKeys(item, ['code', 'fact', 'evidenceAsOf'])) {
      return invalid(reasonCode, 'recommendation.reasons');
    }
    const code = item.code as MatchReasonCode;
    const fact = text(item.fact, 240);
    const evidenceAsOf = iso(item.evidenceAsOf);
    if (!REASON_CODES.has(code) || seen.has(code) || !fact || !evidenceAsOf
        || !factualRecommendationReason(code, fact)) {
      return invalid(reasonCode, 'recommendation.reasons');
    }
    seen.add(code);
    reasons.push(Object.freeze({ code, fact, evidenceAsOf }));
  }
  if (!isRecord(raw.placement) || !hasExactKeys(raw.placement, ['sponsored', 'label'])
      || typeof raw.placement.sponsored !== 'boolean'
      || (raw.placement.sponsored ? raw.placement.label !== 'Sponsored' : raw.placement.label !== null)) {
    return invalid(reasonCode, 'recommendation.placement');
  }
  if (!isRecord(raw.claims) || !hasExactKeys(raw.claims, ['bestMatch', 'guaranteedOutcome'])
      || raw.claims.bestMatch !== false || raw.claims.guaranteedOutcome !== false) {
    return invalid(reasonCode, 'recommendation.claims');
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      workerId,
      rankingVersion,
      reasons: Object.freeze(reasons),
      placementLabel: raw.placement.sponsored ? 'Sponsored' : null,
      bestMatchClaimed: false,
      guaranteedOutcomeClaimed: false,
      manualComparisonAvailable: true,
    }),
  });
}

export function adaptProjectLiveStatusV1(
  input: unknown,
  expectedProjectId?: string,
): IntelligenceAdaptResult<ProjectLiveStatusV1> {
  const reasonCode = 'invalid_live_status_contract' as const;
  if (!isRecord(input) || !hasExactKeys(input, ['liveStatus']) || !isRecord(input.liveStatus)) {
    return invalid(reasonCode, 'response');
  }
  const raw = input.liveStatus;
  const projectId = uuid(raw.projectId);
  const revision = nonNegativeRevision(raw.revision);
  const updatedAt = iso(raw.updatedAt);
  if (raw.schemaVersion !== 1 || !projectId || revision === null || !updatedAt
      || (expectedProjectId && projectId !== uuid(expectedProjectId))) {
    return invalid(reasonCode, 'liveStatus.identity');
  }
  if (raw.state === 'ended' || raw.state === 'not_eligible') {
    if (!hasExactKeys(raw, ['schemaVersion', 'projectId', 'revision', 'state', 'updatedAt'])) {
      return invalid(reasonCode, 'liveStatus.terminal');
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ schemaVersion: 1, projectId, revision, state: raw.state, updatedAt }),
    });
  }
  const phase = raw.phase as LiveStatusPhaseV1;
  const title = text(raw.title, 80);
  const status = text(raw.status, 120);
  const actionLabel = raw.actionLabel === null ? null : text(raw.actionLabel, 80);
  if (raw.state !== 'active' || !hasExactKeys(raw, [
    'schemaVersion', 'projectId', 'revision', 'state', 'phase', 'title', 'status', 'actionLabel', 'updatedAt',
  ]) || !LIVE_PHASES.has(phase) || !title || !status || raw.actionLabel !== null && !actionLabel
      || PRIVATE_TEXT.test(`${title}\n${status}\n${actionLabel ?? ''}`)) {
    return invalid(reasonCode, 'liveStatus.active');
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      projectId,
      revision,
      state: 'active',
      phase,
      title,
      status,
      actionLabel,
      updatedAt,
    }),
  });
}
