const ASSISTED_INTAKE_SCHEMA_VERSION = 1;
const RECOMMENDATION_SCHEMA_VERSION = 1;
const LIVE_STATUS_SCHEMA_VERSION = 1;

const FIELD_IDS = new Set([
  'likely_service',
  'problem_description',
  'urgency',
  'materials_clues',
  'complexity',
  'pricing_mode_recommendation',
]);
const SOURCES = new Set(['typed_text', 'voice_transcript', 'work_photo', 'service_catalogue']);
const PRICING_MODES = new Set(['fixed_price', 'remote_quote', 'diagnostic_then_quote', 'fast_match']);
const PROHIBITED_DECISION_KEYS = new Set([
  'workerid',
  'selectedworkerid',
  'finalprice',
  'finalpriceminor',
  'charge',
  'paymentdecision',
  'verificationdecision',
  'verified',
  'kycdecision',
  'safetyresponse',
  'emergencyresponse',
  'rankingscore',
  'hiddenreason',
]);

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|system|developer)\s+(instructions?|messages?)/i,
  /(?:system|developer)\s*(?:prompt|message)\s*:/i,
  /reveal\s+(?:the\s+)?(?:prompt|instructions?|secrets?)/i,
  /(?:call|invoke|use)\s+(?:a\s+)?(?:tool|function|plugin)\b/i,
  /(?:exfiltrate|jailbreak|prompt\s*injection)/i,
];
const HAZARD_PATTERNS = [
  /\b(?:gas\s+leak|active\s+fire|sparking\s+wires?|electric\s+shock|structural\s+collapse)\b/i,
  /\b(?:medical|life[- ]threatening)\s+emergency\b/i,
  /\b(?:weapon|explosive|bomb)\b/i,
];
const SENSITIVE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+27|0)\s*[6-8][\d\s()-]{8,13}\b/,
  /\b\d{13}\b/,
  /\b(?:bearer\s+[A-Za-z0-9._~+/-]+=*|api[_ -]?key|password)\b/i,
  /-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}/,
];

class IntelligenceContractError extends Error {
  constructor(code, message, status = 422, extensions) {
    super(message);
    this.name = 'IntelligenceContractError';
    this.code = code;
    this.status = status;
    this.extensions = extensions;
  }
}

function fail(code, message, status = 422, extensions) {
  throw new IntelligenceContractError(code, message, status, extensions);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknown(value, allowed, name) {
  if (!isRecord(value)) fail(`${name}_invalid`, `${name} must be a JSON object`, 400);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    fail(`${name}_fields_invalid`, `${name} contains unsupported fields`, 422, {
      unsupportedFields: unknown.sort(),
    });
  }
}

function boundedText(value, name, maxLength, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string') fail(`${name}_invalid`, `${name} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    fail(`${name}_invalid`, `${name} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function stableId(value, name, { uuid = false } = {}) {
  const normalized = boundedText(value, name, 160);
  const pattern = uuid
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    : /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
  if (!pattern.test(normalized)) fail(`${name}_invalid`, `${name} is not a valid identifier`, 400);
  return normalized;
}

function isoInstant(value, name) {
  const text = boundedText(value, name, 80);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) fail(`${name}_invalid`, `${name} must be an ISO instant`);
  return new Date(parsed).toISOString();
}

function findUnsafeText(text) {
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) return 'prompt_injection_detected';
  if (HAZARD_PATTERNS.some((pattern) => pattern.test(text))) return 'hazardous_input_detected';
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return 'sensitive_input_detected';
  return null;
}

function assertSafeText(text, context) {
  const reason = findUnsafeText(text);
  if (!reason) return;
  const messages = {
    prompt_injection_detected: 'Assisted processing cannot safely use instruction-like content',
    hazardous_input_detected: 'Potentially hazardous work requires deterministic safety or human guidance',
    sensitive_input_detected: 'Remove contact, identity, credential, or exact-location data before assisted processing',
  };
  fail(reason, messages[reason], 422, { context, deterministicFallbackAvailable: true });
}

function normalizedDecisionKey(key) {
  return key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function assertNoProhibitedDecision(value, path = 'output') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoProhibitedDecision(child, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, child]) => {
    if (PROHIBITED_DECISION_KEYS.has(normalizedDecisionKey(key))) {
      fail('prohibited_assistance_decision', 'Assistance output attempted a consequential decision', 422, {
        path: `${path}.${key}`,
      });
    }
    assertNoProhibitedDecision(child, `${path}.${key}`);
  });
}

function validateCaptureRequest(value) {
  rejectUnknown(value, [
    'schemaVersion',
    'typedText',
    'voiceAssetId',
    'photoAssetIds',
    'processingConsent',
    'consentPolicyVersion',
  ], 'assistance_request');
  if (value.schemaVersion !== ASSISTED_INTAKE_SCHEMA_VERSION) {
    fail('assistance_schema_unsupported', 'Assistance request schema is unsupported', 400);
  }
  if (value.processingConsent !== true) {
    fail('processing_consent_required', 'Explicit assisted-processing consent is required', 422, {
      deterministicFallbackAvailable: true,
    });
  }
  const consentPolicyVersion = stableId(value.consentPolicyVersion, 'consent_policy_version');
  const typedText = boundedText(value.typedText, 'typed_text', 4000, { optional: true });
  const voiceAssetId = value.voiceAssetId == null
    ? null
    : stableId(value.voiceAssetId, 'voice_asset_id');
  if (!Array.isArray(value.photoAssetIds) || value.photoAssetIds.length > 4) {
    fail('photo_asset_ids_invalid', 'photoAssetIds must be an array of at most four protected references');
  }
  const photoAssetIds = value.photoAssetIds.map((id) => stableId(id, 'photo_asset_id'));
  if (new Set(photoAssetIds).size !== photoAssetIds.length) {
    fail('photo_asset_ids_invalid', 'photoAssetIds cannot contain duplicates');
  }
  if (!typedText && !voiceAssetId && photoAssetIds.length === 0) {
    fail('assistance_input_required', 'At least one assisted input is required');
  }
  if (typedText) assertSafeText(typedText, 'typed_text');
  return Object.freeze({
    schemaVersion: ASSISTED_INTAKE_SCHEMA_VERSION,
    typedText,
    voiceAssetId,
    photoAssetIds: Object.freeze(photoAssetIds),
    processingConsent: true,
    consentPolicyVersion,
  });
}

function validateAssistanceEnvelope(value) {
  assertNoProhibitedDecision(value);
  rejectUnknown(value, ['schemaVersion', 'modelVersion', 'promptVersion', 'fields', 'suggestedQuestions'], 'assistance_output');
  if (value.schemaVersion !== ASSISTED_INTAKE_SCHEMA_VERSION) {
    fail('assistance_output_schema_unsupported', 'Assistance output schema is unsupported');
  }
  const modelVersion = stableId(value.modelVersion, 'model_version');
  const promptVersion = stableId(value.promptVersion, 'prompt_version');
  if (!Array.isArray(value.fields) || value.fields.length > FIELD_IDS.size) {
    fail('assistance_fields_invalid', 'Assistance output fields are not bounded');
  }
  const seen = new Set();
  const fields = value.fields.map((field, index) => {
    rejectUnknown(field, ['fieldId', 'value', 'confidence', 'sources', 'explanation'], `assistance_field_${index}`);
    if (!FIELD_IDS.has(field.fieldId) || seen.has(field.fieldId)) {
      fail('assistance_field_invalid', 'Assistance field is unsupported or duplicated');
    }
    seen.add(field.fieldId);
    const outputValue = boundedText(field.value, `field_${index}_value`, 1000);
    const explanation = boundedText(field.explanation, `field_${index}_explanation`, 320);
    assertSafeText(outputValue, `fields[${index}].value`);
    assertSafeText(explanation, `fields[${index}].explanation`);
    if (field.fieldId === 'pricing_mode_recommendation' && !PRICING_MODES.has(outputValue)) {
      fail('pricing_mode_recommendation_invalid', 'Pricing-mode recommendation is unsupported');
    }
    if (typeof field.confidence !== 'number' || field.confidence < 0 || field.confidence > 1) {
      fail('assistance_confidence_invalid', 'Assistance confidence must be between zero and one');
    }
    if (!Array.isArray(field.sources) || field.sources.length === 0 || field.sources.length > SOURCES.size) {
      fail('assistance_sources_invalid', 'Assistance field needs a bounded evidence-source list');
    }
    const sources = [...new Set(field.sources)];
    if (sources.some((source) => !SOURCES.has(source))) {
      fail('assistance_sources_invalid', 'Assistance field contains an unsupported evidence source');
    }
    return Object.freeze({
      fieldId: field.fieldId,
      value: outputValue,
      confidence: field.confidence,
      sources: Object.freeze(sources),
      explanation,
      status: 'needs_review',
      editedByUser: false,
    });
  });
  if (!Array.isArray(value.suggestedQuestions) || value.suggestedQuestions.length > 12) {
    fail('suggested_questions_invalid', 'Suggested questions must be a bounded array');
  }
  const questionIds = new Set();
  const suggestedQuestions = value.suggestedQuestions.map((question, index) => {
    rejectUnknown(question, ['id', 'question', 'reason'], `suggested_question_${index}`);
    const id = stableId(question.id, `suggested_question_${index}_id`);
    if (questionIds.has(id)) fail('suggested_questions_invalid', 'Suggested question identifiers must be unique');
    questionIds.add(id);
    const questionText = boundedText(question.question, `suggested_question_${index}`, 320);
    const reason = boundedText(question.reason, `suggested_question_${index}_reason`, 320);
    assertSafeText(questionText, `suggestedQuestions[${index}].question`);
    assertSafeText(reason, `suggestedQuestions[${index}].reason`);
    return Object.freeze({ id, question: questionText, reason });
  });
  if (fields.some((field) => field.confidence < 0.7) && suggestedQuestions.length === 0) {
    fail('clarifying_question_required', 'Uncertain assistance fields require a clarifying question');
  }
  return Object.freeze({
    schemaVersion: ASSISTED_INTAKE_SCHEMA_VERSION,
    modelVersion,
    promptVersion,
    fields: Object.freeze(fields),
    suggestedQuestions: Object.freeze(suggestedQuestions),
    readyForDeterministicBrief: false,
  });
}

function assertPrivacySafeProjection(value) {
  const serialized = JSON.stringify(value);
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(serialized))) {
    fail('privacy_projection_failed', 'Projection contained prohibited private data', 500);
  }
  const prohibitedKeys = /"(?:address|phone|chat|message|notes?|brief|latitude|longitude|coordinates?|workerName|customerName)"\s*:/i;
  if (prohibitedKeys.test(serialized)) {
    fail('privacy_projection_failed', 'Projection contained a prohibited private field', 500);
  }
  return value;
}

module.exports = {
  ASSISTED_INTAKE_SCHEMA_VERSION,
  RECOMMENDATION_SCHEMA_VERSION,
  LIVE_STATUS_SCHEMA_VERSION,
  IntelligenceContractError,
  FIELD_IDS,
  SOURCES,
  fail,
  isRecord,
  rejectUnknown,
  boundedText,
  stableId,
  isoInstant,
  findUnsafeText,
  assertSafeText,
  assertNoProhibitedDecision,
  assertPrivacySafeProjection,
  validateCaptureRequest,
  validateAssistanceEnvelope,
};
