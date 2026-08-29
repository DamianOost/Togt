export const WORKER_SHELL_SCHEMA_VERSION = 1 as const;

export type ConnectionState = 'online' | 'offline';
export type EvidenceSource = 'server' | 'server_ledger' | 'server_payout';

export type SupportedEvidence<T, Source extends EvidenceSource = 'server'> = Readonly<{
  status: 'supported';
  source: Source;
  observedAt: string;
  value: T;
}>;

export type UnavailableEvidence = Readonly<{
  status: 'unavailable' | 'unknown';
  reasonCode: string;
  explanation: string;
}>;

export type Evidence<T, Source extends EvidenceSource = 'server'> =
  | SupportedEvidence<T, Source>
  | UnavailableEvidence;

export type ResourceState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; title: string; message: string; correlationId: string | null }>
  | Readonly<{ status: 'empty'; title: string; message: string }>
  | Readonly<{ status: 'ready'; value: T }>;

export type ZarAmount = Readonly<{
  currency: 'ZAR';
  amountMinor: number;
}>;

export type DurationEstimate = Readonly<{
  minimumMinutes: number;
  maximumMinutes: number;
}>;

export type TravelEstimate = Readonly<{
  distanceMetres: number;
  durationMinutes: number;
  calculatedAt: string;
}>;

export type JobSchedule = Readonly<{
  kind: 'now' | 'scheduled';
  startsAt: string | null;
  timezone: 'Africa/Johannesburg';
}>;

export type CustomerTrustEvidence = Readonly<{
  kind:
    | 'verified_contact'
    | 'verified_account'
    | 'completed_jobs'
    | 'cancellation_context'
    | 'no_show_context'
    | 'worker_rating';
  label: string;
}>;

export type WorkerAvailabilityState = 'online' | 'offline';
export type FastMatchEligibilityState = 'eligible' | 'heartbeat_stale' | 'ineligible';
export type WorkerIdentityState = 'verified' | 'verification_pending' | 'unverified';

export type ActivationPrompt = Readonly<{
  state: 'ready' | 'action_required' | 'review_in_progress';
  title: string;
  explanation: string;
  remainingItemCount: number;
}>;

export type WorkerJobPhase =
  | 'scheduled'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'scope_confirmation'
  | 'active'
  | 'completion_review'
  | 'payment_pending'
  | 'closed'
  | 'cancelled';

export type PaymentState =
  | 'not_due'
  | 'due'
  | 'processing'
  | 'awaiting_reconciliation'
  | 'paid_online'
  | 'cash_declared'
  | 'cash_confirmed'
  | 'cash_disputed'
  | 'refunded'
  | 'disputed';

export type PayoutState =
  | 'not_eligible'
  | 'eligible'
  | 'scheduled'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'reversed';

export type WorkerJobSummary = Readonly<{
  jobId: string;
  serviceLabel: Evidence<string>;
  phase: Evidence<WorkerJobPhase>;
  customerDisplayName: Evidence<string>;
  broadArea: Evidence<string>;
  schedule: Evidence<JobSchedule>;
  travel: Evidence<TravelEstimate>;
  scopeSummary: Evidence<string>;
  paymentState: Evidence<PaymentState>;
  expectedNet: Evidence<ZarAmount, 'server_ledger'>;
}>;

export type WorkerTodaySnapshot = Readonly<{
  schemaVersion: typeof WORKER_SHELL_SCHEMA_VERSION;
  workerId: string;
  displayName: string;
  profileImageUri: string | null;
  identity: Evidence<WorkerIdentityState>;
  availability: Evidence<WorkerAvailabilityState>;
  fastMatchEligibility: Evidence<FastMatchEligibilityState>;
  nextJob: Evidence<WorkerJobSummary | null>;
  weeklyNet: Evidence<ZarAmount, 'server_ledger'>;
  newOfferCount: Evidence<number>;
  activation: Evidence<ActivationPrompt>;
  lastUpdatedAt: string;
}>;

export type AvailabilityPresentation = Readonly<{
  state: WorkerAvailabilityState | 'unknown';
  eligibility: FastMatchEligibilityState | 'unknown';
  showSwitch: boolean;
  switchValue: boolean | null;
  canRequestChange: boolean;
  statusCode:
    | 'online'
    | 'online_reconnect'
    | 'online_ineligible'
    | 'offline'
    | 'availability_unknown';
}>;

export function isSupported<T, Source extends EvidenceSource>(
  evidence: Evidence<T, Source>,
): evidence is SupportedEvidence<T, Source> {
  return evidence.status === 'supported';
}

export function deriveAvailabilityPresentation(
  snapshot: Pick<WorkerTodaySnapshot, 'availability' | 'fastMatchEligibility'>,
  context: Readonly<{ connection: ConnectionState; requestPending: boolean }>,
): AvailabilityPresentation {
  if (!isSupported(snapshot.availability)) {
    return Object.freeze({
      state: 'unknown',
      eligibility: 'unknown',
      showSwitch: false,
      switchValue: null,
      canRequestChange: false,
      statusCode: 'availability_unknown',
    });
  }

  const availability = snapshot.availability.value;
  const eligibility = isSupported(snapshot.fastMatchEligibility)
    ? snapshot.fastMatchEligibility.value
    : 'unknown';
  let statusCode: AvailabilityPresentation['statusCode'] = availability;
  if (availability === 'online' && eligibility === 'heartbeat_stale') {
    statusCode = 'online_reconnect';
  } else if (availability === 'online' && eligibility === 'ineligible') {
    statusCode = 'online_ineligible';
  }

  return Object.freeze({
    state: availability,
    eligibility,
    showSwitch: true,
    switchValue: availability === 'online',
    canRequestChange: context.connection === 'online' && !context.requestPending,
    statusCode,
  });
}

export type PricingMode = 'fixed' | 'hourly' | 'remote_quote' | 'diagnostic_visit';
export type MatchingMode = 'fast_match' | 'scheduled_request';

export type OfferCommercialBreakdown = Readonly<{
  currency: 'ZAR';
  grossMinor: number;
  platformFeeMinor: number;
  expectedNetMinor: number;
  pricingMode: PricingMode;
  ledgerDefinition: string;
}>;

export type OfferServerStatus = 'open' | 'accepted' | 'declined' | 'expired' | 'taken' | 'withdrawn';
export type AcceptancePermission = Readonly<{
  allowed: boolean;
  reasonCode: string;
  explanation: string;
}>;

type OfferCore = Readonly<{
  offerId: string;
  serviceLabel: Evidence<string>;
  serverStatus: Evidence<OfferServerStatus>;
  cacheFreshness: Evidence<'fresh' | 'stale'>;
  acceptancePermission: Evidence<AcceptancePermission>;
  customerDisplayName: Evidence<string>;
  customerTrust: Evidence<readonly CustomerTrustEvidence[]>;
  broadArea: Evidence<string>;
  travel: Evidence<TravelEstimate>;
  schedule: Evidence<JobSchedule>;
  expectedDuration: Evidence<DurationEstimate>;
  scopeSummary: Evidence<string>;
  attachmentCount: Evidence<number>;
  commercial: Evidence<OfferCommercialBreakdown, 'server_ledger'>;
}>;

export type InstantOffer = OfferCore & Readonly<{
  kind: 'instant';
  matchingMode: 'fast_match';
  serverExpiresAt: Evidence<string>;
}>;

export type ScheduledRequest = OfferCore & Readonly<{
  kind: 'scheduled';
  matchingMode: 'scheduled_request';
  serverRespondBy: Evidence<string>;
}>;

export type WorkerOffer = InstantOffer | ScheduledRequest;

export type OfferActionPresentation = Readonly<{
  canAttemptAccept: boolean;
  canDeclineManually: boolean;
  requiresRefresh: boolean;
  clientSideDecline: false;
  statusCode:
    | 'open'
    | 'offline'
    | 'status_unknown'
    | 'stale_cache'
    | 'expiry_unknown'
    | 'window_elapsed_refresh'
    | 'acceptance_blocked'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'taken'
    | 'withdrawn';
  expiryKind: 'instant_window' | 'scheduled_deadline';
  remainingMinutes: number | null;
  deadlineAt: string | null;
}>;

function parseIso(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveOfferActionPresentation(
  offer: WorkerOffer,
  context: Readonly<{ serverNow: string; connection: ConnectionState }>,
): OfferActionPresentation {
  const expiryKind: OfferActionPresentation['expiryKind'] = offer.kind === 'instant'
    ? 'instant_window'
    : 'scheduled_deadline';
  const deadlineEvidence = offer.kind === 'instant' ? offer.serverExpiresAt : offer.serverRespondBy;
  const serverNow = parseIso(context.serverNow);
  const deadlineAt = isSupported(deadlineEvidence) ? deadlineEvidence.value : null;
  const deadline = deadlineAt === null ? null : parseIso(deadlineAt);
  const remainingMinutes = serverNow !== null && deadline !== null
    ? Math.max(0, Math.ceil((deadline - serverNow) / 60_000))
    : null;
  const base = {
    clientSideDecline: false as const,
    expiryKind,
    remainingMinutes,
    deadlineAt,
  };

  if (!isSupported(offer.serverStatus)) {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: false,
      requiresRefresh: true,
      statusCode: 'status_unknown',
    });
  }

  if (offer.serverStatus.value !== 'open') {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: false,
      requiresRefresh: false,
      statusCode: offer.serverStatus.value,
    });
  }

  if (!isSupported(offer.cacheFreshness) || offer.cacheFreshness.value !== 'fresh') {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: false,
      requiresRefresh: context.connection === 'online',
      statusCode: 'stale_cache',
    });
  }

  if (!isSupported(deadlineEvidence) || serverNow === null || deadline === null) {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: context.connection === 'online',
      requiresRefresh: true,
      statusCode: 'expiry_unknown',
    });
  }

  if (deadline <= serverNow) {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: false,
      requiresRefresh: true,
      statusCode: 'window_elapsed_refresh',
    });
  }

  if (context.connection === 'offline') {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: false,
      requiresRefresh: false,
      statusCode: 'offline',
    });
  }

  if (!isSupported(offer.acceptancePermission) || !offer.acceptancePermission.value.allowed) {
    return Object.freeze({
      ...base,
      canAttemptAccept: false,
      canDeclineManually: true,
      requiresRefresh: offer.acceptancePermission.status !== 'supported',
      statusCode: 'acceptance_blocked',
    });
  }

  return Object.freeze({
    ...base,
    canAttemptAccept: true,
    canDeclineManually: true,
    requiresRefresh: false,
    statusCode: 'open',
  });
}

export type JobsInboxSegment = 'offers' | 'upcoming' | 'active' | 'history';

export type JobsInboxSnapshot = Readonly<{
  offers: ResourceState<readonly WorkerOffer[]>;
  upcoming: ResourceState<readonly WorkerJobSummary[]>;
  active: ResourceState<readonly WorkerJobSummary[]>;
  history: ResourceState<readonly WorkerJobSummary[]>;
  lastUpdatedAt: string | null;
}>;

export type EarningsTotals = Readonly<{
  currency: 'ZAR';
  ledgerDefinition: string;
  pendingMinor: number;
  thisWeekNetMinor: number;
  grossMinor: number;
  platformFeeMinor: number;
  netMinor: number;
  cashConfirmedMinor: number;
  platformPaidMinor: number;
}>;

export type PaymentBackedJobValueTotals = Readonly<{
  currency: 'ZAR';
  confirmedPaidMinor: number;
  pendingPaidEvidenceMinor: number;
  completedJobValueMinor: number;
  definition: 'completed_job_value_payment_evidence_not_worker_net';
}>;

export type CompletedJobLedgerRow = Readonly<{
  ledgerEntryId: string;
  jobId: string;
  serviceLabel: string;
  completedAt: string;
  ledgerState: 'recognised' | 'reversed';
  latestReasonCode: string;
  adjustmentCount: number;
  reconciledPaidJobValue: ZarAmount;
  workerGross: Evidence<ZarAmount, 'server_ledger'>;
  platformFee: Evidence<ZarAmount, 'server_ledger'>;
  net: Evidence<ZarAmount, 'server_ledger'>;
  paymentState: PaymentState;
  payoutState: PayoutState | null;
  paymentMethod: 'online' | 'cash';
}>;

export type PayoutCapability = Readonly<{
  state: 'operational' | 'not_operational';
  beneficiaryVerification: 'verified' | 'pending' | 'failed' | 'not_configured';
  reconciliation: 'operational' | 'not_operational';
}>;

export type NextPayout = Readonly<{
  state: PayoutState;
  amount: ZarAmount;
  expectedAt: string | null;
}>;

export type EarningsSnapshot = Readonly<{
  schemaVersion: typeof WORKER_SHELL_SCHEMA_VERSION;
  totals: Evidence<EarningsTotals, 'server_ledger'>;
  paymentEvidence: Evidence<PaymentBackedJobValueTotals, 'server_ledger'>;
  completedJobs: readonly CompletedJobLedgerRow[];
  ledgerNotice: string | null;
  payoutCapability: Evidence<PayoutCapability, 'server_payout'>;
  availableBalance: Evidence<ZarAmount, 'server_payout'>;
  nextPayout: Evidence<NextPayout, 'server_payout'>;
  lastUpdatedAt: string;
}>;

export type PayoutVisibility = Readonly<{
  showAvailableBalance: boolean;
  availableBalance: ZarAmount | null;
  showNextPayout: boolean;
  nextPayout: NextPayout | null;
  operational: boolean;
}>;

export function derivePayoutVisibility(snapshot: Pick<
  EarningsSnapshot,
  'payoutCapability' | 'availableBalance' | 'nextPayout'
>): PayoutVisibility {
  const operational = isSupported(snapshot.payoutCapability)
    && snapshot.payoutCapability.value.state === 'operational'
    && snapshot.payoutCapability.value.beneficiaryVerification === 'verified'
    && snapshot.payoutCapability.value.reconciliation === 'operational';
  const availableBalance = operational && isSupported(snapshot.availableBalance)
    ? snapshot.availableBalance.value
    : null;
  const nextPayout = operational
    && isSupported(snapshot.nextPayout)
    && (snapshot.nextPayout.value.state === 'scheduled' || snapshot.nextPayout.value.state === 'processing')
    && snapshot.nextPayout.value.expectedAt !== null
    ? snapshot.nextPayout.value
    : null;

  return Object.freeze({
    operational,
    showAvailableBalance: availableBalance !== null,
    availableBalance,
    showNextPayout: nextPayout !== null,
    nextPayout,
  });
}

export type LedgerRowPresentation = Readonly<{
  category: 'pending' | 'platform_paid' | 'cash' | 'issue';
  paymentState: PaymentState;
  payoutState: PayoutState | null;
}>;

export function deriveLedgerRowPresentation(row: CompletedJobLedgerRow): LedgerRowPresentation {
  if (row.paymentMethod === 'cash') {
    if (row.payoutState !== null) {
      return Object.freeze({
        category: 'issue',
        paymentState: row.paymentState,
        payoutState: row.payoutState,
      });
    }
    return Object.freeze({
      category: row.paymentState === 'cash_confirmed'
        ? 'cash'
        : row.paymentState === 'cash_declared'
          ? 'pending'
          : 'issue',
      paymentState: row.paymentState,
      payoutState: null,
    });
  }

  if (
    row.paymentState === 'cash_declared'
    || row.paymentState === 'cash_confirmed'
    || row.paymentState === 'cash_disputed'
  ) {
    return Object.freeze({
      category: 'issue',
      paymentState: row.paymentState,
      payoutState: row.payoutState,
    });
  }

  if (row.paymentState === 'paid_online') {
    return Object.freeze({
      category: row.payoutState === 'failed' || row.payoutState === 'reversed' ? 'issue' : 'platform_paid',
      paymentState: row.paymentState,
      payoutState: row.payoutState,
    });
  }

  return Object.freeze({
    category: row.paymentState === 'disputed' || row.paymentState === 'refunded' ? 'issue' : 'pending',
    paymentState: row.paymentState,
    payoutState: row.payoutState,
  });
}

export function isValidZarAmount(value: ZarAmount): boolean {
  return value.currency === 'ZAR'
    && Number.isSafeInteger(value.amountMinor)
    && value.amountMinor >= 0;
}

export function hasValidOfferCommercialBreakdown(value: OfferCommercialBreakdown): boolean {
  return value.currency === 'ZAR'
    && Number.isSafeInteger(value.grossMinor)
    && Number.isSafeInteger(value.platformFeeMinor)
    && Number.isSafeInteger(value.expectedNetMinor)
    && value.grossMinor >= 0
    && value.platformFeeMinor >= 0
    && value.expectedNetMinor >= 0
    && value.expectedNetMinor === value.grossMinor - value.platformFeeMinor
    && value.ledgerDefinition.trim().length > 0;
}

export function hasValidEarningsTotals(value: EarningsTotals): boolean {
  const amounts = [
    value.pendingMinor,
    value.thisWeekNetMinor,
    value.grossMinor,
    value.platformFeeMinor,
    value.netMinor,
    value.cashConfirmedMinor,
    value.platformPaidMinor,
  ];
  return value.currency === 'ZAR'
    && value.ledgerDefinition.trim().length > 0
    && amounts.every((amount) => Number.isSafeInteger(amount) && amount >= 0)
    && value.netMinor === value.grossMinor - value.platformFeeMinor;
}
