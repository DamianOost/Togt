import type { AxiosError, AxiosRequestConfig } from 'axios';
import api from './api';
import { adaptRecurringPendingRequestsV1 } from '../data/grounded/recurrence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEMA = 'togt.trust.v1' as const;

type JsonRecord = Record<string, unknown>;

export type TrustConnectionState = 'online' | 'offline';
export type TrustRole = 'customer' | 'worker';
export type IncidentKind = 'safety' | 'support';
export type IncidentCategory =
  | 'immediate_danger'
  | 'injury'
  | 'harassment'
  | 'unsafe_work'
  | 'property_damage'
  | 'payment_or_work'
  | 'account_help'
  | 'other';
export type IncidentState = 'received' | 'acknowledged' | 'escalated' | 'resolved' | 'failed';
export type FavouriteStatus = 'active' | 'removed' | 'blocked';
export type BlockReasonCode =
  | 'safety_concern'
  | 'harassment'
  | 'inappropriate_contact'
  | 'work_dispute'
  | 'do_not_match'
  | 'other';
export type RebookDraftStatus = 'draft' | 'blocked' | 'abandoned';
export type SubstitutionPolicy = 'no_substitution' | 'explicit_approval_each_time';
export type RecurringSeriesStatus =
  | 'awaiting_acceptance'
  | 'terms_change_pending'
  | 'active'
  | 'paused'
  | 'resume_requested'
  | 'cancellation_requested'
  | 'cancelled'
  | 'blocked';
export type RecurringOccurrenceStatus =
  | 'proposed'
  | 'planned'
  | 'held'
  | 'change_pending'
  | 'cancelled'
  | 'completed'
  | 'superseded';

export type GroundedTrustProblem = Readonly<{
  status: number | null;
  type: string;
  title: string;
  detail: string;
  correlationId: string | null;
  retryable: boolean;
}>;

export class GroundedTrustError extends Error {
  readonly problem: GroundedTrustProblem;

  constructor(problem: GroundedTrustProblem) {
    super(problem.title);
    this.name = 'GroundedTrustError';
    this.problem = problem;
  }
}

export type EmergencyFallbackOption = Readonly<{
  kind: 'national_mobile_emergency' | 'police_emergency';
  number: '112' | '10111';
  label: string;
  authorityUrl: string;
}>;

export type IncidentDto = Readonly<{
  schema: typeof SCHEMA;
  id: string;
  kind: IncidentKind;
  category: IncidentCategory;
  state: IncidentState;
  revision: number;
  bookingReference?: string;
  summary?: string;
  channel: Readonly<{
    accepted: 'in_app_record';
    supportLevel: 'record_only';
    operationsAlerted: false;
    humanAcknowledgementExpected: false;
    emergencyServicesDispatched: false;
  }>;
  stateMachine: Readonly<{
    canonical: readonly IncidentState[];
    operatedTransitionsAvailable: false;
    reasonCode: 'operations_acknowledgement_not_staffed';
  }>;
  emergencyFallback: Readonly<{
    available: true;
    mode: 'device_dialer';
    instruction: string;
    togtDispatch: false;
    togtAcknowledgement: false;
    options: readonly EmergencyFallbackOption[];
  }>;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  escalatedAt?: string;
  resolvedAt?: string;
  failedAt?: string;
}>;

export type RelationshipEligibilityDto = Readonly<{
  schema: typeof SCHEMA;
  projectReference: string;
  relationshipEligible: boolean;
  reasonCode: 'requirements_not_met' | null;
  policy: Readonly<{
    failClosed: true;
    requiresConfirmedCompletion: true;
    requiresReconciledPaidPayment: true;
    requiresNoOpenIssueOrBlock: true;
  }>;
  actions: Readonly<{
    favourite: boolean;
    rebookDraft: boolean;
    createRecurringSeries: boolean;
    block: true;
  }>;
  recurrence: Readonly<{
    configuredForService: boolean;
    automaticBookingCreation: false;
  }>;
}>;

export type GroundedSafeShareDto = Readonly<{
  bookingDetailsShare: Readonly<{
    available: true;
    mode: 'non_live_no_address';
  }>;
  preview: Readonly<Record<string, unknown>>;
  shareText: string;
  liveTracking: false;
  publicLink: null;
}>;

export type FavouriteDto = Readonly<{
  schema: typeof SCHEMA;
  id: string;
  worker: Readonly<{ id: string; displayName: string; avatarUrl?: string }>;
  sourceProjectReference: string;
  status: FavouriteStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type BlockDto = Readonly<{
  schema: typeof SCHEMA;
  id: string;
  counterpartReference: string;
  sourceProjectReference: string;
  status: 'active';
  revision: number;
  effects: Readonly<{
    futureMatchingAllowed: false;
    newContactAllowed: false;
    recurringRelationshipAllowed: false;
  }>;
  createdAt: string;
}>;

export type RebookDraftDto = Readonly<{
  schema: typeof SCHEMA;
  id: string;
  revision: number;
  status: RebookDraftStatus;
  sourceProjectReference: string;
  preferredWorker: Readonly<{ id: string; displayName: string }>;
  service: Readonly<{ label: string }>;
  editableScope: Readonly<Record<string, unknown>>;
  broadAreaLabel?: string;
  requestedStartsAt?: string;
  confirmationsRequired: Readonly<{
    currentPrice: true;
    location: true;
    schedule: true;
    workerAvailability: true;
  }>;
  substitution: Readonly<{
    policy: 'none';
    alternativeRequiresExplicitSelection: true;
  }>;
  submission: Readonly<{
    submitted: false;
    bookingCreated: false;
    supportedByThisEndpoint: false;
  }>;
  createdAt: string;
  updatedAt: string;
}>;

export type RecurringSchedule = Readonly<{
  timezone: 'Africa/Johannesburg';
  occurrences: readonly string[];
}>;

export type RecurringTermsDto = Readonly<{
  revision: number;
  service: Readonly<{
    id: string;
    version: number;
    label: string;
    pricingMode: string | null;
    fulfilmentMode: string | null;
    recurrenceEligible: true;
  }>;
  schedule: RecurringSchedule;
  commercial: Readonly<{
    schemaVersion: 1;
    agreement: 'same_terms_snapshot';
    pricingMode: string | null;
    customerTotalAmount: string | null;
    currency: string;
    bookingCreationRequiresReconfirmation: true;
    rateChangesRequireNewMutualTerms: true;
  }>;
  substitutionPolicy: SubstitutionPolicy;
  cancellationPolicyVersion: string;
  proposedByRole: TrustRole;
  createdAt: string;
}>;

export type RecurringOccurrenceDto = Readonly<{
  id: string;
  sequence: number;
  termsRevision: number;
  scheduledAt: string;
  status: RecurringOccurrenceStatus;
  bookingReference?: string;
}>;

export type RecurringOccurrenceChangeDto = Readonly<{
  id: string;
  occurrenceReference: string;
  kind: 'reschedule' | 'cancel';
  proposedScheduledAt?: string;
  status: 'pending';
  requestedByRole: TrustRole;
  decidedByRole?: TrustRole;
  requestedAt: string;
  decidedAt?: string;
}>;

export type RecurringSeriesDto = Readonly<{
  schema: typeof SCHEMA;
  id: string;
  revision: number;
  status: RecurringSeriesStatus;
  sourceProjectReference: string;
  participants: Readonly<{
    customer: Readonly<{ id: string }>;
    worker: Readonly<{ id: string; displayName: string }>;
  }>;
  currentTerms?: RecurringTermsDto;
  proposedTerms?: RecurringTermsDto;
  acceptances: readonly Readonly<{
    participantRole: TrustRole;
    termsRevision: number;
    acceptedAt: string;
  }>[];
  occurrences: readonly RecurringOccurrenceDto[];
  pendingOccurrenceChanges: readonly RecurringOccurrenceChangeDto[];
  pendingRequests: Readonly<{
    resumeRequestedByRole: TrustRole | null;
    cancellationRequestedByRole: TrustRole | null;
  }>;
  controls: Readonly<{
    occurrenceAndWholeSeriesAreDistinct: true;
    bookingCreationIsAutomatic: false;
    eachOccurrenceRequiresBookingConfirmation: true;
    substitutionIsAutomatic: false;
    mutualAcceptanceRequired: true;
  }>;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  cancelledAt?: string;
}>;

export type RecurringSeriesAction =
  | Readonly<{ action: 'accept_terms' | 'pause' | 'request_resume' | 'accept_resume' | 'request_cancel_series' | 'accept_cancel_series' }>
  | Readonly<{ action: 'propose_terms'; schedule: RecurringSchedule; substitutionPolicy: SubstitutionPolicy }>
  | Readonly<{
      action: 'request_occurrence_change';
      occurrenceId: string;
      changeKind: 'reschedule' | 'cancel';
      proposedScheduledAt?: string;
    }>
  | Readonly<{ action: 'accept_occurrence_change' | 'decline_occurrence_change'; changeRequestId: string }>;

export type TrustEvidenceFactDto = Readonly<{
  id: string;
  label: string;
  valueLabel: string;
  explanation: string;
  sourceLabel: string;
  sampleSize: number | null;
  observedAt: string;
}>;

export type TrustFairnessDto = Readonly<{
  title: string;
  summary: string;
  evidence: readonly TrustEvidenceFactDto[];
  restriction: Readonly<{
    status: 'none' | 'active' | 'under_review' | 'lifted';
    reasonCode: string | null;
    reasonLabel: string;
    evidence: readonly TrustEvidenceFactDto[];
    recoverySteps: readonly string[];
    humanReview:
      | Readonly<{ available: true; channel: 'in_app_record'; actionLabel: string }>
      | Readonly<{ available: false; reasonCode: string }>;
  }>;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contractError(detail: string): GroundedTrustError {
  return new GroundedTrustError(Object.freeze({
    status: null,
    type: 'trust_contract_invalid',
    title: 'Trust information could not be verified',
    detail,
    correlationId: null,
    retryable: true,
  }));
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw contractError(`${label} was not a supported object.`);
  return value;
}

function text(value: unknown, label: string, maxLength = 2_000): string {
  if (typeof value !== 'string') throw contractError(`${label} was missing.`);
  const candidate = value.trim();
  if (candidate.length < 1 || candidate.length > maxLength || candidate.includes('\u0000')) {
    throw contractError(`${label} was invalid.`);
  }
  return candidate;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return text(value, label);
}

function uuid(value: unknown, label: string): string {
  const candidate = text(value, label, 64);
  if (!UUID.test(candidate)) throw contractError(`${label} was not a supported identifier.`);
  return candidate.toLowerCase();
}

function positiveInteger(value: unknown, label: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (allowZero ? Number(value) < 0 : Number(value) < 1)) {
    throw contractError(`${label} was invalid.`);
  }
  return Number(value);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw contractError(`${label} was invalid.`);
  return value;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw contractError(`${label} must remain enabled by the server contract.`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw contractError(`${label} must remain disabled by the server contract.`);
  return false;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw contractError(`${label} was outside the supported state machine.`);
  }
  return value as T;
}

function timestamp(value: unknown, label: string): string {
  const candidate = text(value, label, 64);
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) throw contractError(`${label} was not a supported timestamp.`);
  return new Date(parsed).toISOString();
}

function optionalTimestamp(source: JsonRecord, key: string): string | undefined {
  const value = source[key];
  return value === undefined ? undefined : timestamp(value, key);
}

function adaptTrustEvidenceFact(value: unknown): TrustEvidenceFactDto {
  const source = record(value, 'trust evidence fact');
  const rawSampleSize = source.sampleSize;
  return Object.freeze({
    id: text(source.id, 'trust evidence id', 80),
    label: text(source.label, 'trust evidence label', 160),
    valueLabel: text(source.valueLabel, 'trust evidence value', 160),
    explanation: text(source.explanation, 'trust evidence explanation', 1_000),
    sourceLabel: text(source.sourceLabel, 'trust evidence source', 240),
    sampleSize: rawSampleSize === null
      ? null
      : positiveInteger(rawSampleSize, 'trust evidence sample size', true),
    observedAt: timestamp(source.observedAt, 'trust evidence observation time'),
  });
}

function adaptTrustFairness(value: unknown): TrustFairnessDto {
  const source = record(value, 'trust fairness');
  if (!Array.isArray(source.evidence)) throw contractError('Trust evidence was not a list.');
  const restriction = record(source.restriction, 'trust restriction');
  if (!Array.isArray(restriction.evidence) || !Array.isArray(restriction.recoverySteps)) {
    throw contractError('Trust restriction evidence or recovery steps were unavailable.');
  }
  const humanReview = record(restriction.humanReview, 'human review capability');
  const available = boolean(humanReview.available, 'human review availability');
  const review = available
    ? Object.freeze({
        available: true as const,
        channel: oneOf(humanReview.channel, ['in_app_record'] as const, 'human review channel'),
        actionLabel: text(humanReview.actionLabel, 'human review action', 160),
      })
    : Object.freeze({
        available: false as const,
        reasonCode: text(humanReview.reasonCode, 'human review reason', 160),
      });
  return Object.freeze({
    title: text(source.title, 'trust fairness title', 160),
    summary: text(source.summary, 'trust fairness summary', 1_000),
    evidence: Object.freeze(source.evidence.map(adaptTrustEvidenceFact)),
    restriction: Object.freeze({
      status: oneOf(restriction.status, ['none', 'active', 'under_review', 'lifted'] as const, 'trust restriction status'),
      reasonCode: nullableText(restriction.reasonCode, 'trust restriction reason code'),
      reasonLabel: text(restriction.reasonLabel, 'trust restriction reason', 1_000),
      evidence: Object.freeze(restriction.evidence.map(adaptTrustEvidenceFact)),
      recoverySteps: Object.freeze(restriction.recoverySteps.map((step) => text(step, 'trust recovery step', 500))),
      humanReview: review,
    }),
  });
}

function requireSchema(source: JsonRecord): void {
  if (source.schema !== SCHEMA) throw contractError('The trust schema did not match this app version.');
}

function parseEmergencyFallback(value: unknown): IncidentDto['emergencyFallback'] {
  const source = record(value, 'emergency fallback');
  literalTrue(source.available, 'emergency fallback availability');
  oneOf(source.mode, ['device_dialer'] as const, 'emergency fallback mode');
  literalFalse(source.togtDispatch, 'TOGT emergency dispatch');
  literalFalse(source.togtAcknowledgement, 'TOGT emergency acknowledgement');
  if (!Array.isArray(source.options)) throw contractError('Emergency dialler options were unavailable.');
  const options = source.options.map((entry): EmergencyFallbackOption => {
    const option = record(entry, 'emergency dialler option');
    const number = oneOf(option.number, ['112', '10111'] as const, 'emergency number');
    const expectedKind = number === '112' ? 'national_mobile_emergency' : 'police_emergency';
    if (option.kind !== expectedKind) throw contractError('An emergency dialler option did not match its authority.');
    return Object.freeze({
      kind: expectedKind,
      number,
      label: text(option.label, 'emergency option label', 160),
      authorityUrl: text(option.authorityUrl, 'emergency authority URL', 500),
    });
  });
  if (!options.some((option) => option.number === '112') || !options.some((option) => option.number === '10111')) {
    throw contractError('Both South African emergency dialler fallbacks are required.');
  }
  return Object.freeze({
    available: true,
    mode: 'device_dialer',
    instruction: text(source.instruction, 'emergency instruction', 500),
    togtDispatch: false,
    togtAcknowledgement: false,
    options: Object.freeze(options),
  });
}

export function adaptIncidentDto(value: unknown): IncidentDto {
  const source = record(value, 'incident');
  requireSchema(source);
  const channel = record(source.channel, 'incident channel');
  const stateMachine = record(source.stateMachine, 'incident state machine');
  if (!Array.isArray(stateMachine.canonical)) throw contractError('Incident states were unavailable.');
  const canonical = stateMachine.canonical.map((state) => oneOf(
    state,
    ['received', 'acknowledged', 'escalated', 'resolved', 'failed'] as const,
    'incident canonical state',
  ));
  const bookingReference = source.bookingReference === undefined ? undefined : uuid(source.bookingReference, 'booking reference');
  const summary = source.summary === undefined ? undefined : text(source.summary, 'incident summary', 5_000);
  const acknowledgedAt = optionalTimestamp(source, 'acknowledgedAt');
  const escalatedAt = optionalTimestamp(source, 'escalatedAt');
  const resolvedAt = optionalTimestamp(source, 'resolvedAt');
  const failedAt = optionalTimestamp(source, 'failedAt');
  return Object.freeze({
    schema: SCHEMA,
    id: uuid(source.id, 'incident id'),
    kind: oneOf(source.kind, ['safety', 'support'] as const, 'incident kind'),
    category: oneOf(source.category, [
      'immediate_danger', 'injury', 'harassment', 'unsafe_work', 'property_damage',
      'payment_or_work', 'account_help', 'other',
    ] as const, 'incident category'),
    state: oneOf(source.state, ['received', 'acknowledged', 'escalated', 'resolved', 'failed'] as const, 'incident state'),
    revision: positiveInteger(source.revision, 'incident revision'),
    ...(bookingReference ? { bookingReference } : {}),
    ...(summary ? { summary } : {}),
    channel: Object.freeze({
      accepted: oneOf(channel.accepted, ['in_app_record'] as const, 'incident intake channel'),
      supportLevel: oneOf(channel.supportLevel, ['record_only'] as const, 'incident support level'),
      operationsAlerted: literalFalse(channel.operationsAlerted, 'operations alert'),
      humanAcknowledgementExpected: literalFalse(channel.humanAcknowledgementExpected, 'human acknowledgement expectation'),
      emergencyServicesDispatched: literalFalse(channel.emergencyServicesDispatched, 'emergency dispatch'),
    }),
    stateMachine: Object.freeze({
      canonical: Object.freeze(canonical),
      operatedTransitionsAvailable: literalFalse(stateMachine.operatedTransitionsAvailable, 'operated incident transitions'),
      reasonCode: oneOf(
        stateMachine.reasonCode,
        ['operations_acknowledgement_not_staffed'] as const,
        'incident operations reason',
      ),
    }),
    emergencyFallback: parseEmergencyFallback(source.emergencyFallback),
    createdAt: timestamp(source.createdAt, 'incident creation time'),
    updatedAt: timestamp(source.updatedAt, 'incident update time'),
    ...(acknowledgedAt ? { acknowledgedAt } : {}),
    ...(escalatedAt ? { escalatedAt } : {}),
    ...(resolvedAt ? { resolvedAt } : {}),
    ...(failedAt ? { failedAt } : {}),
  });
}

export function adaptRelationshipEligibilityDto(value: unknown): RelationshipEligibilityDto {
  const source = record(value, 'relationship eligibility');
  requireSchema(source);
  const policy = record(source.policy, 'relationship policy');
  const actions = record(source.actions, 'relationship actions');
  const recurrence = record(source.recurrence, 'relationship recurrence');
  const eligible = boolean(source.relationshipEligible, 'relationship eligibility');
  const reasonCode = source.reasonCode === null
    ? null
    : oneOf(source.reasonCode, ['requirements_not_met'] as const, 'relationship reason');
  if (eligible === (reasonCode !== null)) throw contractError('Relationship eligibility and reason were inconsistent.');
  const favourite = boolean(actions.favourite, 'favourite action');
  const rebookDraft = boolean(actions.rebookDraft, 'rebook action');
  const createRecurringSeries = boolean(actions.createRecurringSeries, 'recurring action');
  if (!eligible && (favourite || rebookDraft || createRecurringSeries)) {
    throw contractError('Relationship actions were enabled without server eligibility.');
  }
  return Object.freeze({
    schema: SCHEMA,
    projectReference: uuid(source.projectReference, 'project reference'),
    relationshipEligible: eligible,
    reasonCode,
    policy: Object.freeze({
      failClosed: literalTrue(policy.failClosed, 'fail-closed relationship policy'),
      requiresConfirmedCompletion: literalTrue(policy.requiresConfirmedCompletion, 'completion requirement'),
      requiresReconciledPaidPayment: literalTrue(policy.requiresReconciledPaidPayment, 'payment requirement'),
      requiresNoOpenIssueOrBlock: literalTrue(policy.requiresNoOpenIssueOrBlock, 'open issue requirement'),
    }),
    actions: Object.freeze({
      favourite,
      rebookDraft,
      createRecurringSeries,
      block: literalTrue(actions.block, 'block action'),
    }),
    recurrence: Object.freeze({
      configuredForService: boolean(recurrence.configuredForService, 'service recurrence capability'),
      automaticBookingCreation: literalFalse(recurrence.automaticBookingCreation, 'automatic recurring booking creation'),
    }),
  });
}

export function adaptFavouriteDto(value: unknown): FavouriteDto {
  const source = record(value, 'favourite');
  requireSchema(source);
  const worker = record(source.worker, 'favourite worker');
  const avatarUrl = worker.avatarUrl === undefined ? undefined : text(worker.avatarUrl, 'worker avatar URL', 1_000);
  return Object.freeze({
    schema: SCHEMA,
    id: uuid(source.id, 'favourite id'),
    worker: Object.freeze({
      id: uuid(worker.id, 'worker id'),
      displayName: text(worker.displayName, 'worker display name', 160),
      ...(avatarUrl ? { avatarUrl } : {}),
    }),
    sourceProjectReference: uuid(source.sourceProjectReference, 'source project reference'),
    status: oneOf(source.status, ['active', 'removed', 'blocked'] as const, 'favourite status'),
    revision: positiveInteger(source.revision, 'favourite revision'),
    createdAt: timestamp(source.createdAt, 'favourite creation time'),
    updatedAt: timestamp(source.updatedAt, 'favourite update time'),
  });
}

export function adaptBlockDto(value: unknown): BlockDto {
  const source = record(value, 'block');
  requireSchema(source);
  const effects = record(source.effects, 'block effects');
  return Object.freeze({
    schema: SCHEMA,
    id: uuid(source.id, 'block id'),
    counterpartReference: uuid(source.counterpartReference, 'blocked participant reference'),
    sourceProjectReference: uuid(source.sourceProjectReference, 'source project reference'),
    status: oneOf(source.status, ['active'] as const, 'block status'),
    revision: positiveInteger(source.revision, 'block revision'),
    effects: Object.freeze({
      futureMatchingAllowed: literalFalse(effects.futureMatchingAllowed, 'future matching'),
      newContactAllowed: literalFalse(effects.newContactAllowed, 'new contact'),
      recurringRelationshipAllowed: literalFalse(effects.recurringRelationshipAllowed, 'recurring relationship'),
    }),
    createdAt: timestamp(source.createdAt, 'block creation time'),
  });
}

export function adaptRebookDraftDto(value: unknown): RebookDraftDto {
  const source = record(value, 'rebook draft');
  requireSchema(source);
  const worker = record(source.preferredWorker, 'preferred worker');
  const service = record(source.service, 'rebook service');
  const confirmations = record(source.confirmationsRequired, 'rebook confirmations');
  const substitution = record(source.substitution, 'rebook substitution');
  const submission = record(source.submission, 'rebook submission');
  const broadAreaLabel = source.broadAreaLabel === undefined ? undefined : text(source.broadAreaLabel, 'broad area', 240);
  const requestedStartsAt = source.requestedStartsAt === undefined ? undefined : timestamp(source.requestedStartsAt, 'requested start time');
  return Object.freeze({
    schema: SCHEMA,
    id: uuid(source.id, 'rebook draft id'),
    revision: positiveInteger(source.revision, 'rebook draft revision'),
    status: oneOf(source.status, ['draft', 'blocked', 'abandoned'] as const, 'rebook draft status'),
    sourceProjectReference: uuid(source.sourceProjectReference, 'source project reference'),
    preferredWorker: Object.freeze({
      id: uuid(worker.id, 'preferred worker id'),
      displayName: text(worker.displayName, 'preferred worker name', 160),
    }),
    service: Object.freeze({ label: text(service.label, 'service label', 240) }),
    editableScope: Object.freeze({ ...record(source.editableScope, 'editable scope') }),
    ...(broadAreaLabel ? { broadAreaLabel } : {}),
    ...(requestedStartsAt ? { requestedStartsAt } : {}),
    confirmationsRequired: Object.freeze({
      currentPrice: literalTrue(confirmations.currentPrice, 'current price confirmation'),
      location: literalTrue(confirmations.location, 'location confirmation'),
      schedule: literalTrue(confirmations.schedule, 'schedule confirmation'),
      workerAvailability: literalTrue(confirmations.workerAvailability, 'worker availability confirmation'),
    }),
    substitution: Object.freeze({
      policy: oneOf(substitution.policy, ['none'] as const, 'rebook substitution policy'),
      alternativeRequiresExplicitSelection: literalTrue(
        substitution.alternativeRequiresExplicitSelection,
        'alternative worker selection',
      ),
    }),
    submission: Object.freeze({
      submitted: literalFalse(submission.submitted, 'rebook submission'),
      bookingCreated: literalFalse(submission.bookingCreated, 'rebook booking creation'),
      supportedByThisEndpoint: literalFalse(submission.supportedByThisEndpoint, 'rebook endpoint submission support'),
    }),
    createdAt: timestamp(source.createdAt, 'rebook draft creation time'),
    updatedAt: timestamp(source.updatedAt, 'rebook draft update time'),
  });
}

function adaptSchedule(value: unknown): RecurringSchedule {
  const source = record(value, 'recurring schedule');
  const timezone = oneOf(source.timezone, ['Africa/Johannesburg'] as const, 'recurring timezone');
  if (!Array.isArray(source.occurrences) || source.occurrences.length < 2 || source.occurrences.length > 104) {
    throw contractError('A recurring schedule needs 2 to 104 occurrences.');
  }
  const occurrences = source.occurrences.map((entry, index) => timestamp(entry, `occurrence ${index + 1}`));
  if (occurrences.some((entry, index) => index > 0 && entry <= (occurrences[index - 1] ?? ''))) {
    throw contractError('Recurring occurrences were not in chronological order.');
  }
  return Object.freeze({ timezone, occurrences: Object.freeze(occurrences) });
}

function adaptTerms(value: unknown): RecurringTermsDto {
  const source = record(value, 'recurring terms');
  const service = record(source.service, 'recurring service');
  const commercial = record(source.commercial, 'recurring commercial terms');
  const pricingMode = nullableText(service.pricingMode, 'service pricing mode');
  const fulfilmentMode = nullableText(service.fulfilmentMode, 'service fulfilment mode');
  const commercialPricingMode = nullableText(commercial.pricingMode, 'commercial pricing mode');
  const amount = nullableText(commercial.customerTotalAmount, 'customer total amount');
  if (commercial.schemaVersion !== 1) throw contractError('Commercial schema version was unsupported.');
  return Object.freeze({
    revision: positiveInteger(source.revision, 'terms revision'),
    service: Object.freeze({
      id: uuid(service.id, 'service id'),
      version: positiveInteger(service.version, 'service version'),
      label: text(service.label, 'service label', 240),
      pricingMode,
      fulfilmentMode,
      recurrenceEligible: literalTrue(service.recurrenceEligible, 'service recurrence eligibility'),
    }),
    schedule: adaptSchedule(source.schedule),
    commercial: Object.freeze({
      schemaVersion: 1,
      agreement: oneOf(commercial.agreement, ['same_terms_snapshot'] as const, 'recurring commercial agreement'),
      pricingMode: commercialPricingMode,
      customerTotalAmount: amount,
      currency: text(commercial.currency, 'commercial currency', 12),
      bookingCreationRequiresReconfirmation: literalTrue(
        commercial.bookingCreationRequiresReconfirmation,
        'booking reconfirmation',
      ),
      rateChangesRequireNewMutualTerms: literalTrue(
        commercial.rateChangesRequireNewMutualTerms,
        'rate change mutual terms',
      ),
    }),
    substitutionPolicy: oneOf(
      source.substitutionPolicy,
      ['no_substitution', 'explicit_approval_each_time'] as const,
      'substitution policy',
    ),
    cancellationPolicyVersion: text(source.cancellationPolicyVersion, 'cancellation policy version', 80),
    proposedByRole: oneOf(source.proposedByRole, ['customer', 'worker'] as const, 'terms proposer'),
    createdAt: timestamp(source.createdAt, 'terms creation time'),
  });
}

function adaptOccurrence(value: unknown): RecurringOccurrenceDto {
  const source = record(value, 'recurring occurrence');
  const bookingReference = source.bookingReference === undefined ? undefined : uuid(source.bookingReference, 'occurrence booking reference');
  return Object.freeze({
    id: uuid(source.id, 'occurrence id'),
    sequence: positiveInteger(source.sequence, 'occurrence sequence'),
    termsRevision: positiveInteger(source.termsRevision, 'occurrence terms revision'),
    scheduledAt: timestamp(source.scheduledAt, 'occurrence schedule'),
    status: oneOf(source.status, ['proposed', 'planned', 'held', 'change_pending', 'cancelled', 'completed', 'superseded'] as const, 'occurrence status'),
    ...(bookingReference ? { bookingReference } : {}),
  });
}

function adaptOccurrenceChange(value: unknown): RecurringOccurrenceChangeDto {
  const source = record(value, 'occurrence change');
  const proposedScheduledAt = source.proposedScheduledAt === undefined
    ? undefined
    : timestamp(source.proposedScheduledAt, 'proposed occurrence time');
  const decidedByRole = source.decidedByRole === undefined
    ? undefined
    : oneOf(source.decidedByRole, ['customer', 'worker'] as const, 'change decision role');
  const decidedAt = optionalTimestamp(source, 'decidedAt');
  return Object.freeze({
    id: uuid(source.id, 'occurrence change id'),
    occurrenceReference: uuid(source.occurrenceReference, 'occurrence reference'),
    kind: oneOf(source.kind, ['reschedule', 'cancel'] as const, 'occurrence change kind'),
    ...(proposedScheduledAt ? { proposedScheduledAt } : {}),
    status: oneOf(source.status, ['pending'] as const, 'occurrence change status'),
    requestedByRole: oneOf(source.requestedByRole, ['customer', 'worker'] as const, 'change requester role'),
    ...(decidedByRole ? { decidedByRole } : {}),
    requestedAt: timestamp(source.requestedAt, 'change request time'),
    ...(decidedAt ? { decidedAt } : {}),
  });
}

export function adaptRecurringSeriesDto(value: unknown): RecurringSeriesDto {
  const source = record(value, 'recurring series');
  requireSchema(source);
  const participants = record(source.participants, 'recurring participants');
  const customer = record(participants.customer, 'recurring customer');
  const worker = record(participants.worker, 'recurring worker');
  const controls = record(source.controls, 'recurring controls');
  if (!Array.isArray(source.acceptances) || !Array.isArray(source.occurrences) || !Array.isArray(source.pendingOccurrenceChanges)) {
    throw contractError('Recurring series collections were unavailable.');
  }
  const currentTerms = source.currentTerms === undefined ? undefined : adaptTerms(source.currentTerms);
  const proposedTerms = source.proposedTerms === undefined ? undefined : adaptTerms(source.proposedTerms);
  const activatedAt = optionalTimestamp(source, 'activatedAt');
  const cancelledAt = optionalTimestamp(source, 'cancelledAt');
  const status = oneOf(source.status, [
    'awaiting_acceptance', 'terms_change_pending', 'active', 'paused', 'resume_requested',
    'cancellation_requested', 'cancelled', 'blocked',
  ] as const, 'recurring series status');
  const pendingRequests = adaptRecurringPendingRequestsV1(source.pendingRequests, status);
  if (!pendingRequests.ok) throw contractError('Pending requester evidence did not match the series state.');
  const acceptances = source.acceptances.map((entry) => {
    const acceptance = record(entry, 'terms acceptance');
    return Object.freeze({
      participantRole: oneOf(acceptance.participantRole, ['customer', 'worker'] as const, 'acceptance role'),
      termsRevision: positiveInteger(acceptance.termsRevision, 'accepted terms revision'),
      acceptedAt: timestamp(acceptance.acceptedAt, 'acceptance time'),
    });
  });
  return Object.freeze({
    schema: SCHEMA,
    id: uuid(source.id, 'recurring series id'),
    revision: positiveInteger(source.revision, 'recurring series revision'),
    status,
    sourceProjectReference: uuid(source.sourceProjectReference, 'source project reference'),
    participants: Object.freeze({
      customer: Object.freeze({ id: uuid(customer.id, 'customer id') }),
      worker: Object.freeze({
        id: uuid(worker.id, 'worker id'),
        displayName: text(worker.displayName, 'worker display name', 160),
      }),
    }),
    ...(currentTerms ? { currentTerms } : {}),
    ...(proposedTerms ? { proposedTerms } : {}),
    acceptances: Object.freeze(acceptances),
    occurrences: Object.freeze(source.occurrences.map(adaptOccurrence)),
    pendingOccurrenceChanges: Object.freeze(source.pendingOccurrenceChanges.map(adaptOccurrenceChange)),
    pendingRequests: pendingRequests.value,
    controls: Object.freeze({
      occurrenceAndWholeSeriesAreDistinct: literalTrue(
        controls.occurrenceAndWholeSeriesAreDistinct,
        'occurrence and whole-series distinction',
      ),
      bookingCreationIsAutomatic: literalFalse(controls.bookingCreationIsAutomatic, 'automatic booking creation'),
      eachOccurrenceRequiresBookingConfirmation: literalTrue(
        controls.eachOccurrenceRequiresBookingConfirmation,
        'occurrence booking confirmation',
      ),
      substitutionIsAutomatic: literalFalse(controls.substitutionIsAutomatic, 'automatic substitution'),
      mutualAcceptanceRequired: literalTrue(controls.mutualAcceptanceRequired, 'mutual acceptance'),
    }),
    createdAt: timestamp(source.createdAt, 'recurring series creation time'),
    updatedAt: timestamp(source.updatedAt, 'recurring series update time'),
    ...(activatedAt ? { activatedAt } : {}),
    ...(cancelledAt ? { cancelledAt } : {}),
  });
}

function displayText(value: unknown, fallback: string, maxLength = 500): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= maxLength && !candidate.includes('\u0000') ? candidate : fallback;
}

function correlationId(headers: unknown): string | null {
  if (!isRecord(headers)) return null;
  const value = headers['x-request-id'] ?? headers['x-correlation-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function normaliseError(error: unknown): GroundedTrustError {
  if (error instanceof GroundedTrustError) return error;
  const axiosError = error as AxiosError<unknown>;
  const status = typeof axiosError?.response?.status === 'number' ? axiosError.response.status : null;
  const body = isRecord(axiosError?.response?.data) ? axiosError.response.data : {};
  const retryable = status === null || status === 408 || status === 425 || status === 429 || (status !== null && status >= 500);
  return new GroundedTrustError(Object.freeze({
    status,
    type: displayText(body.type ?? body.error, status === null ? 'network_unavailable' : 'trust_request_failed', 300),
    title: displayText(body.title, status === null ? 'Connection unavailable' : 'Trust action could not be completed'),
    detail: displayText(
      body.detail,
      retryable ? 'Check your connection and try again with the same action.' : 'Refresh the latest state before trying again.',
      1_000,
    ),
    correlationId: correlationId(axiosError?.response?.headers),
    retryable,
  }));
}

function ensureOnline(connectionState: TrustConnectionState): void {
  if (connectionState !== 'online') {
    throw new GroundedTrustError(Object.freeze({
      status: null,
      type: 'offline_fail_closed',
      title: 'Connect before continuing',
      detail: 'This consequential action was not sent. Reconnect and retry with the same action key.',
      correlationId: null,
      retryable: true,
    }));
  }
}

function resourceId(value: string, label: string): string {
  if (!UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('revision must be a positive integer');
  return value;
}

function idempotencyKey(value: string): string {
  const candidate = value.trim();
  if (candidate.length < 8 || candidate.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._:-]+$/.test(candidate)) {
    throw new TypeError('Idempotency key must be an opaque 8-255 character token');
  }
  return candidate;
}

async function request(config: AxiosRequestConfig): Promise<unknown> {
  try {
    const response = await api.request<unknown>(config);
    return response.data;
  } catch (error) {
    throw normaliseError(error);
  }
}

function mutationHeaders(key: string, expectedRevision?: number): Record<string, string> {
  return {
    'Idempotency-Key': idempotencyKey(key),
    ...(expectedRevision === undefined ? {} : { 'If-Match': `\"${revision(expectedRevision)}\"` }),
  };
}

function rootItem(response: unknown, key: string): unknown {
  const source = record(response, 'trust response');
  if (!(key in source)) throw contractError(`The ${key} response was unavailable.`);
  return source[key];
}

function rootList(response: unknown, key: string): readonly unknown[] {
  const value = rootItem(response, key);
  if (!Array.isArray(value)) throw contractError(`The ${key} response was not a list.`);
  return value;
}

export async function loadGroundedTrustFairness(): Promise<TrustFairnessDto> {
  const response = await request({ method: 'GET', url: '/api/trust/fairness' });
  const source = record(response, 'trust fairness response');
  requireSchema(source);
  timestamp(source.generatedAt, 'trust fairness generation time');
  return adaptTrustFairness(rootItem(source, 'fairness'));
}

export async function loadGroundedIncidents(kind: IncidentKind): Promise<readonly IncidentDto[]> {
  const response = await request({ method: 'GET', url: kind === 'safety' ? '/api/safety/incidents' : '/api/support/cases' });
  const values = rootList(response, kind === 'safety' ? 'incidents' : 'cases').map(adaptIncidentDto);
  if (values.some((incident) => incident.kind !== kind || incident.summary !== undefined)) {
    throw contractError('Incident list privacy projection was invalid.');
  }
  return Object.freeze(values);
}

export async function loadGroundedIncident(kind: IncidentKind, incidentId: string): Promise<IncidentDto> {
  const id = resourceId(incidentId, 'incidentId');
  const response = await request({ method: 'GET', url: kind === 'safety' ? `/api/safety/incidents/${id}` : `/api/support/cases/${id}` });
  const incident = adaptIncidentDto(rootItem(response, kind === 'safety' ? 'incident' : 'case'));
  if (incident.kind !== kind) throw contractError('Incident kind did not match the requested record.');
  return incident;
}

export async function createGroundedIncident(input: Readonly<{
  kind: IncidentKind;
  bookingId?: string;
  category: IncidentCategory;
  summary: string;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<IncidentDto> {
  ensureOnline(input.connectionState);
  const data = {
    ...(input.bookingId ? { bookingId: resourceId(input.bookingId, 'bookingId') } : {}),
    category: input.category,
    summary: input.summary,
    requestedChannel: 'in_app_record' as const,
  };
  const response = await request({
    method: 'POST',
    url: input.kind === 'safety' ? '/api/safety/incidents' : '/api/support/cases',
    data,
    headers: mutationHeaders(input.idempotencyKey),
  });
  return adaptIncidentDto(rootItem(response, input.kind === 'safety' ? 'incident' : 'case'));
}

export async function loadGroundedRelationshipEligibility(bookingId: string): Promise<RelationshipEligibilityDto> {
  const id = resourceId(bookingId, 'bookingId');
  const response = await request({ method: 'GET', url: `/api/bookings/${id}/relationship-eligibility` });
  return adaptRelationshipEligibilityDto(rootItem(response, 'relationship'));
}

export async function loadGroundedSafeShare(bookingId: string): Promise<GroundedSafeShareDto> {
  const id = resourceId(bookingId, 'bookingId');
  const response = await request({ method: 'POST', url: `/api/bookings/${id}/share-trip`, data: {} });
  const source = record(response, 'safe sharing response');
  const eligibility = record(rootItem(source, 'bookingDetailsShare'), 'safe sharing eligibility');
  const preview = record(rootItem(source, 'preview'), 'safe sharing preview');
  const shareText = text(rootItem(source, 'shareText'), 'safe sharing text', 1_000);
  literalTrue(eligibility.available, 'safe sharing availability');
  const mode = oneOf(
    eligibility.mode,
    ['non_live_no_address'] as const,
    'safe sharing mode',
  );
  const liveTracking = literalFalse(rootItem(source, 'live_tracking'), 'live tracking share');
  if (rootItem(source, 'public_link') !== null) {
    throw contractError('Public sharing must remain disabled for this app version.');
  }
  return Object.freeze({
    bookingDetailsShare: Object.freeze({ available: true, mode }),
    preview: Object.freeze({ ...preview }),
    shareText,
    liveTracking,
    publicLink: null,
  });
}

export async function loadGroundedFavourites(): Promise<readonly FavouriteDto[]> {
  const response = await request({ method: 'GET', url: '/api/favourites' });
  return Object.freeze(rootList(response, 'favourites').map(adaptFavouriteDto));
}

export async function createGroundedFavourite(input: Readonly<{
  workerId: string;
  sourceBookingId: string;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<FavouriteDto> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'POST',
    url: '/api/favourites',
    data: {
      workerId: resourceId(input.workerId, 'workerId'),
      sourceBookingId: resourceId(input.sourceBookingId, 'sourceBookingId'),
    },
    headers: mutationHeaders(input.idempotencyKey),
  });
  return adaptFavouriteDto(rootItem(response, 'favourite'));
}

export async function removeGroundedFavourite(input: Readonly<{
  workerId: string;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<Readonly<{ workerReference: string; removed: boolean; status: FavouriteStatus | 'not_found'; revision?: number }>> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'DELETE',
    url: `/api/favourites/${resourceId(input.workerId, 'workerId')}`,
    data: {},
    headers: mutationHeaders(input.idempotencyKey),
  });
  const result = record(rootItem(response, 'result'), 'favourite removal result');
  const resultRevision = result.revision === undefined ? undefined : positiveInteger(result.revision, 'favourite revision');
  return Object.freeze({
    workerReference: uuid(result.workerReference, 'worker reference'),
    removed: boolean(result.removed, 'favourite removal'),
    status: oneOf(result.status, ['active', 'removed', 'blocked', 'not_found'] as const, 'favourite status'),
    ...(resultRevision ? { revision: resultRevision } : {}),
  });
}

export async function createGroundedBlock(input: Readonly<{
  blockedUserId: string;
  sourceBookingId: string;
  reasonCode: BlockReasonCode;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<BlockDto> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'POST',
    url: '/api/blocks',
    data: {
      blockedUserId: resourceId(input.blockedUserId, 'blockedUserId'),
      sourceBookingId: resourceId(input.sourceBookingId, 'sourceBookingId'),
      reasonCode: input.reasonCode,
    },
    headers: mutationHeaders(input.idempotencyKey),
  });
  return adaptBlockDto(rootItem(response, 'block'));
}

export async function createGroundedRebookDraft(input: Readonly<{
  sourceBookingId: string;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<RebookDraftDto> {
  ensureOnline(input.connectionState);
  const id = resourceId(input.sourceBookingId, 'sourceBookingId');
  const response = await request({
    method: 'POST',
    url: `/api/bookings/${id}/rebook-drafts`,
    data: {},
    headers: mutationHeaders(input.idempotencyKey),
  });
  return adaptRebookDraftDto(rootItem(response, 'rebookDraft'));
}

export async function loadGroundedRebookDrafts(): Promise<readonly RebookDraftDto[]> {
  const response = await request({ method: 'GET', url: '/api/rebook-drafts' });
  return Object.freeze(rootList(response, 'rebookDrafts').map(adaptRebookDraftDto));
}

export async function loadGroundedRebookDraft(draftId: string): Promise<RebookDraftDto> {
  const response = await request({ method: 'GET', url: `/api/rebook-drafts/${resourceId(draftId, 'draftId')}` });
  return adaptRebookDraftDto(rootItem(response, 'rebookDraft'));
}

export async function updateGroundedRebookDraft(input: Readonly<{
  draftId: string;
  revision: number;
  patch: Readonly<{
    editableScope?: Readonly<Record<string, unknown>>;
    broadAreaLabel?: string | null;
    requestedStartsAt?: string | null;
  }>;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<RebookDraftDto> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'PATCH',
    url: `/api/rebook-drafts/${resourceId(input.draftId, 'draftId')}`,
    data: input.patch,
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  });
  return adaptRebookDraftDto(rootItem(response, 'rebookDraft'));
}

export async function createGroundedRecurringSeries(input: Readonly<{
  sourceBookingId: string;
  schedule: RecurringSchedule;
  substitutionPolicy: SubstitutionPolicy;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<RecurringSeriesDto> {
  ensureOnline(input.connectionState);
  const response = await request({
    method: 'POST',
    url: '/api/recurring-series',
    data: {
      sourceBookingId: resourceId(input.sourceBookingId, 'sourceBookingId'),
      schedule: input.schedule,
      substitutionPolicy: input.substitutionPolicy,
    },
    headers: mutationHeaders(input.idempotencyKey),
  });
  return adaptRecurringSeriesDto(rootItem(response, 'recurringSeries'));
}

export async function loadGroundedRecurringSeries(): Promise<readonly RecurringSeriesDto[]> {
  const response = await request({ method: 'GET', url: '/api/recurring-series' });
  return Object.freeze(rootList(response, 'recurringSeries').map(adaptRecurringSeriesDto));
}

export async function loadGroundedRecurringSeriesDetail(seriesId: string): Promise<RecurringSeriesDto> {
  const response = await request({ method: 'GET', url: `/api/recurring-series/${resourceId(seriesId, 'seriesId')}` });
  return adaptRecurringSeriesDto(rootItem(response, 'recurringSeries'));
}

export async function updateGroundedRecurringSeries(input: Readonly<{
  seriesId: string;
  revision: number;
  action: RecurringSeriesAction;
  connectionState: TrustConnectionState;
  idempotencyKey: string;
}>): Promise<RecurringSeriesDto> {
  ensureOnline(input.connectionState);
  if ('occurrenceId' in input.action) resourceId(input.action.occurrenceId, 'occurrenceId');
  if ('changeRequestId' in input.action) resourceId(input.action.changeRequestId, 'changeRequestId');
  const response = await request({
    method: 'PATCH',
    url: `/api/recurring-series/${resourceId(input.seriesId, 'seriesId')}`,
    data: input.action,
    headers: mutationHeaders(input.idempotencyKey, input.revision),
  });
  return adaptRecurringSeriesDto(rootItem(response, 'recurringSeries'));
}

export function isGroundedTrustError(error: unknown): error is GroundedTrustError {
  return error instanceof GroundedTrustError;
}
