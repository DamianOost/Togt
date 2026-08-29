import type { Evidence, EvidenceSource, PaymentState, ZarAmount } from '../../features/worker/shell';
import type { PaymentSnapshot } from '../../features/customer/projects';
import type {
  WorkerActiveWorkSnapshot,
  WorkerChangeOrder,
  WorkerCompletionSnapshot,
  WorkerJobDetailSnapshot,
  WorkerJobCommercial,
  WorkerOperationalPhase,
  WorkerScopeSnapshot,
} from '../../features/worker/lifecycle';
import { adaptProjectHubV1, completionPaymentFromProjectV1 } from './projects.ts';
import type { GroundedChangeOrder, GroundedFulfilment, GroundedScope } from './fulfilment';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonRecord = Record<string, unknown>;

export type WorkerLifecycleAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_worker_lifecycle_contract'; field: string }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
): Evidence<T, Source> {
  return Object.freeze({ status: 'unavailable', reasonCode, explanation });
}

function workerPhase(fulfilment: GroundedFulfilment): WorkerOperationalPhase {
  if (fulfilment.operationalPhase === 'matching') return 'unknown';
  if (fulfilment.operationalPhase === 'assigned') return 'accepted';
  if (fulfilment.operationalPhase === 'closed') {
    return fulfilment.transactionalStatus === 'cancelled' || fulfilment.transactionalStatus === 'terminated_after_start'
      ? 'cancelled'
      : 'closed';
  }
  return fulfilment.operationalPhase;
}

function scheduleLabel(startsAt: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(startsAt));
}

function rawCustomer(raw: unknown): JsonRecord | null {
  return isRecord(raw) && isRecord(raw.participants) && isRecord(raw.participants.customer)
    ? raw.participants.customer
    : null;
}

export function adaptWorkerJobDetailV1(
  projectRaw: unknown,
  fulfilment: GroundedFulfilment,
): WorkerLifecycleAdaptResult<WorkerJobDetailSnapshot> {
  const hub = adaptProjectHubV1(projectRaw);
  if (!hub.ok || hub.value.projectId !== fulfilment.projectId) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_worker_lifecycle_contract', field: 'project' });
  }
  const customer = rawCustomer(projectRaw);
  const customerName = customer && typeof customer.displayName === 'string' && customer.displayName.trim()
    ? customer.displayName.trim()
    : fulfilment.participants.customer.displayName;
  const phase = workerPhase(fulfilment);
  const exact = fulfilment.location.precision === 'exact' ? fulfilment.location.address : null;
  const broad = fulfilment.location.precision === 'approximate' ? fulfilment.location.label : null;
  const contact = fulfilment.participants.customer.phone;
  const scope = fulfilment.scope.proposal ?? fulfilment.scope.current;
  const commandPermissions = Object.freeze([
    Object.freeze({
      command: 'start_route' as const,
      allowed: !fulfilment.integrity.readOnly && fulfilment.allowedActions.startRoute,
      reason: fulfilment.allowedActions.startRoute
        ? 'The server permits this assigned Worker to begin the route.'
        : 'The current server phase does not permit route start.',
    }),
    Object.freeze({
      command: 'mark_arrived' as const,
      allowed: !fulfilment.integrity.readOnly && fulfilment.allowedActions.markArrived,
      reason: fulfilment.allowedActions.markArrived
        ? 'The server permits an explicit arrival attestation.'
        : 'The current server phase does not permit arrival.',
    }),
  ]);
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      projectId: fulfilment.projectId,
      stateVersion: fulfilment.revision,
      serviceLabel: supported(hub.value.serviceLabel, fulfilment.updatedAt),
      phase: supported(phase, fulfilment.updatedAt),
      phaseLabel: hub.value.phaseLabel,
      phaseUpdatedAt: hub.value.phaseUpdatedAt,
      scheduleLabel: supported(scheduleLabel(fulfilment.schedule.startsAt), fulfilment.updatedAt),
      customerDisplayName: supported(customerName, fulfilment.updatedAt),
      customerEvidence: Object.freeze([]),
      privacy: Object.freeze({
        broadArea: broad
          ? supported<string>(broad, fulfilment.updatedAt)
          : unavailable<string>('broad_area_not_returned', 'The server returned exact operational access without a separate broad-area label.'),
        exactAddress: exact
          ? supported<string>(exact, fulfilment.updatedAt)
          : unavailable<string>('exact_address_not_authorised', 'The exact address remains hidden until route access is authorised.'),
        exactRevealAuthorised: exact !== null,
        contact: contact
          ? supported<string>(contact, fulfilment.updatedAt)
          : unavailable<string>('contact_not_authorised', 'Customer contact remains masked outside the authorised operational window.'),
        contactRevealAuthorised: contact !== null,
      }),
      tracking: Object.freeze({
        status: phase === 'en_route' ? 'not_started' : phase === 'closed' || phase === 'cancelled' ? 'stopped' : 'hidden',
        explanation: 'No authoritative Worker location-sharing status was returned by the fulfilment contract.',
        capturedAt: null,
        failureReason: null,
      }),
      timeline: Object.freeze(hub.value.timeline.map((event) => Object.freeze({
        eventId: event.eventId,
        label: event.label,
        detail: event.detail,
        occurredAt: event.occurredAt,
        state: event.status,
      }))),
      scopeSummary: scope
        ? supported<string>(scope.description, fulfilment.updatedAt)
        : unavailable<string>('scope_not_available', 'No confirmed or proposed on-site scope is available yet.'),
      commercial: unavailable<WorkerJobCommercial, 'server_ledger'>('worker_ledger_not_returned', 'Customer totals are not Worker earnings. Open Earnings for server-ledger evidence.'),
      commandPermissions,
      canChat: hub.value.canChat,
      canOpenSafetyHelp: true,
      openIssue: hub.value.openIssue,
      lastUpdatedAt: fulfilment.updatedAt,
    }),
  });
}

function workerScopeStatus(scope: GroundedScope): WorkerScopeSnapshot['status'] {
  if (scope.status === 'confirmed') return 'confirmed';
  if (scope.status === 'declined') return 'revision_declined';
  if (scope.status === 'superseded') return 'cancelled';
  return scope.proposedByRole === 'customer' ? 'pending_worker' : 'worker_confirmed';
}

export function workerScopeFromFulfilmentV1(
  fulfilment: GroundedFulfilment,
): WorkerLifecycleAdaptResult<WorkerScopeSnapshot> {
  const scope = fulfilment.scope.proposal ?? fulfilment.scope.current;
  if (!scope) return Object.freeze({ ok: false, reasonCode: 'invalid_worker_lifecycle_contract', field: 'scope' });
  const pinStatus = fulfilment.start.status === 'active' && fulfilment.start.workerMustEnter
    ? 'entry_allowed' as const
    : fulfilment.start.status === 'locked'
      ? 'locked' as const
      : fulfilment.start.status === 'consumed'
        ? 'verified' as const
        : 'waiting_for_customer' as const;
  const itemStatus = scope.customerConfirmedAt
    ? 'customer_confirmed' as const
    : scope.workerConfirmedAt
      ? 'worker_confirmed' as const
      : 'unconfirmed' as const;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: fulfilment.projectId,
      stateVersion: fulfilment.revision,
      scopeId: `scope:${fulfilment.projectId}:v${scope.version}`,
      scopeVersion: scope.version,
      acceptedBriefVersion: scope.baseVersion ?? scope.version,
      status: workerScopeStatus(scope),
      included: scope.items,
      excluded: Object.freeze([]),
      checklist: Object.freeze(scope.items.map((label, index) => Object.freeze({
        itemId: `scope-item:${scope.version}:${index + 1}`,
        label,
        status: itemStatus,
      }))),
      materialsResponsibility: scope.materialsResponsibility,
      timeAndRateLabel: scope.estimatedMinutes === null
        ? 'Duration evidence is unavailable; commercial terms remain in the accepted Project agreement.'
        : `${scope.estimatedMinutes} estimated minutes; commercial terms remain in the accepted Project agreement.`,
      totalOrCap: unavailable<ZarAmount>('worker_commercial_total_not_returned', 'No approved total or cap was returned in this fulfilment view.'),
      workerConfirmedAt: scope.workerConfirmedAt,
      customerConfirmedAt: scope.customerConfirmedAt,
      clarification: null,
      pinPolicy: supported(Object.freeze({
        actor: 'worker' as const,
        status: pinStatus,
        attemptsRemaining: fulfilment.start.attemptsRemaining,
        retryAfter: null,
      }), fulfilment.updatedAt),
      startOutcome: Object.freeze({
        status: fulfilment.start.workStartedAt ? 'pending' : 'not_attempted',
        actorAt: null,
        deviceAt: null,
        serverAt: fulfilment.start.workStartedAt,
        message: fulfilment.start.workStartedAt
          ? 'The server recorded work start; actor and device evidence are not included in this view.'
          : null,
      }),
    }),
  });
}

function elapsedEvidence(fulfilment: GroundedFulfilment): Evidence<string> {
  if (!fulfilment.start.workStartedAt) {
    return unavailable('work_start_not_returned', 'Elapsed time is unavailable until the server records work start.');
  }
  const minutes = Math.max(0, Math.floor(
    (Date.parse(fulfilment.updatedAt) - Date.parse(fulfilment.start.workStartedAt)) / 60_000,
  ));
  const label = minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return supported(label, fulfilment.updatedAt);
}

function workerChangeOrder(change: GroundedChangeOrder): WorkerChangeOrder {
  return Object.freeze({
    changeOrderId: change.id,
    version: change.version,
    status: change.status,
    description: change.description,
    addedTimeMinutes: change.extraMinutes,
    materialsDescription: change.addedScopeItems.length > 0 ? change.addedScopeItems.join('; ') : null,
    baseTotal: change.originalTotalAmount,
    additionalAmount: change.additionalAmount,
    revisedTotal: change.revisedTotalAmount,
    additionalExpectedNet: unavailable<ZarAmount, 'server_ledger'>('worker_net_not_returned', 'The fulfilment contract does not return a Worker-net ledger preview.'),
    expiresAt: change.expiresAt,
  });
}

export function workerActiveWorkFromFulfilmentV1(
  fulfilment: GroundedFulfilment,
): WorkerLifecycleAdaptResult<WorkerActiveWorkSnapshot> {
  const scope = fulfilment.scope.current;
  if (!scope || scope.status !== 'confirmed') {
    return Object.freeze({ ok: false, reasonCode: 'invalid_worker_lifecycle_contract', field: 'confirmed_scope' });
  }
  const totals = [...fulfilment.changeOrders].sort((left, right) => right.version - left.version);
  const latestTotal = totals[0]?.status === 'approved'
    ? totals[0].revisedTotalAmount
    : totals[0]?.originalTotalAmount ?? null;
  const pending = fulfilment.changeOrders.some((change) => change.status === 'pending');
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: fulfilment.projectId,
      stateVersion: fulfilment.revision,
      scopeId: `scope:${fulfilment.projectId}:v${scope.version}`,
      scopeVersion: scope.version,
      scopeSummary: scope.description,
      elapsedLabel: elapsedEvidence(fulfilment),
      currentApprovedTotal: latestTotal
        ? supported<ZarAmount>(latestTotal, fulfilment.updatedAt)
        : unavailable<ZarAmount>('approved_total_not_returned', 'The fulfilment contract did not return the base approved total.'),
      customerApprovalCap: unavailable<ZarAmount>('approval_cap_not_returned', 'No customer approval cap was returned.'),
      currentExpectedNet: unavailable<ZarAmount, 'server_ledger'>('worker_net_not_returned', 'Worker net requires a server-ledger projection.'),
      changeOrders: Object.freeze(fulfilment.changeOrders.map(workerChangeOrder)),
      canRequestChange: !fulfilment.integrity.readOnly && fulfilment.allowedActions.proposeChangeOrder,
      canRequestCompletion: !fulfilment.integrity.readOnly
        && fulfilment.operationalPhase === 'work_active'
        && !pending,
    }),
  });
}

function paymentStateFromProject(payment: PaymentSnapshot): PaymentState | null {
  if (payment.obligationStatus === 'paid') return 'paid_online';
  if (payment.obligationStatus === 'due' || payment.obligationStatus === 'partially_paid') {
    return payment.attemptStatus === 'pending' || payment.attemptStatus === 'uncertain'
      ? 'awaiting_reconciliation'
      : 'due';
  }
  if (payment.obligationStatus === 'not_due' || payment.obligationStatus === 'voided') return 'not_due';
  return null;
}

function frozenCommercialSnapshotId(projectRaw: unknown): string | null {
  if (!isRecord(projectRaw) || !isRecord(projectRaw.commercial)
      || !isRecord(projectRaw.commercial.frozenSnapshot)) return null;
  const value = projectRaw.commercial.frozenSnapshot.id;
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

export function adaptWorkerCompletionV1(
  projectRaw: unknown,
): WorkerLifecycleAdaptResult<WorkerCompletionSnapshot> {
  const completion = completionPaymentFromProjectV1(projectRaw);
  const hub = adaptProjectHubV1(projectRaw);
  if (!completion.ok || !hub.ok) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_worker_lifecycle_contract', field: 'completion' });
  }
  const value = completion.value;
  const status = value.completion.status === 'confirmed'
    ? 'customer_confirmed' as const
    : value.completion.status === 'timed_out'
      ? 'timed_out' as const
      : value.completion.status;
  const paymentState = paymentStateFromProject(value.payment);
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: value.projectId,
      stateVersion: value.stateVersion,
      status,
      requestedAt: value.completion.requestedAt,
      customerOutcomeAt: null,
      timeoutPolicyLabel: null,
      scopeSummary: value.completion.scopeSummary,
      evidenceLabels: value.completion.evidenceLabels,
      finalCommercialSnapshotId: frozenCommercialSnapshotId(projectRaw),
      finalExpectedNet: unavailable<ZarAmount, 'server_ledger'>('worker_net_not_returned', 'Completion does not become earnings without a server-ledger Worker-net record.'),
      paymentState: paymentState
        ? supported<PaymentState>(paymentState, hub.value.phaseUpdatedAt)
        : unavailable<PaymentState>('payment_state_unverified', 'No supported Worker-facing payment state was returned.'),
      issue: value.completion.openIssue
        ? Object.freeze({
            issueId: value.completion.openIssue.issueId,
            status: 'open' as const,
            label: value.completion.openIssue.label,
          })
        : null,
      ratingEligibility: unavailable<Readonly<{ eligible: boolean; reason: string }>>('rating_eligibility_not_returned', 'Rating eligibility is not assumed from completion.'),
      payoutEligibility: unavailable<Readonly<{ eligible: boolean; reason: string }>>('payout_eligibility_not_returned', 'Payout eligibility requires the Worker ledger.'),
    }),
  });
}
