export const ASSISTED_INTAKE_SCHEMA_VERSION = 1 as const;
export const LIVE_UPDATE_SCHEMA_VERSION = 1 as const;

export type AssistanceCapability = Readonly<{
  available: boolean;
  reasonCode: string;
}>;

export type AssistSource = 'typed_text' | 'voice_transcript' | 'work_photo' | 'service_catalogue';
export type AssistFieldId =
  | 'likely_service'
  | 'problem_description'
  | 'urgency'
  | 'materials_clues'
  | 'complexity'
  | 'pricing_mode_recommendation';

export type AssistedCaptureInput = Readonly<{
  typedText: string;
  voiceAssetId: string | null;
  photoAssetIds: readonly string[];
  processingConsent: boolean;
}>;

export type RawAssistedField = Readonly<{
  fieldId: AssistFieldId;
  value: string;
  confidence: number;
  sources: readonly AssistSource[];
  explanation: string;
}>;

export type RawAssistanceEnvelope = Readonly<{
  schemaVersion: 1;
  modelVersion: string;
  promptVersion: string;
  fields: readonly RawAssistedField[];
  suggestedQuestions: readonly Readonly<{
    id: string;
    question: string;
    reason: string;
  }>[];
}>;

export type EditableAssistedField = RawAssistedField & Readonly<{
  status: 'needs_review' | 'confirmed';
  editedByUser: boolean;
}>;

export type EditableAssistance = Readonly<{
  schemaVersion: 1;
  modelVersion: string;
  promptVersion: string;
  fields: readonly EditableAssistedField[];
  suggestedQuestions: RawAssistanceEnvelope['suggestedQuestions'];
  readyForDeterministicBrief: boolean;
}>;

const FIELD_IDS = new Set<AssistFieldId>([
  'likely_service',
  'problem_description',
  'urgency',
  'materials_clues',
  'complexity',
  'pricing_mode_recommendation',
]);
const SOURCES = new Set<AssistSource>([
  'typed_text',
  'voice_transcript',
  'work_photo',
  'service_catalogue',
]);
const PROHIBITED_OUTPUT_KEYS = new Set([
  'workerId',
  'selectedWorkerId',
  'finalPriceMinor',
  'charge',
  'paymentDecision',
  'verified',
  'verificationDecision',
  'safetyResponse',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, name: string, maxLength = 1000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} must be non-empty text no longer than ${maxLength} characters`);
  }
  return value.trim();
}

function stableId(value: unknown, name: string): string {
  const id = boundedText(value, name, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw new TypeError(`${name} must be a stable identifier`);
  }
  return id;
}

function assertNoProhibitedDecision(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoProhibitedDecision);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_OUTPUT_KEYS.has(key)) {
      throw new TypeError(`Assistance output cannot make the prohibited '${key}' decision`);
    }
    assertNoProhibitedDecision(child);
  }
}

export function evaluateAssistedCapture(
  input: AssistedCaptureInput,
  capability: AssistanceCapability,
): Readonly<{ allowed: boolean; reasonCode: string }> {
  if (!capability.available) return Object.freeze({ allowed: false, reasonCode: capability.reasonCode });
  const hasMedia = Boolean(input.voiceAssetId || input.photoAssetIds.length > 0);
  if (input.processingConsent !== true) {
    return Object.freeze({
      allowed: false,
      reasonCode: hasMedia ? 'media_processing_consent_required' : 'assisted_processing_consent_required',
    });
  }
  if (!input.typedText.trim() && !hasMedia) {
    return Object.freeze({ allowed: false, reasonCode: 'assistance_input_required' });
  }
  return Object.freeze({ allowed: true, reasonCode: 'assistance_available' });
}

export function validateAssistanceEnvelope(value: unknown): RawAssistanceEnvelope {
  assertNoProhibitedDecision(value);
  if (!isRecord(value) || value.schemaVersion !== ASSISTED_INTAKE_SCHEMA_VERSION) {
    throw new TypeError('Assistance output has an unsupported schema version');
  }
  const modelVersion = stableId(value.modelVersion, 'modelVersion');
  const promptVersion = stableId(value.promptVersion, 'promptVersion');
  if (!Array.isArray(value.fields) || value.fields.length > FIELD_IDS.size) {
    throw new TypeError('Assistance fields must be a bounded array');
  }
  const seen = new Set<AssistFieldId>();
  const fields = value.fields.map((entry, index): RawAssistedField => {
    if (!isRecord(entry) || !FIELD_IDS.has(entry.fieldId as AssistFieldId)) {
      throw new TypeError(`fields[${index}].fieldId is unsupported`);
    }
    const fieldId = entry.fieldId as AssistFieldId;
    if (seen.has(fieldId)) throw new TypeError(`Assistance field '${fieldId}' is duplicated`);
    seen.add(fieldId);
    if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
      throw new TypeError(`fields[${index}].confidence must be between zero and one`);
    }
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      throw new TypeError(`fields[${index}].sources must explain the evidence basis`);
    }
    const sources = entry.sources.map((source) => {
      if (!SOURCES.has(source as AssistSource)) throw new TypeError(`Unsupported assistance source '${String(source)}'`);
      return source as AssistSource;
    });
    return Object.freeze({
      fieldId,
      value: boundedText(entry.value, `fields[${index}].value`),
      confidence: entry.confidence,
      sources: Object.freeze([...new Set(sources)]),
      explanation: boundedText(entry.explanation, `fields[${index}].explanation`, 320),
    });
  });
  if (!Array.isArray(value.suggestedQuestions) || value.suggestedQuestions.length > 12) {
    throw new TypeError('suggestedQuestions must be a bounded array');
  }
  const suggestedQuestions = value.suggestedQuestions.map((entry, index) => {
    if (!isRecord(entry)) throw new TypeError(`suggestedQuestions[${index}] is invalid`);
    return Object.freeze({
      id: stableId(entry.id, `suggestedQuestions[${index}].id`),
      question: boundedText(entry.question, `suggestedQuestions[${index}].question`, 320),
      reason: boundedText(entry.reason, `suggestedQuestions[${index}].reason`, 320),
    });
  });
  return Object.freeze({
    schemaVersion: ASSISTED_INTAKE_SCHEMA_VERSION,
    modelVersion,
    promptVersion,
    fields: Object.freeze(fields),
    suggestedQuestions: Object.freeze(suggestedQuestions),
  });
}

function assistanceReady(fields: readonly EditableAssistedField[]): boolean {
  return fields.length > 0 && fields.every((field) => field.status === 'confirmed');
}

export function createEditableAssistance(envelope: RawAssistanceEnvelope): EditableAssistance {
  const validated = validateAssistanceEnvelope(envelope);
  const fields = validated.fields.map((field) => Object.freeze({
    ...field,
    status: 'needs_review' as const,
    editedByUser: false,
  }));
  return Object.freeze({
    ...validated,
    fields: Object.freeze(fields),
    readyForDeterministicBrief: assistanceReady(fields),
  });
}

export function reviewAssistedField(
  assistance: EditableAssistance,
  fieldId: AssistFieldId,
  value: string,
): EditableAssistance {
  let found = false;
  const fields = assistance.fields.map((field) => {
    if (field.fieldId !== fieldId) return field;
    found = true;
    const nextValue = boundedText(value, fieldId);
    return Object.freeze({
      ...field,
      value: nextValue,
      status: 'confirmed' as const,
      editedByUser: nextValue !== field.value || field.editedByUser,
    });
  });
  if (!found) throw new TypeError(`Unknown assisted field '${fieldId}'`);
  return Object.freeze({
    ...assistance,
    fields: Object.freeze(fields),
    readyForDeterministicBrief: assistanceReady(fields),
  });
}

export function confirmedAssistanceToNeedText(
  assistance: EditableAssistance,
  maxLength = 4_000,
): string | null {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new TypeError('maxLength must be a positive integer');
  if (!assistance.readyForDeterministicBrief
      || assistance.fields.length === 0
      || assistance.fields.some((field) => field.status !== 'confirmed')) return null;
  const description = assistance.fields.find((field) => field.fieldId === 'problem_description');
  const ordered = description
    ? [description, ...assistance.fields.filter((field) => field.fieldId !== 'problem_description')]
    : assistance.fields;
  const summary = ordered.map((field, index) => index === 0 && field.fieldId === 'problem_description'
    ? field.value.trim()
    : `${field.fieldId.replaceAll('_', ' ')}: ${field.value.trim()}`).join('\n');
  return summary ? summary.slice(0, maxLength) : null;
}

export type MatchReasonCode =
  | 'credential_fit'
  | 'verified_availability'
  | 'service_area_fit'
  | 'reliability_evidence'
  | 'price_compatibility'
  | 'past_customer_relationship';

const MATCH_REASON_CODES = new Set<MatchReasonCode>([
  'credential_fit',
  'verified_availability',
  'service_area_fit',
  'reliability_evidence',
  'price_compatibility',
  'past_customer_relationship',
]);

export function createExplainableRecommendation(input: Readonly<{
  workerId: string;
  rankingVersion: string;
  reasons: readonly Readonly<{ code: MatchReasonCode; fact: string }>[];
  sponsored: boolean;
}>): Readonly<{
  workerId: string;
  rankingVersion: string;
  reasons: readonly Readonly<{ code: MatchReasonCode; fact: string }>[];
  placementLabel: 'Sponsored' | null;
}> {
  const reasons = input.reasons.map((reason) => {
    if (!MATCH_REASON_CODES.has(reason.code)) throw new TypeError(`Unsupported match reason '${reason.code}'`);
    return Object.freeze({ code: reason.code, fact: boundedText(reason.fact, 'reason.fact', 240) });
  });
  if (reasons.length === 0) throw new TypeError('A recommendation needs at least one factual reason');
  return Object.freeze({
    workerId: stableId(input.workerId, 'workerId'),
    rankingVersion: stableId(input.rankingVersion, 'rankingVersion'),
    reasons: Object.freeze(reasons),
    placementLabel: input.sponsored ? 'Sponsored' : null,
  });
}

export type LiveProjectPhase = 'accepted' | 'en_route' | 'arrived' | 'work_active' | 'completion_review' | 'payment_pending';

export function createPrivacySafeLiveUpdate(input: Readonly<{
  projectId: string;
  revision: number;
  phase: LiveProjectPhase;
  serviceLabel: string;
  statusLabel: string;
  actionLabel: string | null;
  updatedAt: string;
}>): Readonly<{
  schemaVersion: 1;
  projectId: string;
  revision: number;
  phase: LiveProjectPhase;
  title: string;
  status: string;
  actionLabel: string | null;
  updatedAt: string;
}> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new TypeError('revision is invalid');
  if (!Number.isFinite(Date.parse(input.updatedAt))) throw new TypeError('updatedAt must be an ISO instant');
  return Object.freeze({
    schemaVersion: LIVE_UPDATE_SCHEMA_VERSION,
    projectId: stableId(input.projectId, 'projectId'),
    revision: input.revision,
    phase: input.phase,
    title: boundedText(input.serviceLabel, 'serviceLabel', 80),
    status: boundedText(input.statusLabel, 'statusLabel', 120),
    actionLabel: input.actionLabel === null ? null : boundedText(input.actionLabel, 'actionLabel', 80),
    updatedAt: new Date(input.updatedAt).toISOString(),
  });
}

export type SafetyEducationTrigger = 'worker_goes_online' | 'customer_worker_en_route' | 'first_project_hub' | 'first_start_pin';

export function shouldShowSafetyEducation(input: Readonly<{
  trigger: SafetyEducationTrigger;
  now: string;
  shownAt: readonly string[];
  maxLifetimeShows?: number;
  cooldownDays?: number;
}>): boolean {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be an ISO instant');
  const max = input.maxLifetimeShows ?? 3;
  const cooldownMs = (input.cooldownDays ?? 14) * 24 * 60 * 60 * 1000;
  if (input.shownAt.length >= max) return false;
  const latest = input.shownAt.map(Date.parse).filter(Number.isFinite).sort((a, b) => b - a)[0];
  return latest === undefined || nowMs - latest >= cooldownMs;
}
