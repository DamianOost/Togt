import type {
  ActivationSnapshot,
} from '../../features/worker/lifecycle';
import type {
  AcceptancePermission,
  CompletedJobLedgerRow,
  CustomerTrustEvidence,
  EarningsSnapshot,
  EarningsTotals,
  Evidence,
  EvidenceSource,
  FastMatchEligibilityState,
  JobsInboxSnapshot,
  NextPayout,
  OfferCommercialBreakdown,
  PaymentBackedJobValueTotals,
  PaymentState,
  PayoutCapability,
  TravelEstimate,
  WorkerAvailabilityState,
  WorkerIdentityState,
  WorkerJobPhase,
  WorkerJobSummary,
  WorkerOffer,
  WorkerTodaySnapshot,
  ZarAmount,
} from '../../features/worker/shell';
import type { WorkerProfileBundle } from './workerProfile';

const PROJECT_SCHEMA = 'togt.project.v1';
const OFFER_SCHEMA = 'togt.worker-offers.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type WorkerShellAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_worker_shell_contract'; field: string }>;

export type WorkerAvailabilityRecord = Readonly<{
  workerId: string;
  availability: WorkerAvailabilityState;
  observedAt: string;
}>;

export type WorkerJobsBundle = Readonly<{
  upcoming: readonly WorkerJobSummary[];
  active: readonly WorkerJobSummary[];
  history: readonly WorkerJobSummary[];
  observedAt: string;
}>;

export type WorkerOffersBundle = Readonly<{
  offers: readonly WorkerOffer[];
  serverNow: string;
}>;

class ContractFailure extends Error {
  readonly field: string;

  constructor(field: string) {
    super(field);
    this.field = field;
  }
}

function invalid(error: unknown): WorkerShellAdaptResult<never> {
  return Object.freeze({
    ok: false,
    reasonCode: 'invalid_worker_shell_contract',
    field: error instanceof ContractFailure ? error.field : 'unknown',
  });
}

function record(value: unknown, field: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ContractFailure(field);
  return value as JsonRecord;
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ContractFailure(field);
  return value;
}

function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ContractFailure(field);
  return value.toLowerCase();
}

function iso(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new ContractFailure(field);
  return new Date(value).toISOString();
}

function optionalIso(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : iso(value, field);
}

function text(value: unknown, field: string, maximum = 1_000): string {
  if (typeof value !== 'string') throw new ContractFailure(field);
  const candidate = value.trim();
  if (!candidate || candidate.length > maximum) throw new ContractFailure(field);
  return candidate;
}

function stableToken(value: unknown, field: string): string {
  const candidate = text(value, field, 128);
  if (!/^[a-z][a-z0-9_.:-]{0,127}$/.test(candidate)) throw new ContractFailure(field);
  return candidate;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ContractFailure(field);
  return value;
}

function whole(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ContractFailure(field);
  return Number(value);
}

function positiveWhole(value: unknown, field: string): number {
  const parsed = whole(value, field);
  if (parsed < 1) throw new ContractFailure(field);
  return parsed;
}

function majorAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new ContractFailure(field);
  return value;
}

function supported<T, Source extends EvidenceSource = 'server'>(
  value: T,
  observedAt: string,
  source: Source = 'server' as Source,
): Evidence<T, Source> {
  return Object.freeze({ status: 'supported', source, observedAt, value });
}

function unavailable<T, Source extends EvidenceSource = 'server'>(
  reasonCode: string,
  explanation: string,
  _source?: Source,
): Evidence<T, Source> {
  return Object.freeze({ status: 'unavailable', reasonCode, explanation });
}

function decimalMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [wholePart = '', fraction = ''] = raw.split('.');
  const result = (Number(wholePart) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function signedDecimalMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^-?(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const parsed = decimalMinor(unsigned);
  return parsed === null ? null : negative ? -parsed : parsed;
}

function unavailableLedgerMoney(
  value: unknown,
  field: string,
  explanation: string,
): Evidence<ZarAmount, 'server_ledger'> {
  const source = record(value, field);
  if (source.state !== 'unavailable' || source.amount !== null) throw new ContractFailure(field);
  return unavailable(
    stableToken(source.reasonCode, `${field}.reasonCode`),
    explanation,
    'server_ledger',
  );
}

function workerNetEvidence(commercialRaw: unknown, observedAt: string): Evidence<Readonly<{ currency: 'ZAR'; amountMinor: number }>, 'server_ledger'> {
  if (!commercialRaw || typeof commercialRaw !== 'object' || Array.isArray(commercialRaw)) {
    return unavailable('worker_ledger_not_returned', 'No server-authoritative Worker-net amount was returned.', 'server_ledger');
  }
  const commercial = commercialRaw as JsonRecord;
  const workerNetRaw = commercial.workerNet;
  if (!workerNetRaw || typeof workerNetRaw !== 'object' || Array.isArray(workerNetRaw)) {
    return unavailable('worker_ledger_not_returned', 'No server-authoritative Worker-net amount was returned.', 'server_ledger');
  }
  const workerNet = workerNetRaw as JsonRecord;
  const amountMinor = workerNet.state === 'available' ? decimalMinor(workerNet.amount) : null;
  if (commercial.currency !== 'ZAR' || amountMinor === null) {
    return unavailable('worker_ledger_not_available', 'The accepted agreement does not contain an available Worker-net amount.', 'server_ledger');
  }
  return supported(Object.freeze({ currency: 'ZAR' as const, amountMinor }), observedAt, 'server_ledger');
}

function paymentEvidence(raw: unknown, observedAt: string): Evidence<PaymentState> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return unavailable('payment_state_not_returned', 'No current payment state was returned.');
  }
  const status = (raw as JsonRecord).status;
  const mapped: Readonly<Record<string, PaymentState>> = Object.freeze({
    not_created: 'not_due',
    pending: 'processing',
    paid: 'paid_online',
    failed: 'due',
    refunded: 'refunded',
  });
  return typeof status === 'string' && mapped[status]
    ? supported(mapped[status], observedAt)
    : unavailable('payment_state_unrecognised', 'The server returned an unsupported payment state.');
}

function jobPhase(rawPhase: unknown, transactionStatus: unknown): WorkerJobPhase | null {
  if (transactionStatus === 'cancelled' || transactionStatus === 'terminated_after_start') return 'cancelled';
  const mapped: Readonly<Record<string, WorkerJobPhase>> = Object.freeze({
    assigned: 'accepted',
    scheduled: 'scheduled',
    en_route: 'en_route',
    arrived: 'arrived',
    scope_confirmation: 'scope_confirmation',
    work_active: 'active',
    completion_review: 'completion_review',
    payment_pending: 'payment_pending',
    closed: 'closed',
  });
  return typeof rawPhase === 'string' ? mapped[rawPhase] ?? null : null;
}

function adaptProject(value: unknown, index: number): Readonly<{ segment: 'upcoming' | 'active' | 'history'; job: WorkerJobSummary; updatedAt: string }> {
  const field = `projects[${index}]`;
  const source = record(value, field);
  if (source.schema !== PROJECT_SCHEMA) throw new ContractFailure(`${field}.schema`);
  const projectId = id(source.id, `${field}.id`);
  const updatedAt = iso(source.updatedAt, `${field}.updatedAt`);
  const segmentRaw = source.segment;
  const segment = segmentRaw === 'upcoming' ? 'upcoming' : segmentRaw === 'active' ? 'active' : segmentRaw === 'past' ? 'history' : null;
  if (!segment) throw new ContractFailure(`${field}.segment`);
  const service = record(source.service, `${field}.service`);
  const operational = record(source.operational, `${field}.operational`);
  const participants = record(source.participants, `${field}.participants`);
  const customer = record(participants.customer, `${field}.participants.customer`);
  const schedule = record(source.schedule, `${field}.schedule`);
  const startsAt = iso(schedule.startsAt, `${field}.schedule.startsAt`);
  const phase = jobPhase(operational.phase, source.transactionalStatus);
  const area = record(source.area, `${field}.area`);
  const broadArea = area.precision === 'approximate' && typeof area.label === 'string' && area.label.trim()
    ? supported(text(area.label, `${field}.area.label`, 160), updatedAt)
    : unavailable<string>('broad_area_not_returned', 'Open the Job for any currently authorised location detail.');
  const commercial = record(source.commercial, `${field}.commercial`);
  const acceptedQuote = commercial.acceptedQuote && typeof commercial.acceptedQuote === 'object' && !Array.isArray(commercial.acceptedQuote)
    ? commercial.acceptedQuote as JsonRecord
    : null;

  return Object.freeze({
    segment,
    updatedAt,
    job: Object.freeze({
      jobId: projectId,
      serviceLabel: supported(text(service.label, `${field}.service.label`, 160), updatedAt),
      phase: phase
        ? supported(phase, updatedAt)
        : unavailable<WorkerJobPhase>('worker_phase_not_supported', 'The current Project phase is not a supported Jobs-inbox phase.'),
      customerDisplayName: supported(text(customer.displayName, `${field}.participants.customer.displayName`, 80), updatedAt),
      broadArea,
      schedule: supported(Object.freeze({
        kind: 'scheduled' as const,
        startsAt,
        timezone: 'Africa/Johannesburg' as const,
      }), updatedAt),
      travel: unavailable<TravelEstimate>('travel_estimate_not_returned', 'No server-calculated distance or travel time was returned.'),
      scopeSummary: unavailable<string>('scope_summary_not_returned', 'Open the Job to review the authorised scope.'),
      paymentState: paymentEvidence(source.payment, updatedAt),
      expectedNet: workerNetEvidence(acceptedQuote?.commercial, updatedAt),
    }),
  });
}

export function adaptWorkerAvailabilityV1(
  value: unknown,
  observedAtValue: unknown,
): WorkerShellAdaptResult<WorkerAvailabilityRecord> {
  try {
    const root = record(value, 'availability');
    const profile = record(root.profile, 'availability.profile');
    const workerId = id(profile.user_id ?? profile.id, 'availability.profile.user_id');
    const isAvailable = boolean(profile.is_available, 'availability.profile.is_available');
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        workerId,
        availability: isAvailable ? 'online' : 'offline',
        observedAt: iso(observedAtValue, 'availability.observedAt'),
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

export function adaptWorkerJobsV1(
  value: unknown,
  observedAtValue: unknown,
): WorkerShellAdaptResult<WorkerJobsBundle> {
  try {
    const root = record(value, 'jobs');
    if (root.schema !== PROJECT_SCHEMA) throw new ContractFailure('jobs.schema');
    const observedAt = iso(observedAtValue, 'jobs.observedAt');
    const projects = array(root.projects, 'jobs.projects').map(adaptProject);
    const meta = record(root.meta, 'jobs.meta');
    if (whole(meta.count, 'jobs.meta.count') !== projects.length) throw new ContractFailure('jobs.meta.count');
    const bySegment = (segment: 'upcoming' | 'active' | 'history') => {
      const items = projects.filter((project) => project.segment === segment);
      if (segment === 'upcoming') {
        items.sort((left, right) => {
          const leftStart = left.job.schedule.status === 'supported' && left.job.schedule.value.startsAt
            ? Date.parse(left.job.schedule.value.startsAt)
            : Number.POSITIVE_INFINITY;
          const rightStart = right.job.schedule.status === 'supported' && right.job.schedule.value.startsAt
            ? Date.parse(right.job.schedule.value.startsAt)
            : Number.POSITIVE_INFINITY;
          return leftStart - rightStart;
        });
      }
      return Object.freeze(items.map((project) => project.job));
    };
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        upcoming: bySegment('upcoming'),
        active: bySegment('active'),
        history: bySegment('history'),
        observedAt,
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

function acceptancePermission(value: unknown, field: string): AcceptancePermission {
  const source = record(value, field);
  return Object.freeze({
    allowed: boolean(source.allowed, `${field}.allowed`),
    reasonCode: stableToken(source.reasonCode, `${field}.reasonCode`),
    explanation: text(source.explanation, `${field}.explanation`, 1_000),
  });
}

function customerTrust(value: unknown, field: string): readonly CustomerTrustEvidence[] {
  return Object.freeze(array(value, field).map((entry, index) => {
    const itemField = `${field}[${index}]`;
    const item = record(entry, itemField);
    const kind = item.kind;
    const allowed: readonly CustomerTrustEvidence['kind'][] = Object.freeze([
      'verified_contact', 'verified_account', 'completed_jobs', 'cancellation_context',
      'no_show_context', 'worker_rating',
    ]);
    if (!allowed.includes(kind as CustomerTrustEvidence['kind'])) throw new ContractFailure(`${itemField}.kind`);
    return Object.freeze({
      kind: kind as CustomerTrustEvidence['kind'],
      label: text(item.label, `${itemField}.label`, 160),
    });
  }));
}

function optionalTravel(value: unknown, field: string, observedAt: string): Evidence<TravelEstimate> {
  if (value === null || value === undefined) {
    return unavailable('travel_estimate_not_returned', 'No server-calculated distance or travel time was returned.');
  }
  const source = record(value, field);
  return supported(Object.freeze({
    distanceMetres: whole(source.distanceMetres, `${field}.distanceMetres`),
    durationMinutes: positiveWhole(source.durationMinutes, `${field}.durationMinutes`),
    calculatedAt: iso(source.calculatedAt, `${field}.calculatedAt`),
  }), observedAt);
}

function optionalCommercial(value: unknown, field: string, observedAt: string): Evidence<OfferCommercialBreakdown, 'server_ledger'> {
  if (value === null || value === undefined) {
    return unavailable('worker_commercial_not_returned', 'Expected Worker net is unavailable because no server-payable breakdown was returned.', 'server_ledger');
  }
  const source = record(value, field);
  if (source.currency !== 'ZAR') throw new ContractFailure(`${field}.currency`);
  const pricingMode = source.pricingMode;
  if (!['fixed', 'hourly', 'remote_quote', 'diagnostic_visit'].includes(String(pricingMode))) {
    throw new ContractFailure(`${field}.pricingMode`);
  }
  const commercial = Object.freeze({
    currency: 'ZAR' as const,
    grossMinor: whole(source.grossMinor, `${field}.grossMinor`),
    platformFeeMinor: whole(source.platformFeeMinor, `${field}.platformFeeMinor`),
    expectedNetMinor: whole(source.expectedNetMinor, `${field}.expectedNetMinor`),
    pricingMode: pricingMode as OfferCommercialBreakdown['pricingMode'],
    ledgerDefinition: text(source.ledgerDefinition, `${field}.ledgerDefinition`, 160),
  });
  if (commercial.grossMinor - commercial.platformFeeMinor !== commercial.expectedNetMinor) {
    throw new ContractFailure(field);
  }
  return supported(commercial, observedAt, 'server_ledger');
}

function adaptOffer(value: unknown, field: string, serverNow: string): WorkerOffer {
  const source = record(value, field);
  if (source.kind !== 'instant' || source.matchingMode !== 'fast_match') throw new ContractFailure(`${field}.kind`);
  const observedAt = iso(source.observedAt, `${field}.observedAt`);
  const status = source.status;
  const allowedStatuses = ['open', 'accepted', 'declined', 'expired', 'taken', 'withdrawn'] as const;
  if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) throw new ContractFailure(`${field}.status`);
  const customer = record(source.customer, `${field}.customer`);
  const schedule = record(source.schedule, `${field}.schedule`);
  if (schedule.kind !== 'now' && schedule.kind !== 'scheduled') throw new ContractFailure(`${field}.schedule.kind`);
  if (schedule.timezone !== 'Africa/Johannesburg') throw new ContractFailure(`${field}.schedule.timezone`);
  const startsAt = schedule.kind === 'now' ? optionalIso(schedule.startsAt, `${field}.schedule.startsAt`) : iso(schedule.startsAt, `${field}.schedule.startsAt`);
  const duration = source.expectedDuration === null
    ? unavailable<Readonly<{ minimumMinutes: number; maximumMinutes: number }>>('duration_not_returned', 'No server duration estimate was returned.')
    : (() => {
        const raw = record(source.expectedDuration, `${field}.expectedDuration`);
        const minimumMinutes = positiveWhole(raw.minimumMinutes, `${field}.expectedDuration.minimumMinutes`);
        const maximumMinutes = positiveWhole(raw.maximumMinutes, `${field}.expectedDuration.maximumMinutes`);
        if (minimumMinutes > maximumMinutes) throw new ContractFailure(`${field}.expectedDuration`);
        return supported(Object.freeze({ minimumMinutes, maximumMinutes }), observedAt);
      })();
  const broadArea = typeof source.broadAreaLabel === 'string' && source.broadAreaLabel.trim()
    ? supported(text(source.broadAreaLabel, `${field}.broadAreaLabel`, 160), observedAt)
    : unavailable<string>('broad_area_not_returned', 'No server-approved approximate area label was returned.');
  const serverExpiresAt = optionalIso(source.serverExpiresAt, `${field}.serverExpiresAt`);
  return Object.freeze({
    kind: 'instant' as const,
    matchingMode: 'fast_match' as const,
    offerId: id(source.id, `${field}.id`),
    serviceLabel: supported(text(source.serviceLabel, `${field}.serviceLabel`, 160), observedAt),
    serverStatus: supported(status as (typeof allowedStatuses)[number], observedAt),
    cacheFreshness: supported('fresh' as const, serverNow),
    acceptancePermission: supported(acceptancePermission(source.acceptancePermission, `${field}.acceptancePermission`), observedAt),
    customerDisplayName: supported(text(customer.displayName, `${field}.customer.displayName`, 80), observedAt),
    customerTrust: supported(customerTrust(customer.trust, `${field}.customer.trust`), observedAt),
    broadArea,
    travel: optionalTravel(source.travel, `${field}.travel`, observedAt),
    schedule: supported(Object.freeze({
      kind: schedule.kind,
      startsAt,
      timezone: 'Africa/Johannesburg' as const,
    }), observedAt),
    expectedDuration: duration,
    scopeSummary: typeof source.scopeSummary === 'string' && source.scopeSummary.trim()
      ? supported(text(source.scopeSummary, `${field}.scopeSummary`, 1_000), observedAt)
      : unavailable<string>('scope_summary_not_returned', 'Scope detail is withheld until the server returns an authorised summary.'),
    attachmentCount: source.attachmentCount === null
      ? unavailable<number>('attachment_count_not_returned', 'No attachment-count evidence was returned.')
      : supported(whole(source.attachmentCount, `${field}.attachmentCount`), observedAt),
    commercial: optionalCommercial(source.commercial, `${field}.commercial`, observedAt),
    serverExpiresAt: serverExpiresAt
      ? supported(serverExpiresAt, observedAt)
      : unavailable<string>('offer_expiry_not_returned', 'Refresh before responding because the server deadline is unavailable.'),
  });
}

export function adaptWorkerOffersV1(value: unknown): WorkerShellAdaptResult<WorkerOffersBundle> {
  try {
    const root = record(value, 'offers');
    if (root.schema !== OFFER_SCHEMA) throw new ContractFailure('offers.schema');
    const serverNow = iso(root.serverNow, 'offers.serverNow');
    const offers = array(root.offers, 'offers.offers').map((item, index) => adaptOffer(item, `offers.offers[${index}]`, serverNow));
    const meta = record(root.meta, 'offers.meta');
    if (whole(meta.count, 'offers.meta.count') !== offers.length) throw new ContractFailure('offers.meta.count');
    return Object.freeze({ ok: true, value: Object.freeze({ offers: Object.freeze(offers), serverNow }) });
  } catch (error) {
    return invalid(error);
  }
}

export function adaptWorkerOfferV1(value: unknown): WorkerShellAdaptResult<Readonly<{ offer: WorkerOffer; serverNow: string }>> {
  try {
    const root = record(value, 'offer');
    if (root.schema !== OFFER_SCHEMA) throw new ContractFailure('offer.schema');
    const serverNow = iso(root.serverNow, 'offer.serverNow');
    return Object.freeze({
      ok: true,
      value: Object.freeze({ offer: adaptOffer(root.offer, 'offer.offer', serverNow), serverNow }),
    });
  } catch (error) {
    return invalid(error);
  }
}

export function adaptWorkerEarningsV1(
  value: unknown,
  observedAtValue: unknown,
): WorkerShellAdaptResult<EarningsSnapshot> {
  try {
    const source = record(value, 'earnings');
    const observedAt = iso(observedAtValue, 'earnings.observedAt');
    const semantics = record(source.semantics, 'earnings.semantics');
    if (semantics.currency !== 'ZAR'
        || semantics.legacy_totals !== 'paid_job_value'
        || semantics.paid !== 'completed_reconciled_paid_project_value_not_worker_net'
        || semantics.pending !== 'completed_project_value_without_current_reconciled_paid_evidence'
        || semantics.job_value !== 'completed_project_locked_or_booking_total'
        || semantics.worker_gross_supported !== false
        || semantics.platform_fee_supported !== false
        || semantics.worker_net_supported !== false
        || semantics.available_balance_supported !== false
        || semantics.payout_supported !== false) {
      throw new ContractFailure('earnings.semantics');
    }
    const ledger = record(source.worker_payable_ledger, 'earnings.worker_payable_ledger');
    if (ledger.schema !== 'togt.worker-payable-ledger.v1'
        || ledger.definition !== 'completed_reconciled_paid_project_value_not_worker_net_v1'
        || semantics.ledger_definition !== ledger.definition
        || ledger.currency !== 'ZAR') {
      throw new ContractFailure('earnings.worker_payable_ledger');
    }
    const capabilities = record(ledger.capabilities, 'earnings.worker_payable_ledger.capabilities');
    for (const capability of ['workerGross', 'platformFee', 'workerNet', 'availableBalance', 'payout']) {
      if (capabilities[capability] !== false) {
        throw new ContractFailure(`earnings.worker_payable_ledger.capabilities.${capability}`);
      }
    }

    const entrySums = new Map<string, number>();
    const entryCounts = new Map<string, number>();
    const entryIds = new Set<string>();
    const sequences = new Set<string>();
    for (const [index, rawEntry] of array(ledger.entries, 'earnings.worker_payable_ledger.entries').entries()) {
      const field = `earnings.worker_payable_ledger.entries[${index}]`;
      const entry = record(rawEntry, field);
      const entryId = id(entry.id, `${field}.id`);
      const projectId = id(entry.projectId, `${field}.projectId`);
      const sequence = positiveWhole(entry.sequence, `${field}.sequence`);
      const type = entry.type;
      const delta = record(entry.reconciledPaidJobValueDelta, `${field}.reconciledPaidJobValueDelta`);
      const deltaMinor = delta.currency === 'ZAR' ? signedDecimalMinor(delta.amount) : null;
      if ((type !== 'recognition' && type !== 'reversal')
          || deltaMinor === null || deltaMinor === 0
          || (type === 'recognition' && deltaMinor < 0)
          || (type === 'reversal' && deltaMinor > 0)) {
        throw new ContractFailure(field);
      }
      stableToken(entry.reasonCode, `${field}.reasonCode`);
      iso(entry.occurredAt, `${field}.occurredAt`);
      if (entryIds.has(entryId) || sequences.has(`${projectId}:${sequence}`)) throw new ContractFailure(field);
      entryIds.add(entryId);
      sequences.add(`${projectId}:${sequence}`);
      entrySums.set(projectId, (entrySums.get(projectId) ?? 0) + deltaMinor);
      entryCounts.set(projectId, (entryCounts.get(projectId) ?? 0) + 1);
    }

    const projectIds = new Set<string>();
    const completedJobs: readonly CompletedJobLedgerRow[] = Object.freeze(array(
      ledger.projects,
      'earnings.worker_payable_ledger.projects',
    ).map((rawProject, index) => {
      const field = `earnings.worker_payable_ledger.projects[${index}]`;
      const project = record(rawProject, field);
      const projectId = id(project.projectId, `${field}.projectId`);
      const ledgerState = project.ledgerState;
      const paidValue = record(project.reconciledPaidJobValue, `${field}.reconciledPaidJobValue`);
      const paidValueMinor = paidValue.currency === 'ZAR' ? decimalMinor(paidValue.amount) : null;
      const projectPaymentState = project.paymentState;
      const allowedPaymentStates: readonly PaymentState[] = Object.freeze([
        'awaiting_reconciliation', 'paid_online', 'refunded', 'disputed',
      ]);
      const payout = record(project.payout, `${field}.payout`);
      const adjustmentCount = positiveWhole(project.adjustmentCount, `${field}.adjustmentCount`);
      if ((ledgerState !== 'recognised' && ledgerState !== 'reversed')
          || paidValueMinor === null
          || !allowedPaymentStates.includes(projectPaymentState as PaymentState)
          || payout.supported !== false
          || payout.state !== 'unavailable'
          || projectIds.has(projectId)
          || entryCounts.get(projectId) !== adjustmentCount
          || entrySums.get(projectId) !== paidValueMinor) {
        throw new ContractFailure(field);
      }
      if ((ledgerState === 'recognised' && paidValueMinor <= 0)
          || (ledgerState === 'reversed' && paidValueMinor !== 0)) {
        throw new ContractFailure(`${field}.ledgerState`);
      }
      projectIds.add(projectId);
      stableToken(payout.reasonCode, `${field}.payout.reasonCode`);
      iso(project.updatedAt, `${field}.updatedAt`);
      return Object.freeze({
        ledgerEntryId: id(project.ledgerEntryId, `${field}.ledgerEntryId`),
        jobId: projectId,
        serviceLabel: text(project.serviceLabel, `${field}.serviceLabel`, 160),
        completedAt: iso(project.completedAt, `${field}.completedAt`),
        ledgerState,
        latestReasonCode: stableToken(project.latestReasonCode, `${field}.latestReasonCode`),
        adjustmentCount,
        reconciledPaidJobValue: Object.freeze({ currency: 'ZAR' as const, amountMinor: paidValueMinor }),
        workerGross: unavailableLedgerMoney(
          project.workerGross,
          `${field}.workerGross`,
          'Worker gross is unavailable because no approved commercial allocation policy is configured.',
        ),
        platformFee: unavailableLedgerMoney(
          project.platformFee,
          `${field}.platformFee`,
          'Platform fee is unavailable because no approved fee policy is configured.',
        ),
        net: unavailableLedgerMoney(
          project.workerNet,
          `${field}.workerNet`,
          'Worker net is unavailable because no approved fee and payable policy is configured.',
        ),
        paymentState: projectPaymentState as PaymentState,
        payoutState: null,
        paymentMethod: 'online' as const,
      });
    }));
    if ([...entrySums.keys()].some((projectId) => !projectIds.has(projectId))) {
      throw new ContractFailure('earnings.worker_payable_ledger.entries');
    }

    const ledgerTotals = record(ledger.totals, 'earnings.worker_payable_ledger.totals');
    const reconciledTotals = record(
      ledgerTotals.reconciledPaidJobValue,
      'earnings.worker_payable_ledger.totals.reconciledPaidJobValue',
    );
    const ledgerAllTimeMinor = decimalMinor(reconciledTotals.allTime);
    const ledgerThisWeekMinor = decimalMinor(reconciledTotals.thisWeek);
    const ledgerTodayMinor = decimalMinor(reconciledTotals.today);
    const ledgerThisMonthMinor = decimalMinor(reconciledTotals.thisMonth);
    if (ledgerAllTimeMinor === null || ledgerThisWeekMinor === null
        || ledgerTodayMinor === null || ledgerThisMonthMinor === null
        || ledgerAllTimeMinor !== completedJobs.reduce((sum, row) => sum + row.reconciledPaidJobValue.amountMinor, 0)) {
      throw new ContractFailure('earnings.worker_payable_ledger.totals.reconciledPaidJobValue');
    }
    unavailableLedgerMoney(
      ledgerTotals.workerGross,
      'earnings.worker_payable_ledger.totals.workerGross',
      'Worker gross totals are unavailable.',
    );
    unavailableLedgerMoney(
      ledgerTotals.platformFee,
      'earnings.worker_payable_ledger.totals.platformFee',
      'Platform fee totals are unavailable.',
    );
    unavailableLedgerMoney(
      ledgerTotals.workerNet,
      'earnings.worker_payable_ledger.totals.workerNet',
      'Worker-net totals are unavailable.',
    );

    const jobValue = record(source.job_value, 'earnings.job_value');
    const allTimeJobValue = majorAmount(jobValue.all_time, 'earnings.job_value.all_time');
    const paid = record(source.paid, 'earnings.paid');
    const pending = record(source.pending, 'earnings.pending');
    const confirmedPaidMinor = decimalMinor(majorAmount(paid.all_time, 'earnings.paid.all_time'));
    const pendingPaidEvidenceMinor = decimalMinor(majorAmount(pending.all_time, 'earnings.pending.all_time'));
    const completedJobValueMinor = decimalMinor(allTimeJobValue);
    if (confirmedPaidMinor === null || pendingPaidEvidenceMinor === null || completedJobValueMinor === null
        || confirmedPaidMinor + pendingPaidEvidenceMinor !== completedJobValueMinor) {
      throw new ContractFailure('earnings.payment_evidence');
    }
    const paymentEvidence: PaymentBackedJobValueTotals = Object.freeze({
      currency: 'ZAR',
      confirmedPaidMinor,
      pendingPaidEvidenceMinor,
      completedJobValueMinor,
      definition: 'completed_job_value_payment_evidence_not_worker_net',
    });
    const payoutCapability: PayoutCapability = Object.freeze({
      state: 'not_operational',
      beneficiaryVerification: 'not_configured',
      reconciliation: 'not_operational',
    });
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        schemaVersion: 1,
        totals: unavailable<EarningsTotals, 'server_ledger'>(
          'worker_net_policy_not_configured',
          'The append-only Project payment ledger is available, but Worker gross, fee and net remain unavailable until an approved commercial policy is configured.',
          'server_ledger',
        ),
        paymentEvidence: supported(paymentEvidence, observedAt, 'server_ledger'),
        completedJobs,
        ledgerNotice: completedJobs.length === 0 && allTimeJobValue > 0
          ? 'Completed Project value exists, but none currently has canonical reconciled-paid evidence. No Worker-net amount is claimed.'
          : null,
        payoutCapability: supported(payoutCapability, observedAt, 'server_payout'),
        availableBalance: unavailable<ZarAmount, 'server_payout'>(
          'available_balance_unsupported',
          'The server explicitly reports that available balance is unsupported.',
          'server_payout',
        ),
        nextPayout: unavailable<NextPayout, 'server_payout'>(
          'payout_schedule_unsupported',
          'The server explicitly reports that payout scheduling is unsupported.',
          'server_payout',
        ),
        lastUpdatedAt: observedAt,
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

function latestIso(values: readonly string[]): string {
  return values.reduce((latest, value) => (
    Date.parse(value) > Date.parse(latest) ? value : latest
  ));
}

function identityFromActivation(activation: ActivationSnapshot): Evidence<WorkerIdentityState> {
  const identity = activation.items.find((item) => item.kind === 'identity_assurance');
  if (!identity) return unavailable('identity_evidence_not_returned', 'The activation record did not contain identity evidence.');
  const state: WorkerIdentityState = identity.status === 'complete'
    ? 'verified'
    : identity.status === 'pending_review'
      ? 'verification_pending'
      : 'unverified';
  return supported(state, activation.lastUpdatedAt);
}

function fastMatchEligibility(
  activation: ActivationSnapshot,
  availability: WorkerAvailabilityRecord,
): Evidence<FastMatchEligibilityState> {
  if (availability.availability === 'offline') return supported('ineligible', availability.observedAt);
  if (activation.onlinePermission.status === 'supported' && !activation.onlinePermission.value.allowed) {
    return supported('ineligible', activation.onlinePermission.observedAt);
  }
  return unavailable(
    'fast_match_heartbeat_not_returned',
    'Online prerequisites may pass, but no separate waiting-for-offers app heartbeat was returned.',
  );
}

export function composeWorkerTodayV1(input: Readonly<{
  activation: ActivationSnapshot;
  profile: WorkerProfileBundle;
  availability: WorkerAvailabilityRecord;
  jobs: WorkerJobsBundle | null;
  offers: WorkerOffersBundle | null;
  earnings: EarningsSnapshot | null;
}>): WorkerShellAdaptResult<WorkerTodaySnapshot> {
  try {
    const { activation, profile, availability } = input;
    if (activation.workerId !== profile.snapshot.workerId || activation.workerId !== availability.workerId) {
      throw new ContractFailure('today.workerId');
    }
    const required = activation.items.filter((item) => item.required && item.status !== 'not_required');
    const remaining = required.filter((item) => item.status !== 'complete');
    const permissionReady = activation.onlinePermission.status === 'supported'
      && activation.onlinePermission.value.allowed;
    const activationState = permissionReady && remaining.length === 0
      ? 'ready' as const
      : remaining.some((item) => item.status === 'pending_review')
        ? 'review_in_progress' as const
        : 'action_required' as const;
    const upcoming = input.jobs?.upcoming ?? null;
    const nextJob = upcoming === null
      ? unavailable<WorkerJobSummary | null>('next_job_not_loaded', 'Reconnect and refresh before relying on the next Job.')
      : supported<WorkerJobSummary | null>(upcoming[0] ?? null, input.jobs!.observedAt);
    const weeklyNet = input.earnings?.totals.status === 'supported'
      ? supported(
          Object.freeze({ currency: 'ZAR' as const, amountMinor: input.earnings.totals.value.thisWeekNetMinor }),
          input.earnings.totals.observedAt,
          'server_ledger',
        )
      : unavailable<Readonly<{ currency: 'ZAR'; amountMinor: number }>, 'server_ledger'>(
          input.earnings?.totals.status === 'unavailable' ? input.earnings.totals.reasonCode : 'worker_ledger_not_loaded',
          input.earnings?.totals.status === 'unavailable'
            ? input.earnings.totals.explanation
            : 'No server-authoritative Worker-net ledger was loaded.',
          'server_ledger',
        );
    const timestamps = [activation.lastUpdatedAt, profile.snapshot.lastUpdatedAt, availability.observedAt];
    if (input.jobs) timestamps.push(input.jobs.observedAt);
    if (input.offers) timestamps.push(input.offers.serverNow);
    if (input.earnings) timestamps.push(input.earnings.lastUpdatedAt);
    const photo = profile.snapshot.publicProfile.profilePhoto;
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        schemaVersion: 1,
        workerId: activation.workerId,
        displayName: profile.snapshot.publicProfile.displayName,
        profileImageUri: photo.status === 'supported' ? photo.value.uri : null,
        identity: identityFromActivation(activation),
        availability: supported(availability.availability, availability.observedAt),
        fastMatchEligibility: fastMatchEligibility(activation, availability),
        nextJob,
        weeklyNet,
        newOfferCount: input.offers
          ? supported(input.offers.offers.length, input.offers.serverNow)
          : unavailable<number>('offers_not_loaded', 'No open-offer count is shown without a current server response.'),
        activation: supported(Object.freeze({
          state: activationState,
          title: activationState === 'ready'
            ? 'Ready for work'
            : activationState === 'review_in_progress' ? 'Verification review in progress' : 'Finish Worker setup',
          explanation: activation.onlinePermission.status === 'supported'
            ? activation.onlinePermission.value.explanation
            : activation.onlinePermission.explanation,
          remainingItemCount: remaining.length,
        }), activation.lastUpdatedAt),
        lastUpdatedAt: latestIso(timestamps),
      }),
    });
  } catch (error) {
    return invalid(error);
  }
}

function segmentState<T>(items: readonly T[], title: string, message: string) {
  return items.length > 0
    ? Object.freeze({ status: 'ready' as const, value: items })
    : Object.freeze({ status: 'empty' as const, title, message });
}

export function workerJobsSnapshotV1(
  jobs: WorkerJobsBundle | null,
  offers: WorkerOffersBundle | null,
): JobsInboxSnapshot {
  return Object.freeze({
    offers: offers
      ? segmentState(offers.offers, 'No open offers', 'New eligible offers will appear only after the server sends them.')
      : Object.freeze({
          status: 'error' as const,
          title: 'Offers could not refresh',
          message: 'No open-offer count or status has been assumed. Reconnect and retry.',
          correlationId: null,
        }),
    upcoming: jobs
      ? segmentState(jobs.upcoming, 'No upcoming jobs', 'Confirmed scheduled work will appear here.')
      : Object.freeze({ status: 'error' as const, title: 'Upcoming Jobs could not refresh', message: 'Reconnect and retry before relying on this list.', correlationId: null }),
    active: jobs
      ? segmentState(jobs.active, 'No active jobs', 'Accepted work appears here when its active phase is confirmed.')
      : Object.freeze({ status: 'error' as const, title: 'Active Jobs could not refresh', message: 'Reconnect and retry before relying on this list.', correlationId: null }),
    history: jobs
      ? segmentState(jobs.history, 'No job history yet', 'Closed and cancelled work will appear here.')
      : Object.freeze({ status: 'error' as const, title: 'Job history could not refresh', message: 'Reconnect and retry before relying on this list.', correlationId: null }),
    lastUpdatedAt: jobs && offers
      ? latestIso([jobs.observedAt, offers.serverNow])
      : jobs?.observedAt ?? offers?.serverNow ?? null,
  });
}
