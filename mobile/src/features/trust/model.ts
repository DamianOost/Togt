import type {
  BlockReasonCode,
  IncidentCategory,
  IncidentDto,
  IncidentKind,
  IncidentState,
  RecurringOccurrenceChangeDto,
  RecurringOccurrenceDto,
  RecurringSeriesDto,
  RelationshipEligibilityDto,
  RebookDraftDto,
  TrustConnectionState,
  TrustRole,
} from '../../services/groundedTrust';

export type ConnectionState = TrustConnectionState;

export type TrustResourceState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; title: string; message: string; correlationId?: string }>
  | Readonly<{ status: 'empty'; title: string; message: string }>
  | Readonly<{ status: 'ready'; value: T; lastUpdatedAt?: string }>;

export type IncidentCategoryOption = Readonly<{
  value: IncidentCategory;
  label: string;
  description: string;
}>;

const SAFETY_CATEGORIES: readonly IncidentCategoryOption[] = Object.freeze([
  { value: 'immediate_danger', label: 'Immediate danger', description: 'Use the dialler first if anyone is at risk now.' },
  { value: 'injury', label: 'Injury', description: 'Record an injury connected to a Project.' },
  { value: 'harassment', label: 'Harassment', description: 'Record threatening or inappropriate behaviour.' },
  { value: 'unsafe_work', label: 'Unsafe work', description: 'Record unsafe conditions or conduct.' },
  { value: 'property_damage', label: 'Property damage', description: 'Record damage linked to the work.' },
  { value: 'other', label: 'Something else', description: 'Record another safety concern.' },
]);

const SUPPORT_CATEGORIES: readonly IncidentCategoryOption[] = Object.freeze([
  { value: 'payment_or_work', label: 'Payment or work', description: 'Record a payment or Project support request.' },
  { value: 'account_help', label: 'Account help', description: 'Record an access or account support request.' },
  { value: 'property_damage', label: 'Property damage', description: 'Record a property-related support request.' },
  { value: 'other', label: 'Something else', description: 'Record another support request.' },
]);

export const EMERGENCY_DIAL_OPTIONS = [
  {
    kind: 'national_mobile_emergency' as const,
    number: '112' as const,
    label: 'Call 112 — emergency services',
    detail: 'Emergency services from a mobile phone',
  },
  {
    kind: 'police_emergency' as const,
    number: '10111' as const,
    label: 'Call 10111 — police emergency',
    detail: 'South African Police Service emergency line',
  },
] as const;

export function incidentCategoryOptions(kind: IncidentKind): readonly IncidentCategoryOption[] {
  return kind === 'safety' ? SAFETY_CATEGORIES : SUPPORT_CATEGORIES;
}

export function incidentCategoryLabel(category: IncidentCategory): string {
  return [...SAFETY_CATEGORIES, ...SUPPORT_CATEGORIES].find((option) => option.value === category)?.label
    ?? category.replaceAll('_', ' ');
}

export type IncidentTimelineItem = Readonly<{
  state: IncidentState;
  label: string;
  status: 'complete' | 'current' | 'future' | 'issue';
  occurredAt?: string;
}>;

const INCIDENT_STATE_LABELS: Readonly<Record<IncidentState, string>> = Object.freeze({
  received: 'Record received',
  acknowledged: 'Acknowledged by an operated support team',
  escalated: 'Escalated by an operated support team',
  resolved: 'Resolved',
  failed: 'Record failed',
});

export function incidentStateLabel(state: IncidentState): string {
  return INCIDENT_STATE_LABELS[state];
}

export function incidentTimeline(incident: IncidentDto): readonly IncidentTimelineItem[] {
  const canonical = incident.stateMachine.canonical;
  const currentIndex = canonical.indexOf(incident.state);
  return Object.freeze(canonical.map((state, index): IncidentTimelineItem => {
    const occurredAt = state === 'received'
      ? incident.createdAt
      : state === 'acknowledged'
        ? incident.acknowledgedAt
        : state === 'escalated'
          ? incident.escalatedAt
          : state === 'resolved'
            ? incident.resolvedAt
            : incident.failedAt;
    const status = state === 'failed' && incident.state === 'failed'
      ? 'issue'
      : index < currentIndex && occurredAt
        ? 'complete'
        : state === incident.state
          ? 'current'
          : 'future';
    return Object.freeze({
      state,
      label: INCIDENT_STATE_LABELS[state],
      status,
      ...(occurredAt ? { occurredAt } : {}),
    });
  }));
}

export type SafetyCentreSnapshot = Readonly<{
  safetyIncidents: readonly IncidentDto[];
  supportCases: readonly IncidentDto[];
}>;

export type SafeSharePreview = Readonly<{
  projectReference: string;
  serviceLabel: string;
  broadAreaLabel: string;
  scheduleLabel: string;
  statusLabel: string;
}>;

export type SafeSharePreviewResult =
  | Readonly<{ ok: true; value: SafeSharePreview }>
  | Readonly<{ ok: false; reasonCode: 'unsafe_payload' | 'invalid_payload' }>;

const SAFE_SHARE_FIELDS = new Set([
  'projectReference',
  'serviceLabel',
  'broadAreaLabel',
  'scheduleLabel',
  'statusLabel',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeShareText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  const containsPrivatePattern =
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(candidate)
    || /(?:\+?\d[\d\s().-]*){7,}/.test(candidate)
    || /-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/.test(candidate)
    || /\b\d{1,6}\s+[A-Za-z][A-Za-z\s'-]{1,80}\b(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|place|pl|close|crescent|way|boulevard|blvd)\b/i.test(candidate)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(candidate);
  return candidate.length > 0
    && candidate.length <= maxLength
    && !candidate.includes('\u0000')
    && !containsPrivatePattern
    ? candidate
    : null;
}

export function adaptSafeSharePreview(value: unknown): SafeSharePreviewResult {
  if (!isRecord(value)) return Object.freeze({ ok: false, reasonCode: 'invalid_payload' });
  if (Object.keys(value).some((key) => !SAFE_SHARE_FIELDS.has(key))) {
    return Object.freeze({ ok: false, reasonCode: 'unsafe_payload' });
  }
  const projectReference = safeShareText(value.projectReference, 80);
  const serviceLabel = safeShareText(value.serviceLabel, 160);
  const broadAreaLabel = safeShareText(value.broadAreaLabel, 160);
  const scheduleLabel = safeShareText(value.scheduleLabel, 160);
  const statusLabel = safeShareText(value.statusLabel, 120);
  if (!projectReference || !serviceLabel || !broadAreaLabel || !scheduleLabel || !statusLabel) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_payload' });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ projectReference, serviceLabel, broadAreaLabel, scheduleLabel, statusLabel }),
  });
}

export function safeShareMessage(preview: SafeSharePreview): string {
  return [
    `${preview.projectReference} summary`,
    `Service: ${preview.serviceLabel}`,
    `Area: ${preview.broadAreaLabel}`,
    `Schedule: ${preview.scheduleLabel}`,
    `Status: ${preview.statusLabel}`,
    'This is a static booking summary, not a live tracking link.',
  ].join('\n');
}

export type ShareCapability =
  | Readonly<{ available: true; mode: 'non_live_no_address'; preview: SafeSharePreview }>
  | Readonly<{ available: false; reasonCode: string }>;

export type PublicLiveShareCapability = Readonly<{
  available: false;
  reasonCode: 'expiring_public_tokens_not_implemented';
}>;

export type SafeSharingSnapshot = Readonly<{
  bookingDetailsShare: ShareCapability;
  publicLiveShare: PublicLiveShareCapability;
}>;

export type RelationshipActionAvailability = Readonly<{
  favourite: Readonly<{ available: boolean; reason: string }>;
  rebookDraft: Readonly<{ available: boolean; reason: string }>;
  createRecurringSeries: Readonly<{ available: boolean; reason: string }>;
  block: Readonly<{ available: boolean; reason: string }>;
}>;

export function deriveRelationshipActions(
  eligibility: RelationshipEligibilityDto,
  connectionState: ConnectionState,
): RelationshipActionAvailability {
  const offline = connectionState === 'offline';
  const eligibilityReason = eligibility.relationshipEligible
    ? 'Available for this completed, paid relationship.'
    : 'Requires confirmed completion, reconciled payment, and no open issue or block.';
  const action = (allowed: boolean) => Object.freeze({
    available: allowed && !offline,
    reason: offline ? 'Reconnect to make this change.' : eligibilityReason,
  });
  return Object.freeze({
    favourite: action(eligibility.actions.favourite),
    rebookDraft: action(eligibility.actions.rebookDraft),
    createRecurringSeries: action(eligibility.actions.createRecurringSeries),
    block: Object.freeze({
      available: eligibility.actions.block && !offline,
      reason: offline ? 'Reconnect to block this person.' : 'Blocking is available regardless of retention eligibility.',
    }),
  });
}

export const BLOCK_CONSEQUENCES = Object.freeze({
  futureMatchingAllowed: false as const,
  newContactAllowed: false as const,
  recurringRelationshipAllowed: false as const,
  statements: Object.freeze([
    'Future matching between you is blocked.',
    'New contact between you is blocked.',
    'New recurring work between you is blocked.',
    'Current Project obligations keep their own authoritative status.',
  ]),
});

export const BLOCK_REASON_OPTIONS: readonly Readonly<{
  value: BlockReasonCode;
  label: string;
}>[] = Object.freeze([
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_contact', label: 'Inappropriate contact' },
  { value: 'work_dispute', label: 'Work dispute' },
  { value: 'do_not_match', label: 'Do not match us again' },
  { value: 'other', label: 'Another reason' },
]);

export function rebookDraftIsEditable(draft: RebookDraftDto): boolean {
  return draft.status === 'draft'
    && draft.submission.submitted === false
    && draft.submission.bookingCreated === false
    && draft.submission.supportedByThisEndpoint === false;
}

export const REBOOK_CONFIRMATION_LABELS = Object.freeze({
  currentPrice: 'Current price still requires confirmation',
  location: 'Location still requires confirmation',
  schedule: 'Schedule still requires confirmation',
  workerAvailability: 'Worker availability still requires confirmation',
});

export type RecurringSeriesActionAvailability = Readonly<{
  acceptTerms: boolean;
  pause: boolean;
  requestResume: boolean;
  acceptResume: boolean;
  requestCancelSeries: boolean;
  acceptCancelSeries: boolean;
  explain: string;
}>;

export function acceptedCurrentTerms(series: RecurringSeriesDto, role: TrustRole): boolean {
  const terms = series.proposedTerms ?? series.currentTerms;
  if (!terms) return false;
  return series.acceptances.some((acceptance) => (
    acceptance.participantRole === role && acceptance.termsRevision === terms.revision
  ));
}

export function deriveRecurringSeriesActions(
  series: RecurringSeriesDto,
  role: TrustRole,
  connectionState: ConnectionState,
): RecurringSeriesActionAvailability {
  if (connectionState === 'offline' || series.status === 'blocked' || series.status === 'cancelled') {
    return Object.freeze({
      acceptTerms: false,
      pause: false,
      requestResume: false,
      acceptResume: false,
      requestCancelSeries: false,
      acceptCancelSeries: false,
      explain: connectionState === 'offline'
        ? 'Reconnect to make a series or occurrence decision.'
        : 'This series is read-only.',
    });
  }
  const awaitingTerms = series.status === 'awaiting_acceptance' || series.status === 'terms_change_pending';
  return Object.freeze({
    acceptTerms: awaitingTerms && !acceptedCurrentTerms(series, role),
    pause: series.status === 'active',
    requestResume: series.status === 'paused',
    acceptResume: series.status === 'resume_requested'
      && series.pendingRequests.resumeRequestedByRole !== null
      && series.pendingRequests.resumeRequestedByRole !== role,
    requestCancelSeries: !['cancellation_requested', 'cancelled'].includes(series.status),
    acceptCancelSeries: series.status === 'cancellation_requested'
      && series.pendingRequests.cancellationRequestedByRole !== null
      && series.pendingRequests.cancellationRequestedByRole !== role,
    explain: awaitingTerms
      ? 'Both participants must accept the same terms revision.'
      : 'A series decision never silently changes an individual occurrence.',
  });
}

export type OccurrenceDecisionView = Readonly<{
  occurrence: RecurringOccurrenceDto;
  pendingChange: RecurringOccurrenceChangeDto | null;
  canRequestChange: boolean;
  canAcceptChange: boolean;
  canDeclineChange: boolean;
  bookingTruth: string;
}>;

export function deriveOccurrenceDecision(
  series: RecurringSeriesDto,
  occurrence: RecurringOccurrenceDto,
  role: TrustRole,
  connectionState: ConnectionState,
): OccurrenceDecisionView {
  const pendingChange = series.pendingOccurrenceChanges.find((change) => change.occurrenceReference === occurrence.id) ?? null;
  const online = connectionState === 'online';
  const terminal = ['cancelled', 'completed', 'superseded'].includes(occurrence.status);
  const requestedByCounterpart = pendingChange !== null && pendingChange.requestedByRole !== role;
  return Object.freeze({
    occurrence,
    pendingChange,
    canRequestChange: online && !terminal && pendingChange === null && series.status !== 'blocked' && series.status !== 'cancelled',
    canAcceptChange: online && requestedByCounterpart,
    canDeclineChange: online && requestedByCounterpart,
    bookingTruth: occurrence.bookingReference
      ? 'A separate Project reference exists for this occurrence.'
      : 'This is an accepted series plan, not a booking. Booking confirmation is still required.',
  });
}

export type TrustEvidenceFact = Readonly<{
  id: string;
  label: string;
  valueLabel: string;
  explanation: string;
  sourceLabel: string;
  sampleSize: number | null;
  observedAt: string;
}>;

export type HumanReviewCapability =
  | Readonly<{ available: true; channel: 'in_app_record'; actionLabel: string }>
  | Readonly<{ available: false; reasonCode: string }>;

export type FairnessRestriction = Readonly<{
  status: 'none' | 'active' | 'under_review' | 'lifted';
  reasonCode: string | null;
  reasonLabel: string;
  evidence: readonly TrustEvidenceFact[];
  recoverySteps: readonly string[];
  humanReview: HumanReviewCapability;
}>;

export type TrustFairnessSnapshot = Readonly<{
  title: string;
  summary: string;
  evidence: readonly TrustEvidenceFact[];
  restriction: FairnessRestriction;
}>;

export type NotificationCategory =
  | 'offers'
  | 'job_updates'
  | 'chat'
  | 'payment_payout'
  | 'safety'
  | 'marketing';

export type NotificationRegistrationState = 'unavailable' | 'not_requested' | 'denied' | 'registered';

export type NotificationPreference = Readonly<{
  category: NotificationCategory;
  enabled: boolean;
}>;

export type NotificationControlSnapshot = Readonly<{
  registrationState: NotificationRegistrationState;
  preferences: readonly NotificationPreference[];
  quietHours: Readonly<{
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    timezone: 'Africa/Johannesburg';
    criticalSafetyBypass: true;
  }>;
}>;

export const NOTIFICATION_CATEGORY_COPY: Readonly<Record<NotificationCategory, Readonly<{
  label: string;
  description: string;
}>>> = Object.freeze({
  offers: { label: 'Offers', description: 'New work offers and offer expiry updates.' },
  job_updates: { label: 'Project updates', description: 'Schedule, arrival, scope and completion changes.' },
  chat: { label: 'Chat', description: 'New Project messages.' },
  payment_payout: { label: 'Payment and payout', description: 'Verified payment or payout state changes.' },
  safety: { label: 'Safety', description: 'Safety records and critical safety notices.' },
  marketing: { label: 'Marketing', description: 'Product news and optional promotions.' },
});

export function notificationPermissionCopy(state: NotificationRegistrationState): Readonly<{
  title: string;
  body: string;
  active: boolean;
}> {
  if (state === 'registered') {
    return Object.freeze({
      title: 'This device is registered',
      body: 'Remote notifications can be sent subject to each category setting.',
      active: true,
    });
  }
  if (state === 'denied') {
    return Object.freeze({
      title: 'Device permission is denied',
      body: 'Open device settings to allow notifications. Category choices alone cannot override device permission.',
      active: false,
    });
  }
  if (state === 'not_requested') {
    return Object.freeze({
      title: 'Permission has not been requested',
      body: 'Notifications are not active on this device yet.',
      active: false,
    });
  }
  return Object.freeze({
    title: 'Remote notifications are unavailable',
    body: 'This build has not registered remote notification delivery.',
    active: false,
  });
}

export function canMutateNotificationControls(snapshot: NotificationControlSnapshot, connectionState: ConnectionState): boolean {
  return snapshot.registrationState === 'registered' && connectionState === 'online';
}
