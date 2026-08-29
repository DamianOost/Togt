/**
 * Phase 2 customer project contracts.
 *
 * These view models never advance lifecycle state. They present an immutable,
 * server-authored snapshot and emit an idempotent command intent for the
 * integration layer to acknowledge. Missing evidence stays missing.
 */

export const CUSTOMER_PROJECT_SCHEMA_VERSION = 1 as const;

export type ConnectionState = 'online' | 'offline';
export type CurrencyCode = 'ZAR';
export type MatchingMode =
  | 'fast_match'
  | 'compare_workers'
  | 'receive_quotes'
  | 'diagnostic_visit';

export type OperationalPhase =
  | 'matching'
  | 'assigned'
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'scope_confirmation'
  | 'work_active'
  | 'completion_review'
  | 'payment_pending'
  | 'closed'
  | 'unknown';

export type ProjectSegment = 'active' | 'upcoming' | 'past';

export type Loadable<T> =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'error'; correlationId: string | null }>
  | Readonly<{ state: 'empty' }>
  | Readonly<{ state: 'ready'; value: T; connectionState: ConnectionState; lastUpdatedAt: string }>;

export interface MoneyAmount {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export type PriceEvidence =
  | Readonly<{ kind: 'fixed'; total: MoneyAmount; label: string }>
  | Readonly<{ kind: 'recorded_total'; total: MoneyAmount; label: string }>
  | Readonly<{
      kind: 'hourly';
      rate: MoneyAmount;
      estimatedTotal: Readonly<{ min: MoneyAmount; max: MoneyAmount }> | null;
      approvalCap: MoneyAmount | null;
    }>
  | Readonly<{ kind: 'quote'; total: MoneyAmount; quoteId: string; quoteVersion: number; expiresAt: string | null }>
  | Readonly<{
      kind: 'diagnostic';
      visitTotal: MoneyAmount;
      deliverable: string;
      laterWorkIncluded: false;
    }>
  | Readonly<{ kind: 'not_yet_available'; reasonCode: 'waiting_for_quote' | 'data_unavailable' }>;

export type VerificationEvidence = Readonly<{
  id: string;
  label: string;
  status: 'verified' | 'pending' | 'not_verified';
  detail: string;
}>;

export interface WorkerChoice {
  readonly workerId: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly serviceId: string;
  readonly serviceVersion: number;
  readonly serviceLabel: string;
  readonly availabilityLabel: string | null;
  readonly price: PriceEvidence;
  readonly rating: Readonly<{ average: number; count: number }> | null;
  readonly completedJobs: number | null;
  readonly reliabilityLabel: string | null;
  readonly distanceLabel: string | null;
  readonly serviceAreaLabel: string | null;
  readonly whyMatch: string | null;
  readonly verification: readonly VerificationEvidence[];
  readonly selectionKind: 'scheduled_request' | 'reservable_slot';
}

export interface QuoteChoice {
  readonly quoteId: string;
  readonly quoteVersion: number;
  readonly worker: WorkerChoice;
  readonly scope: string;
  readonly exclusions: readonly string[];
  readonly assumptions: readonly string[];
  readonly scheduleLabel: string;
  readonly durationLabel: string | null;
  readonly total: MoneyAmount;
  readonly expiresAt: string;
  readonly status: 'submitted' | 'edited' | 'withdrawn' | 'expired' | 'accepted' | 'declined' | 'lost';
}

export interface WorkerProfileSnapshot {
  readonly worker: WorkerChoice;
  readonly about: string | null;
  readonly serviceVariants: readonly Readonly<{
    serviceId: string;
    serviceVersion: number;
    label: string;
    description: string;
    availabilityLabel: string | null;
    price: PriceEvidence;
  }>[];
  readonly portfolio: readonly Readonly<{
    portfolioId: string;
    imageUrl: string;
    caption: string;
    serviceId: string;
  }>[];
  readonly reviews: readonly Readonly<{
    reviewId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    body: string | null;
    publishedAt: string;
    serviceLabel: string;
  }>[];
  readonly currentlyAvailable: boolean;
  readonly nextAvailabilityLabel: string | null;
  readonly directRequestAvailable: boolean;
  readonly directRequestUnavailableReason: string | null;
}

export type FastMatchStatus =
  | 'finding_eligible_workers'
  | 'offer_sent'
  | 'waiting_for_response'
  | 'awaiting_customer_rate_confirmation'
  | 'matched'
  | 'no_candidates'
  | 'all_declined'
  | 'expired'
  | 'connection_lost'
  | 'cancelled';

export type CompareWorkersStatus =
  | 'loading'
  | 'ready'
  | 'request_sent'
  | 'worker_confirmed'
  | 'slot_expired'
  | 'lost_race'
  | 'empty'
  | 'error';

export type QuotesStatus =
  | 'loading'
  | 'waiting'
  | 'partial'
  | 'ready'
  | 'selected'
  | 'withdrawn'
  | 'expired'
  | 'lost_race'
  | 'no_quotes'
  | 'cancelled'
  | 'error';

export type DiagnosticStatus =
  | 'loading'
  | 'ready'
  | 'request_sent'
  | 'confirmed'
  | 'unavailable'
  | 'error';

export type MatchingSnapshot =
  | Readonly<{
      mode: 'fast_match';
      requestId: string;
      projectId: string;
      stateVersion: number;
      status: FastMatchStatus;
      elapsedSeconds: number | null;
      summary: string;
      areaLabel: string;
      matchedWorker: WorkerChoice | null;
      matchedHourlyTerms: Extract<PriceEvidence, { kind: 'hourly' }> | null;
    }>
  | Readonly<{
      mode: 'compare_workers';
      requestId: string;
      projectId: string;
      stateVersion: number;
      status: CompareWorkersStatus;
      workers: readonly WorkerChoice[];
      selectedWorkerId: string | null;
      detail: string | null;
    }>
  | Readonly<{
      mode: 'receive_quotes';
      requestId: string;
      projectId: string;
      stateVersion: number;
      status: QuotesStatus;
      quotes: readonly QuoteChoice[];
      selectedQuoteId: string | null;
      responseSummary: string | null;
    }>
  | Readonly<{
      mode: 'diagnostic_visit';
      requestId: string;
      projectId: string;
      stateVersion: number;
      status: DiagnosticStatus;
      workers: readonly WorkerChoice[];
      selectedWorkerId: string | null;
      diagnosticTerms: Extract<PriceEvidence, { kind: 'diagnostic' }>;
      scheduleLabel: string;
    }>;

export interface MatchRecovery {
  readonly action: 'retry_match' | null;
  readonly label: string | null;
  readonly explanation: string;
}

export interface MatchingView {
  readonly title: string;
  readonly statusLabel: string;
  readonly body: string;
  readonly terminal: boolean;
  readonly showCancel: boolean;
  readonly recovery: MatchRecovery;
  readonly confirmedWorker: WorkerChoice | null;
}

export type PaymentObligationStatus =
  | 'unknown'
  | 'not_due'
  | 'due'
  | 'partially_paid'
  | 'paid'
  | 'voided';

export type PaymentAttemptStatus =
  | 'not_started'
  | 'created'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'uncertain';

export interface PaymentSnapshot {
  readonly obligationStatus: PaymentObligationStatus;
  readonly amountDue: MoneyAmount | null;
  readonly amountPaid: MoneyAmount | null;
  readonly attemptStatus: PaymentAttemptStatus;
  readonly methodLabel: string | null;
  readonly checkoutCapability: 'available' | 'unavailable';
  readonly checkoutUnavailableReason: string | null;
  readonly cashStatus: 'not_available' | 'not_declared' | 'customer_declared' | 'worker_confirmed' | 'disagreed' | 'expired';
  readonly providerReturnState: 'not_started' | 'browser_handoff' | 'abandoned_return' | 'awaiting_reconciliation' | 'corrected_late_success' | 'complete';
  readonly refundStatus: 'none' | 'pending' | 'partial' | 'full';
  readonly paymentDisputeStatus: 'none' | 'open' | 'under_review' | 'resolved';
  readonly fundingAssurance: Readonly<{
    status: 'not_required' | 'required' | 'pending' | 'secured' | 'failed' | 'expired' | 'released';
    kindLabel: string | null;
    assuredAmount: MoneyAmount | null;
  }>;
  readonly lastReconciledAt: string | null;
}

export interface ProjectListItem {
  readonly projectId: string;
  readonly segment: ProjectSegment;
  readonly stateVersion: number;
  readonly serviceId: string | null;
  readonly serviceVersion: number | null;
  readonly serviceLabel: string;
  readonly workerId: string | null;
  readonly workerName: string | null;
  readonly workerPhotoUrl: string | null;
  readonly scheduleLabel: string;
  readonly operationalPhase: OperationalPhase;
  readonly operationalLabel: string;
  readonly areaLabel: string;
  readonly paymentStatus: PaymentObligationStatus;
  readonly canReschedule: boolean;
  readonly canCancel: boolean;
  readonly hasReceipt: boolean;
  readonly canRate: boolean;
  readonly canRebook: boolean;
}

export interface TimelineEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly label: string;
  readonly detail: string | null;
  readonly status: 'complete' | 'current' | 'future' | 'issue';
}

export interface CommercialSnapshot {
  readonly snapshotId: string | null;
  readonly version: number | null;
  readonly pricingMode: PriceEvidence['kind'];
  readonly price: PriceEvidence;
  readonly scopeSummary: string;
  readonly materialsSummary: string;
}

export interface ProjectHubSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly serviceId: string | null;
  readonly serviceVersion: number | null;
  readonly serviceLabel: string;
  readonly phase: OperationalPhase;
  readonly phaseLabel: string;
  readonly phaseUpdatedAt: string;
  readonly scheduleLabel: string;
  readonly areaLabel: string;
  readonly exactAddressLabel: string;
  readonly worker: WorkerChoice | null;
  readonly timeline: readonly TimelineEvent[];
  readonly commercial: CommercialSnapshot;
  readonly payment: PaymentSnapshot;
  readonly safetyCapability: 'minimum' | 'full';
  readonly canChat: boolean;
  readonly canContact: boolean;
  readonly canShareSafeStatus: boolean;
  readonly openIssue: Readonly<{ issueId: string; label: string }> | null;
}

export type TrackingEvidence =
  | Readonly<{ visibility: 'hidden'; reason: 'before_reveal_window' | 'after_terminal_state' }>
  | Readonly<{ visibility: 'not_shared'; reason: 'worker_not_sharing' | 'permission_unavailable' }>
  | Readonly<{
      visibility: 'available';
      capturedAt: string;
      latitude: number;
      longitude: number;
      accuracyMetres: number | null;
      etaLabel: string | null;
    }>
  | Readonly<{ visibility: 'unavailable'; lastKnownAt: string | null }>;

export interface TravelView {
  readonly kind: 'hidden' | 'not_shared' | 'live' | 'stale' | 'unavailable';
  readonly title: string;
  readonly body: string;
  readonly timestampLabel: string | null;
  readonly coordinates: Readonly<{ latitude: number; longitude: number }> | null;
  readonly etaLabel: string | null;
  readonly preserveNonMapActions: true;
}

export interface PrivacyView {
  readonly workerAddressAccess: 'broad_area_only' | 'exact_revealed' | 'closed';
  readonly contactAccess: 'masked' | 'revealed' | 'closed';
  readonly explanation: string;
}

export interface ScopeSnapshot {
  readonly scopeId: string;
  readonly version: number;
  readonly status:
    | 'pending_worker'
    | 'worker_confirmed'
    | 'revision_requested'
    | 'pending_customer'
    | 'confirmed'
    | 'revision_declined'
    | 'cancelled';
  readonly included: readonly string[];
  readonly excluded: readonly string[];
  readonly checklist: readonly Readonly<{
    itemId: string;
    label: string;
    status: 'unconfirmed' | 'worker_confirmed' | 'customer_confirmed';
  }>[];
  readonly materialsResponsibility: string;
  readonly timeAndRateLabel: string;
  readonly totalOrCap: MoneyAmount | null;
  readonly workerConfirmedAt: string | null;
  readonly customerConfirmedAt: string | null;
  readonly startPin: Readonly<{
    status: 'hidden' | 'available' | 'verified' | 'locked';
    value: string | null;
    attemptsRemaining: number | null;
  }>;
}

export interface ScopeConfirmationViewSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly scope: ScopeSnapshot;
}

export interface ChangeOrder {
  readonly changeOrderId: string;
  readonly version: number;
  readonly status: 'draft' | 'pending' | 'approved' | 'declined' | 'expired';
  readonly existingAgreementSummary: string;
  readonly extraDescription: string;
  readonly addedTimeLabel: string | null;
  readonly materialsLabel: string | null;
  readonly baseTotal: MoneyAmount;
  readonly additionalAmount: MoneyAmount;
  readonly revisedTotal: MoneyAmount;
  readonly expiresAt: string | null;
}

export interface ActiveWorkSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly elapsedLabel: string | null;
  readonly currentScope: ScopeSnapshot;
  readonly runningEstimate: MoneyAmount | null;
  readonly changeOrders: readonly ChangeOrder[];
}

export interface CompletionSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly status: 'not_requested' | 'requested' | 'confirmed' | 'disputed' | 'timed_out';
  readonly requestedAt: string | null;
  readonly scopeSummary: string;
  readonly evidenceLabels: readonly string[];
  readonly finalAmount: MoneyAmount | null;
  readonly openIssue: Readonly<{ issueId: string; label: string }> | null;
}

export interface ReceiptSnapshot {
  readonly receiptId: string;
  readonly projectId: string;
  readonly issuedAt: string;
  readonly serviceLabel: string;
  readonly amount: MoneyAmount;
  readonly feeAndTaxLabel: string;
  readonly methodLabel: string;
  readonly statusLabel: string;
  readonly supportReference: string;
}

export interface RatingSnapshot {
  readonly state: 'not_open' | 'open' | 'submitted' | 'published' | 'window_closed';
  readonly selectedValue: 1 | 2 | 3 | 4 | 5 | null;
  readonly reasonLabels: readonly string[];
  readonly publicationLabel: string;
}

export interface RetentionCapabilities {
  readonly relationshipsAvailable: boolean;
  readonly favouriteAllowed: boolean;
  readonly rebookAllowed: boolean;
}

export interface CompletionPaymentViewSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly workerId: string | null;
  readonly completion: CompletionSnapshot;
  readonly payment: PaymentSnapshot;
  readonly receipt: ReceiptSnapshot | null;
  readonly rating: RatingSnapshot;
  readonly retention: RetentionCapabilities;
}

export interface ProjectMessage {
  readonly messageId: string;
  readonly kind: 'customer' | 'worker' | 'system';
  readonly sentAt: string;
  readonly body: string;
  readonly delivery: 'sending' | 'sent' | 'failed' | 'immutable';
  readonly retryKey: string | null;
}

export interface ProjectChatSnapshot {
  readonly projectId: string;
  readonly stateVersion: number;
  readonly otherParticipantName: string;
  readonly serviceLabel: string;
  readonly messages: readonly ProjectMessage[];
  readonly connectionStatus: 'connected' | 'degraded' | 'offline';
  readonly contactAccess: 'masked' | 'revealed' | 'closed';
  readonly readOnly: boolean;
}

export type CustomerProjectCommand =
  | 'cancel_match'
  | 'retry_match'
  | 'select_worker'
  | 'accept_quote'
  | 'request_diagnostic'
  | 'confirm_hourly_match'
  | 'cancel_project'
  | 'reschedule_project'
  | 'confirm_scope'
  | 'decline_scope_revision'
  | 'reveal_start_pin'
  | 'approve_change_order'
  | 'decline_change_order'
  | 'confirm_completion'
  | 'report_issue'
  | 'start_checkout'
  | 'retry_checkout'
  | 'declare_cash_payment'
  | 'submit_rating'
  | 'send_message'
  | 'retry_message'
  | 'favourite_worker'
  | 'start_rebook';

export interface CustomerCommandIntent {
  readonly schemaVersion: typeof CUSTOMER_PROJECT_SCHEMA_VERSION;
  readonly command: CustomerProjectCommand;
  readonly projectId: string;
  readonly stateVersion: number;
  readonly targetId: string | null;
  readonly idempotencyKey: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export type CommandIntentResult =
  | Readonly<{ ok: true; intent: CustomerCommandIntent }>
  | Readonly<{ ok: false; reasonCode: 'offline' | 'invalid_identity' | 'invalid_version' | 'invalid_payload' }>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isStableId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function isSafeRemoteImageUrl(value: string | null): value is string {
  if (value === null || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidIso(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(new Date(value).getTime());
}

function assertMoney(value: MoneyAmount): void {
  if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0 || value.currency !== 'ZAR') {
    throw new TypeError('Money must be a non-negative integer amount in ZAR minor units.');
  }
}

function stableHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stablePayload(payload: Readonly<Record<string, string | number | boolean>>): string {
  return Object.keys(payload)
    .sort()
    .map((key) => `${key}:${String(payload[key])}`)
    .join('|');
}

export function createCustomerCommandIntent(input: Readonly<{
  command: CustomerProjectCommand;
  projectId: string;
  stateVersion: number;
  actorId: string;
  requestKey: string;
  targetId?: string | null;
  payload?: Readonly<Record<string, string | number | boolean>>;
  connectionState: ConnectionState;
}>): CommandIntentResult {
  if (input.connectionState === 'offline') return Object.freeze({ ok: false, reasonCode: 'offline' });
  if (
    !isStableId(input.projectId)
    || !isStableId(input.actorId)
    || !isStableId(input.requestKey)
    || (input.targetId !== undefined && input.targetId !== null && !isStableId(input.targetId))
  ) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_identity' });
  }
  if (!Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_version' });
  }
  const payload = Object.freeze({ ...(input.payload ?? {}) });
  const maximumPayloadTextLength = input.command === 'send_message' ? 2_048 : 1_000;
  if (Object.values(payload).some((value) => (
    (typeof value === 'number' && !Number.isFinite(value))
    || (typeof value === 'string' && value.length > maximumPayloadTextLength)
  ))) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_payload' });
  }
  const targetId = input.targetId ?? null;
  const fingerprint = stableHash([
    input.actorId,
    input.command,
    input.projectId,
    String(input.stateVersion),
    input.requestKey,
    targetId ?? '',
    stablePayload(payload),
  ].join('|'));
  return Object.freeze({
    ok: true,
    intent: Object.freeze({
      schemaVersion: CUSTOMER_PROJECT_SCHEMA_VERSION,
      command: input.command,
      projectId: input.projectId,
      stateVersion: input.stateVersion,
      targetId,
      idempotencyKey: `customer-project:${input.command}:${input.projectId}:v${input.stateVersion}:${fingerprint}`,
      payload,
    }),
  });
}

export function deriveMatchingView(snapshot: MatchingSnapshot): MatchingView {
  if (!isStableId(snapshot.projectId) || !isStableId(snapshot.requestId)) {
    throw new TypeError('Matching snapshot requires stable project and request IDs.');
  }
  if (!Number.isSafeInteger(snapshot.stateVersion) || snapshot.stateVersion < 1) {
    throw new TypeError('Matching snapshot requires a positive state version.');
  }

  if (snapshot.mode === 'fast_match') {
    const copy: Record<FastMatchStatus, Readonly<{ label: string; body: string; terminal: boolean; recovery: 'retry_match' | null }>> = {
      finding_eligible_workers: { label: 'Finding eligible Workers', body: 'Checking real eligibility for this service and area.', terminal: false, recovery: null },
      offer_sent: { label: 'Offer sent', body: 'An eligible Worker has received the timed offer.', terminal: false, recovery: null },
      waiting_for_response: { label: 'Waiting for response', body: 'The offer remains open. You can cancel while we wait.', terminal: false, recovery: null },
      awaiting_customer_rate_confirmation: { label: 'Confirm the matched rate', body: 'Review this Worker’s hourly rate and estimate before the job becomes operational.', terminal: false, recovery: null },
      matched: { label: 'Worker confirmed', body: 'The confirmed Worker is ready in your Project Hub.', terminal: true, recovery: null },
      no_candidates: { label: 'No eligible Workers found', body: 'No eligible Worker is available for this request.', terminal: true, recovery: 'retry_match' },
      all_declined: { label: 'No Worker accepted', body: 'All timed offers closed without an acceptance.', terminal: true, recovery: 'retry_match' },
      expired: { label: 'Request timed out', body: 'The timed request closed without a match.', terminal: true, recovery: 'retry_match' },
      connection_lost: { label: 'Connection lost', body: 'The latest server state could not be confirmed.', terminal: false, recovery: 'retry_match' },
      cancelled: { label: 'Request cancelled', body: 'This Fast Match request is closed.', terminal: true, recovery: null },
    };
    const evidenceMissing = snapshot.status === 'matched' && snapshot.matchedWorker === null;
    const hourlyEvidenceMissing = snapshot.status === 'awaiting_customer_rate_confirmation'
      && (snapshot.matchedWorker === null || snapshot.matchedHourlyTerms === null);
    const state = evidenceMissing || hourlyEvidenceMissing
      ? { label: 'Match details unavailable', body: 'The latest Worker and commercial evidence is incomplete. Refresh before continuing.', terminal: false, recovery: 'retry_match' as const }
      : copy[snapshot.status];
    return Object.freeze({
      title: 'Fast Match',
      statusLabel: state.label,
      body: state.body,
      terminal: state.terminal,
      showCancel: !evidenceMissing && !hourlyEvidenceMissing && !state.terminal && snapshot.status !== 'awaiting_customer_rate_confirmation',
      recovery: Object.freeze({
        action: state.recovery,
        label: state.recovery === 'retry_match' ? 'See other options' : null,
        explanation: state.body,
      }),
      confirmedWorker: snapshot.status === 'matched' && !evidenceMissing ? snapshot.matchedWorker : null,
    });
  }

  if (snapshot.mode === 'compare_workers') {
    const terminal = ['worker_confirmed', 'slot_expired', 'lost_race', 'empty'].includes(snapshot.status);
    const statusLabel = {
      loading: 'Loading available Workers',
      ready: 'Compare available Workers',
      request_sent: 'Request sent',
      worker_confirmed: 'Worker confirmed',
      slot_expired: 'The displayed slot expired',
      lost_race: 'That slot is no longer available',
      empty: 'No Workers to compare',
      error: 'Workers could not be loaded',
    }[snapshot.status];
    const recovery = snapshot.status === 'slot_expired' || snapshot.status === 'lost_race' || snapshot.status === 'empty' || snapshot.status === 'error'
      ? 'retry_match' as const
      : null;
    return Object.freeze({
      title: 'Compare Workers',
      statusLabel,
      body: snapshot.detail ?? (snapshot.status === 'request_sent'
        ? 'The Worker still needs to confirm. This is not an instant booking.'
        : 'Compare consistent evidence before sending a request.'),
      terminal,
      showCancel: snapshot.status === 'request_sent',
      recovery: Object.freeze({ action: recovery, label: recovery ? 'Refresh options' : null, explanation: statusLabel }),
      confirmedWorker: snapshot.status === 'worker_confirmed'
        ? snapshot.workers.find((worker) => worker.workerId === snapshot.selectedWorkerId) ?? null
        : null,
    });
  }

  if (snapshot.mode === 'receive_quotes') {
    const terminal = ['selected', 'no_quotes', 'cancelled'].includes(snapshot.status);
    const statusLabel = {
      loading: 'Loading quotes', waiting: 'Waiting for quotes', partial: 'Quotes are arriving', ready: 'Compare complete quotes',
      selected: 'Quote accepted', withdrawn: 'A quote was withdrawn', expired: 'A quote expired', lost_race: 'That quote was already closed',
      no_quotes: 'No quotes received', cancelled: 'Quote request cancelled', error: 'Quotes could not be loaded',
    }[snapshot.status];
    const recoverable = ['withdrawn', 'expired', 'lost_race', 'no_quotes', 'error'].includes(snapshot.status);
    const selectedQuote = snapshot.status === 'selected'
      ? snapshot.quotes.find((quote) => quote.quoteId === snapshot.selectedQuoteId) ?? null
      : null;
    return Object.freeze({
      title: 'Receive Quotes',
      statusLabel,
      body: snapshot.responseSummary ?? 'Quotes show scope, exclusions, schedule, price and expiry as one complete offer.',
      terminal,
      showCancel: snapshot.status === 'waiting' || snapshot.status === 'partial' || snapshot.status === 'ready',
      recovery: Object.freeze({ action: recoverable ? 'retry_match' : null, label: recoverable ? 'Review alternatives' : null, explanation: statusLabel }),
      confirmedWorker: selectedQuote?.worker ?? null,
    });
  }

  const terminal = snapshot.status === 'confirmed';
  const statusLabel = {
    loading: 'Loading diagnostic visits',
    ready: 'Choose a diagnostic visit',
    request_sent: 'Diagnostic request sent',
    confirmed: 'Diagnostic visit confirmed',
    unavailable: 'No diagnostic visit available',
    error: 'Diagnostic visits could not be loaded',
  }[snapshot.status];
  return Object.freeze({
    title: 'Book Diagnostic Visit',
    statusLabel,
    body: 'The shown fee covers the visit and stated deliverable. Later work is not included.',
    terminal,
    showCancel: snapshot.status === 'request_sent',
    recovery: Object.freeze({
      action: snapshot.status === 'unavailable' || snapshot.status === 'error' ? 'retry_match' : null,
      label: snapshot.status === 'unavailable' || snapshot.status === 'error' ? 'See alternatives' : null,
      explanation: statusLabel,
    }),
    confirmedWorker: snapshot.status === 'confirmed'
      ? snapshot.workers.find((worker) => worker.workerId === snapshot.selectedWorkerId) ?? null
      : null,
  });
}

export function groupProjects(items: readonly ProjectListItem[]): Readonly<Record<ProjectSegment, readonly ProjectListItem[]>> {
  const seen = new Set<string>();
  const groups: Record<ProjectSegment, ProjectListItem[]> = { active: [], upcoming: [], past: [] };
  for (const item of items) {
    if (!isStableId(item.projectId) || seen.has(item.projectId)) {
      throw new TypeError('Project list requires unique stable project IDs.');
    }
    seen.add(item.projectId);
    groups[item.segment].push(Object.freeze({ ...item }));
  }
  return Object.freeze({
    active: Object.freeze(groups.active),
    upcoming: Object.freeze(groups.upcoming),
    past: Object.freeze(groups.past),
  });
}

export function deriveTravelView(
  evidence: TrackingEvidence,
  serverNow: string,
  staleAfterSeconds: number,
): TravelView {
  if (!isValidIso(serverNow) || !Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 1) {
    throw new TypeError('Tracking freshness requires server time and a positive threshold.');
  }
  if (evidence.visibility === 'hidden') {
    return Object.freeze({ kind: 'hidden', title: 'Live location is hidden', body: evidence.reason === 'before_reveal_window'
      ? 'Tracking is shown only when travel is operationally relevant.'
      : 'Location sharing has ended for this Project.', timestampLabel: null, coordinates: null, etaLabel: null, preserveNonMapActions: true });
  }
  if (evidence.visibility === 'not_shared') {
    return Object.freeze({ kind: 'not_shared', title: 'Location is not being shared', body: 'You can still chat, review the Project and contact support.', timestampLabel: null, coordinates: null, etaLabel: null, preserveNonMapActions: true });
  }
  if (evidence.visibility === 'unavailable') {
    return Object.freeze({ kind: 'unavailable', title: 'Location unavailable', body: 'The latest position could not be loaded. Other Project actions remain available.', timestampLabel: evidence.lastKnownAt, coordinates: null, etaLabel: null, preserveNonMapActions: true });
  }
  if (!isValidIso(evidence.capturedAt)) throw new TypeError('Tracking evidence requires a valid captured timestamp.');
  const ageSeconds = Math.max(0, (new Date(serverNow).getTime() - new Date(evidence.capturedAt).getTime()) / 1_000);
  const stale = ageSeconds > staleAfterSeconds;
  return Object.freeze({
    kind: stale ? 'stale' : 'live',
    title: stale ? 'Last known location' : 'Worker on the way',
    body: stale ? 'This position is older than the live-location freshness window.' : 'This position is current within the configured freshness window.',
    timestampLabel: evidence.capturedAt,
    coordinates: Object.freeze({ latitude: evidence.latitude, longitude: evidence.longitude }),
    etaLabel: stale ? null : evidence.etaLabel,
    preserveNonMapActions: true,
  });
}

export function derivePrivacyView(input: Readonly<{
  phase: OperationalPhase;
  exactRevealAuthorised: boolean;
  contactRevealAuthorised: boolean;
}>): PrivacyView {
  if (input.phase === 'closed') {
    return Object.freeze({ workerAddressAccess: 'closed', contactAccess: 'closed', explanation: 'Operational address and contact access has closed.' });
  }
  const address = input.exactRevealAuthorised ? 'exact_revealed' : 'broad_area_only';
  const contact = input.contactRevealAuthorised ? 'revealed' : 'masked';
  return Object.freeze({
    workerAddressAccess: address,
    contactAccess: contact,
    explanation: input.exactRevealAuthorised
      ? 'The exact job address is available for the authorised operational window.'
      : 'The Worker sees only the broad area until the authorised route or lead-time window.',
  });
}

export function deriveScopeReadiness(scope: ScopeSnapshot, connectionState: ConnectionState): Readonly<{
  canConfirm: boolean;
  canRevealPin: boolean;
  canStart: boolean;
  reason: string;
}> {
  if (connectionState === 'offline') {
    return Object.freeze({ canConfirm: false, canRevealPin: false, canStart: false, reason: 'Reconnect before confirming scope or starting work.' });
  }
  const canConfirm = scope.status === 'worker_confirmed'
    || scope.status === 'revision_requested'
    || scope.status === 'pending_customer';
  const canRevealPin = scope.status === 'confirmed' && scope.workerConfirmedAt !== null && scope.customerConfirmedAt !== null;
  const canStart = canRevealPin
    && scope.startPin.status === 'available'
    && scope.startPin.value !== null
    && /^\d{4,8}$/.test(scope.startPin.value);
  return Object.freeze({
    canConfirm,
    canRevealPin,
    canStart,
    reason: canStart
      ? 'Both parties confirmed this scope. Use the server-issued PIN to start.'
      : canRevealPin
        ? 'Scope is confirmed. Waiting for an available server-issued PIN.'
        : 'Both parties must confirm the same scope version before the PIN is available.',
  });
}

export function validateChangeOrder(order: ChangeOrder): Readonly<{ valid: boolean; reasonCode: string | null }> {
  if (!isStableId(order.changeOrderId) || !Number.isSafeInteger(order.version) || order.version < 1) {
    return Object.freeze({ valid: false, reasonCode: 'invalid_identity' });
  }
  try {
    assertMoney(order.baseTotal);
    assertMoney(order.additionalAmount);
    assertMoney(order.revisedTotal);
  } catch {
    return Object.freeze({ valid: false, reasonCode: 'invalid_money' });
  }
  const sameCurrency = order.baseTotal.currency === order.additionalAmount.currency
    && order.additionalAmount.currency === order.revisedTotal.currency;
  if (!sameCurrency) return Object.freeze({ valid: false, reasonCode: 'currency_mismatch' });
  if (order.baseTotal.amountMinor + order.additionalAmount.amountMinor !== order.revisedTotal.amountMinor) {
    return Object.freeze({ valid: false, reasonCode: 'revised_total_mismatch' });
  }
  return Object.freeze({ valid: true, reasonCode: null });
}

export function derivePaymentView(payment: PaymentSnapshot): Readonly<{
  statusLabel: string;
  body: string;
  canStartCheckout: boolean;
  canRetryCheckout: boolean;
  isServerVerifiedPaid: boolean;
}> {
  if (payment.obligationStatus === 'unknown') {
    return Object.freeze({
      statusLabel: 'Payment status unavailable',
      body: 'Refresh before making a payment decision. No paid or payable state is being assumed.',
      canStartCheckout: false,
      canRetryCheckout: false,
      isServerVerifiedPaid: false,
    });
  }
  const isPaid = payment.obligationStatus === 'paid'
    && (payment.attemptStatus === 'successful' || payment.cashStatus === 'worker_confirmed');
  if (isPaid) {
    return Object.freeze({
      statusLabel: payment.providerReturnState === 'corrected_late_success' ? 'Payment confirmed after reconciliation' : 'Payment confirmed',
      body: 'The server has verified this payment.',
      canStartCheckout: false,
      canRetryCheckout: false,
      isServerVerifiedPaid: true,
    });
  }
  if (payment.attemptStatus === 'pending' || payment.attemptStatus === 'uncertain' || payment.providerReturnState === 'awaiting_reconciliation') {
    return Object.freeze({ statusLabel: 'Awaiting payment status', body: 'TOGT is reconciling the provider result. Do not pay again yet.', canStartCheckout: false, canRetryCheckout: false, isServerVerifiedPaid: false });
  }
  if (payment.providerReturnState === 'browser_handoff') {
    return Object.freeze({ statusLabel: 'Secure checkout is open', body: 'Complete or cancel the hosted checkout, then return to TOGT for server verification.', canStartCheckout: false, canRetryCheckout: false, isServerVerifiedPaid: false });
  }
  if (payment.obligationStatus !== 'due' && payment.obligationStatus !== 'partially_paid') {
    return Object.freeze({ statusLabel: 'No online payment due', body: 'No payable online obligation is currently recorded.', canStartCheckout: false, canRetryCheckout: false, isServerVerifiedPaid: false });
  }
  if (payment.checkoutCapability === 'unavailable') {
    return Object.freeze({ statusLabel: 'Online checkout unavailable', body: payment.checkoutUnavailableReason ?? 'Online checkout is not enabled for this build.', canStartCheckout: false, canRetryCheckout: false, isServerVerifiedPaid: false });
  }
  const canRetry = payment.attemptStatus === 'failed' || payment.attemptStatus === 'cancelled';
  return Object.freeze({
    statusLabel: canRetry ? 'Payment not completed' : 'Payment due',
    body: canRetry ? 'You can safely try checkout again with a new provider attempt.' : 'Review the final amount before opening secure checkout.',
    canStartCheckout: !canRetry,
    canRetryCheckout: canRetry,
    isServerVerifiedPaid: false,
  });
}

export function validateWorkerChoice(worker: WorkerChoice): Readonly<{ valid: boolean; issues: readonly string[] }> {
  const issues: string[] = [];
  if (!isStableId(worker.workerId)) issues.push('worker_id');
  if (!isStableId(worker.serviceId) || worker.serviceVersion < 1 || !Number.isSafeInteger(worker.serviceVersion)) issues.push('service_identity');
  if (worker.displayName.trim().length === 0) issues.push('display_name');
  if (worker.rating && (worker.rating.average < 1 || worker.rating.average > 5 || worker.rating.count < 1)) issues.push('rating');
  if (worker.completedJobs !== null && (!Number.isSafeInteger(worker.completedJobs) || worker.completedJobs < 0)) issues.push('completed_jobs');
  if (worker.photoUrl !== null && !isSafeRemoteImageUrl(worker.photoUrl)) issues.push('photo_url');
  if (worker.price.kind === 'quote' && (!isStableId(worker.price.quoteId) || worker.price.quoteVersion < 1)) issues.push('quote_identity');
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function canShowRetentionActions(input: Readonly<{
  completion: CompletionSnapshot;
  payment: PaymentSnapshot;
  capabilities: RetentionCapabilities;
}>): Readonly<{ favourite: boolean; rebook: boolean }> {
  const completeAndPaid = input.completion.status === 'confirmed'
    && input.payment.obligationStatus === 'paid'
    && (input.payment.attemptStatus === 'successful' || input.payment.cashStatus === 'worker_confirmed');
  return Object.freeze({
    favourite: completeAndPaid && input.capabilities.relationshipsAvailable && input.capabilities.favouriteAllowed,
    rebook: completeAndPaid && input.capabilities.relationshipsAvailable && input.capabilities.rebookAllowed,
  });
}
