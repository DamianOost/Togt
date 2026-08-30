import type {
  ActiveWorkSnapshot,
  ChangeOrder,
  MoneyAmount,
  ScopeConfirmationViewSnapshot,
  ScopeSnapshot,
} from '../../features/customer/projects';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type FulfilmentAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_fulfilment_contract'; field: string }>;

export type GroundedFulfilmentPhase =
  | 'matching'
  | 'assigned'
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'scope_confirmation'
  | 'work_active'
  | 'completion_review'
  | 'payment_pending'
  | 'closed';

export type GroundedScope = Readonly<{
  version: number;
  baseVersion: number | null;
  status: 'proposed' | 'confirmed' | 'declined' | 'superseded';
  proposedByRole: 'customer' | 'worker';
  description: string;
  items: readonly string[];
  materialsResponsibility: string;
  materialsResponsibilityCode: 'customer' | 'worker' | 'discuss' | 'not_recorded' | null;
  estimatedMinutes: number | null;
  customerConfirmedAt: string | null;
  workerConfirmedAt: string | null;
  createdAt: string;
}>;

export type GroundedChangeOrder = Readonly<{
  id: string;
  version: number;
  baseScopeVersion: number;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  description: string;
  addedScopeItems: readonly string[];
  extraMinutes: number | null;
  labourAmount: MoneyAmount;
  materialsAmount: MoneyAmount;
  additionalAmount: MoneyAmount;
  originalTotalAmount: MoneyAmount;
  revisedTotalAmount: MoneyAmount;
  expiresAt: string | null;
}>;

export type GroundedReschedule = Readonly<{
  id: string;
  version: number;
  scheduleRevision: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  proposedByRole: 'customer' | 'worker';
  originalStartsAt: string;
  proposedStartsAt: string;
  reason: string | null;
  expiresAt: string;
  decidedAt: string | null;
}>;

export type GroundedFulfilment = Readonly<{
  schema: 'togt.fulfilment.v1';
  projectId: string;
  revision: number;
  transactionalStatus: string;
  operationalPhase: GroundedFulfilmentPhase;
  schedule: Readonly<{ revision: number; startsAt: string }>;
  location: Readonly<{
    precision: 'exact' | 'approximate';
    label: string | null;
    address: string | null;
    latitude: number;
    longitude: number;
  }>;
  participants: Readonly<{
    customer: Readonly<{ displayName: string; phone: string | null }>;
    worker: Readonly<{ displayName: string; phone: string | null }>;
  }>;
  scope: Readonly<{ current: GroundedScope | null; proposal: GroundedScope | null }>;
  start: Readonly<{
    status: 'not_issued' | 'active' | 'consumed' | 'locked' | 'revoked' | 'expired';
    scopeVersion: number | null;
    failedAttempts: number | null;
    attemptsRemaining: number | null;
    expiresAt: string | null;
    customerCanReveal: boolean;
    workerMustEnter: boolean;
    workStartedAt: string | null;
  }>;
  reschedules: readonly GroundedReschedule[];
  changeOrders: readonly GroundedChangeOrder[];
  allowedActions: Readonly<{
    startRoute: boolean;
    markArrived: boolean;
    proposeScope: boolean;
    decideScope: boolean;
    revealStartPin: boolean;
    startWork: boolean;
    proposeReschedule: boolean;
    decideReschedule: boolean;
    proposeChangeOrder: boolean;
    decideChangeOrder: boolean;
    reportNoShow: boolean;
    requestReplacement: boolean;
  }>;
  integrity: Readonly<{ policySnapshotPresent: boolean; policyVersion: string | null; readOnly: boolean }>;
  updatedAt: string;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function stringValue(value: unknown, max = 2_000): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max ? candidate : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function nullableIso(value: unknown): string | null | undefined {
  return value == null ? null : iso(value) ?? undefined;
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function phone(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/[\s()-]/g, '');
  return /^\+?\d{9,15}$/.test(normalized) ? normalized : undefined;
}

function decimalMoney(value: unknown, currency: unknown): MoneyAmount | null {
  if (currency !== 'ZAR' || (typeof value !== 'string' && typeof value !== 'number')) return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  const amountMinor = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amountMinor) && amountMinor >= 0
    ? Object.freeze({ amountMinor, currency: 'ZAR' })
    : null;
}

function stringArray(value: unknown, maxItems = 50, maxLength = 500): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) return null;
  const items: string[] = [];
  for (const item of value) {
    const candidate = stringValue(item, maxLength);
    if (!candidate) return null;
    items.push(candidate);
  }
  return Object.freeze(items);
}

function parseScope(value: unknown): GroundedScope | null | undefined {
  if (value == null) return null;
  if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.confirmations)) return undefined;
  const version = positiveInteger(value.version);
  const baseVersion = value.baseVersion == null ? null : positiveInteger(value.baseVersion);
  const statuses = new Set(['proposed', 'confirmed', 'declined', 'superseded']);
  const status = statuses.has(String(value.status)) ? value.status as GroundedScope['status'] : null;
  const proposedByRole = value.proposedByRole === 'customer' || value.proposedByRole === 'worker'
    ? value.proposedByRole
    : null;
  const description = stringValue(value.snapshot.description, 1_500);
  const items = stringArray(value.snapshot.items);
  const materialsResponsibility = stringValue(value.snapshot.materialsResponsibility, 300);
  const materialsResponsibilityCode = value.snapshot.materialsResponsibilityCode == null
    ? null
    : ['customer', 'worker', 'discuss', 'not_recorded'].includes(String(value.snapshot.materialsResponsibilityCode))
      ? value.snapshot.materialsResponsibilityCode as GroundedScope['materialsResponsibilityCode']
      : undefined;
  const estimatedMinutes = value.snapshot.estimatedMinutes == null
    ? null
    : positiveInteger(value.snapshot.estimatedMinutes);
  const customerConfirmedAt = nullableIso(value.confirmations.customer);
  const workerConfirmedAt = nullableIso(value.confirmations.worker);
  const createdAt = iso(value.createdAt);
  if (!version || (value.baseVersion != null && !baseVersion) || !status || !proposedByRole
      || !description || !items || !materialsResponsibility
      || materialsResponsibilityCode === undefined
      || (value.snapshot.estimatedMinutes != null && !estimatedMinutes)
      || customerConfirmedAt === undefined || workerConfirmedAt === undefined || !createdAt) return undefined;
  return Object.freeze({
    version,
    baseVersion,
    status,
    proposedByRole,
    description,
    items,
    materialsResponsibility,
    materialsResponsibilityCode,
    estimatedMinutes,
    customerConfirmedAt,
    workerConfirmedAt,
    createdAt,
  });
}

function parseChangeOrder(value: unknown): GroundedChangeOrder | null {
  if (!isRecord(value) || !isRecord(value.commercial)) return null;
  const changeId = id(value.id);
  const version = positiveInteger(value.version);
  const baseScopeVersion = positiveInteger(value.baseScopeVersion);
  const statuses = new Set(['pending', 'approved', 'declined', 'expired']);
  const status = statuses.has(String(value.status)) ? value.status as GroundedChangeOrder['status'] : null;
  const description = stringValue(value.description, 1_000);
  const addedScopeItems = stringArray(value.addedScopeItems);
  const extraMinutes = value.extraMinutes == null ? null : positiveInteger(value.extraMinutes);
  const currency = value.commercial.currency;
  const labourAmount = decimalMoney(value.commercial.labourAmount, currency);
  const materialsAmount = decimalMoney(value.commercial.materialsAmount, currency);
  const additionalAmount = decimalMoney(value.commercial.additionalAmount, currency);
  const originalTotalAmount = decimalMoney(value.commercial.originalTotalAmount, currency);
  const revisedTotalAmount = decimalMoney(value.commercial.revisedTotalAmount, currency);
  const expiresAt = nullableIso(value.expiresAt);
  if (!changeId || !version || !baseScopeVersion || !status || !description || !addedScopeItems
      || (value.extraMinutes != null && !extraMinutes) || !labourAmount || !materialsAmount
      || !additionalAmount || !originalTotalAmount || !revisedTotalAmount || expiresAt === undefined
      || labourAmount.amountMinor + materialsAmount.amountMinor !== additionalAmount.amountMinor
      || originalTotalAmount.amountMinor + additionalAmount.amountMinor !== revisedTotalAmount.amountMinor) return null;
  return Object.freeze({
    id: changeId,
    version,
    baseScopeVersion,
    status,
    description,
    addedScopeItems,
    extraMinutes,
    labourAmount,
    materialsAmount,
    additionalAmount,
    originalTotalAmount,
    revisedTotalAmount,
    expiresAt,
  });
}

function parseReschedule(value: unknown): GroundedReschedule | null {
  if (!isRecord(value)) return null;
  const rescheduleId = id(value.id);
  const version = positiveInteger(value.version);
  const scheduleRevision = positiveInteger(value.scheduleRevision);
  const statuses = new Set(['pending', 'accepted', 'declined', 'expired']);
  const status = statuses.has(String(value.status)) ? value.status as GroundedReschedule['status'] : null;
  const proposedByRole = value.proposedByRole === 'customer' || value.proposedByRole === 'worker'
    ? value.proposedByRole
    : null;
  const originalStartsAt = iso(value.originalStartsAt);
  const proposedStartsAt = iso(value.proposedStartsAt);
  const reason = value.reason == null ? null : stringValue(value.reason, 500);
  const expiresAt = iso(value.expiresAt);
  const decidedAt = nullableIso(value.decidedAt);
  if (!rescheduleId || !version || !scheduleRevision || !status || !proposedByRole
      || !originalStartsAt || !proposedStartsAt || (value.reason != null && !reason)
      || !expiresAt || decidedAt === undefined
      || (status === 'pending' && decidedAt !== null)
      || ((status === 'accepted' || status === 'declined') && decidedAt === null)) return null;
  return Object.freeze({
    id: rescheduleId,
    version,
    scheduleRevision,
    status,
    proposedByRole,
    originalStartsAt,
    proposedStartsAt,
    reason,
    expiresAt,
    decidedAt,
  });
}

const ACTION_KEYS = [
  'startRoute', 'markArrived', 'proposeScope', 'decideScope', 'revealStartPin', 'startWork',
  'proposeReschedule', 'decideReschedule', 'proposeChangeOrder', 'decideChangeOrder',
  'reportNoShow', 'requestReplacement',
] as const;

export function adaptGroundedFulfilmentV1(input: unknown): FulfilmentAdaptResult<GroundedFulfilment> {
  if (!isRecord(input)) return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'fulfilment' });
  const projectId = id(input.projectId);
  const revision = nonNegativeInteger(input.revision);
  const phases = new Set<GroundedFulfilmentPhase>([
    'matching', 'assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation',
    'work_active', 'completion_review', 'payment_pending', 'closed',
  ]);
  const operationalPhase = phases.has(input.operationalPhase as GroundedFulfilmentPhase)
    ? input.operationalPhase as GroundedFulfilmentPhase
    : null;
  const transactionalStatus = stringValue(input.transactionalStatus, 80);
  const updatedAt = iso(input.updatedAt);
  if (input.schema !== 'togt.fulfilment.v1' || !projectId || revision === null
      || !operationalPhase || !transactionalStatus || !updatedAt) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'identity' });
  }
  if (!isRecord(input.schedule) || !isRecord(input.location) || !isRecord(input.participants)
      || !isRecord(input.scope) || !isRecord(input.start) || !isRecord(input.allowedActions)
      || !isRecord(input.integrity)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'shape' });
  }
  const scheduleRevision = positiveInteger(input.schedule.revision);
  const startsAt = iso(input.schedule.startsAt);
  const latitude = isRecord(input.location.coordinate)
    ? coordinate(input.location.coordinate.latitude, -90, 90)
    : null;
  const longitude = isRecord(input.location.coordinate)
    ? coordinate(input.location.coordinate.longitude, -180, 180)
    : null;
  const precision = input.location.precision === 'exact' || input.location.precision === 'approximate'
    ? input.location.precision
    : null;
  const address = input.location.address == null ? null : stringValue(input.location.address, 500);
  const label = input.location.label == null ? null : stringValue(input.location.label, 160);
  if (!scheduleRevision || !startsAt || latitude === null || longitude === null || !precision
      || (precision === 'exact' && !address) || (precision === 'approximate' && !label)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'schedule_location' });
  }
  const customerRaw = isRecord(input.participants.customer) ? input.participants.customer : null;
  const workerRaw = isRecord(input.participants.worker) ? input.participants.worker : null;
  const customerName = customerRaw ? stringValue(customerRaw.displayName, 100) : null;
  const workerName = workerRaw ? stringValue(workerRaw.displayName, 100) : null;
  const customerPhone = customerRaw ? phone(customerRaw.phone) : undefined;
  const workerPhone = workerRaw ? phone(workerRaw.phone) : undefined;
  if (!customerName || !workerName || customerPhone === undefined || workerPhone === undefined) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'participants' });
  }
  const current = parseScope(input.scope.current);
  const proposal = parseScope(input.scope.proposal);
  if (current === undefined || proposal === undefined) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'scope' });
  }
  const startStatuses = new Set(['not_issued', 'active', 'consumed', 'locked', 'revoked', 'expired']);
  const startStatus = startStatuses.has(String(input.start.status))
    ? input.start.status as GroundedFulfilment['start']['status']
    : null;
  const scopeVersion = input.start.scopeVersion == null ? null : positiveInteger(input.start.scopeVersion);
  const failedAttempts = input.start.failedAttempts == null ? null : nonNegativeInteger(input.start.failedAttempts);
  const attemptsRemaining = input.start.attemptsRemaining == null ? null : nonNegativeInteger(input.start.attemptsRemaining);
  const expiresAt = nullableIso(input.start.expiresAt);
  const workStartedAt = nullableIso(input.start.workStartedAt);
  if (!startStatus || (input.start.scopeVersion != null && !scopeVersion)
      || (input.start.failedAttempts != null && failedAttempts === null)
      || (input.start.attemptsRemaining != null && attemptsRemaining === null)
      || expiresAt === undefined || workStartedAt === undefined
      || typeof input.start.customerCanReveal !== 'boolean' || typeof input.start.workerMustEnter !== 'boolean') {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'start' });
  }
  if (!Array.isArray(input.reschedules) || !Array.isArray(input.changeOrders)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'change_orders' });
  }
  const reschedules: GroundedReschedule[] = [];
  for (const raw of input.reschedules) {
    const reschedule = parseReschedule(raw);
    if (!reschedule) return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'reschedules' });
    reschedules.push(reschedule);
  }
  const changeOrders: GroundedChangeOrder[] = [];
  for (const raw of input.changeOrders) {
    const change = parseChangeOrder(raw);
    if (!change) return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'change_orders' });
    changeOrders.push(change);
  }
  const actions: Record<string, boolean> = {};
  for (const key of ACTION_KEYS) {
    if (typeof input.allowedActions[key] !== 'boolean') {
      return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'allowed_actions' });
    }
    actions[key] = input.allowedActions[key] as boolean;
  }
  const policyVersion = input.integrity.policyVersion == null ? null : stringValue(input.integrity.policyVersion, 120);
  if (typeof input.integrity.policySnapshotPresent !== 'boolean'
      || typeof input.integrity.readOnly !== 'boolean'
      || (input.integrity.policyVersion != null && !policyVersion)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'integrity' });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schema: 'togt.fulfilment.v1',
      projectId,
      revision,
      transactionalStatus,
      operationalPhase,
      schedule: Object.freeze({ revision: scheduleRevision, startsAt }),
      location: Object.freeze({ precision, label, address, latitude, longitude }),
      participants: Object.freeze({
        customer: Object.freeze({ displayName: customerName, phone: customerPhone }),
        worker: Object.freeze({ displayName: workerName, phone: workerPhone }),
      }),
      scope: Object.freeze({ current, proposal }),
      start: Object.freeze({
        status: startStatus,
        scopeVersion,
        failedAttempts,
        attemptsRemaining,
        expiresAt,
        customerCanReveal: input.start.customerCanReveal,
        workerMustEnter: input.start.workerMustEnter,
        workStartedAt,
      }),
      reschedules: Object.freeze(reschedules),
      changeOrders: Object.freeze(changeOrders),
      allowedActions: Object.freeze(actions) as GroundedFulfilment['allowedActions'],
      integrity: Object.freeze({
        policySnapshotPresent: input.integrity.policySnapshotPresent,
        policyVersion,
        readOnly: input.integrity.readOnly,
      }),
      updatedAt,
    }),
  });
}

function customerScopeStatus(scope: GroundedScope): ScopeSnapshot['status'] {
  if (scope.status === 'confirmed') return 'confirmed';
  if (scope.status === 'declined') return 'revision_declined';
  if (scope.status === 'superseded') return 'cancelled';
  return scope.proposedByRole === 'worker' ? 'pending_customer' : 'pending_worker';
}

function customerScopeSnapshot(
  fulfilment: GroundedFulfilment,
  scope: GroundedScope,
  revealedPin: string | null,
): ScopeSnapshot {
  const pinAvailable = revealedPin !== null && /^\d{6}$/.test(revealedPin)
    && fulfilment.start.status === 'active';
  const itemStatus = scope.customerConfirmedAt
    ? 'customer_confirmed' as const
    : scope.workerConfirmedAt
      ? 'worker_confirmed' as const
      : 'unconfirmed' as const;
  return Object.freeze({
    scopeId: `scope:${fulfilment.projectId}:v${scope.version}`,
    version: scope.version,
    status: customerScopeStatus(scope),
    included: scope.items,
    excluded: Object.freeze([]),
    checklist: Object.freeze(scope.items.map((label, index) => Object.freeze({
      itemId: `scope-item:${scope.version}:${index + 1}`,
      label,
      status: itemStatus,
    }))),
    materialsResponsibility: scope.materialsResponsibility,
    timeAndRateLabel: scope.estimatedMinutes === null
      ? 'Duration evidence is not available; price follows the accepted Project agreement.'
      : `${scope.estimatedMinutes} estimated minutes; price follows the accepted Project agreement.`,
    totalOrCap: null,
    workerConfirmedAt: scope.workerConfirmedAt,
    customerConfirmedAt: scope.customerConfirmedAt,
    startPin: Object.freeze({
      status: fulfilment.start.status === 'consumed'
        ? 'verified'
        : fulfilment.start.status === 'locked'
          ? 'locked'
          : pinAvailable
            ? 'available'
            : 'hidden',
      value: pinAvailable ? revealedPin : null,
      attemptsRemaining: fulfilment.start.attemptsRemaining,
    }),
  });
}

export function customerScopeFromFulfilmentV1(
  fulfilment: GroundedFulfilment,
  revealedPin: string | null = null,
): FulfilmentAdaptResult<ScopeConfirmationViewSnapshot> {
  const scope = fulfilment.scope.proposal ?? fulfilment.scope.current;
  if (!scope) return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'scope_unavailable' });
  if (revealedPin !== null && !/^\d{6}$/.test(revealedPin)) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'start_pin' });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: fulfilment.projectId,
      stateVersion: fulfilment.revision,
      scope: customerScopeSnapshot(fulfilment, scope, revealedPin),
    }),
  });
}

function elapsedLabel(startedAt: string | null, updatedAt: string): string | null {
  if (!startedAt) return null;
  const minutes = Math.max(0, Math.floor((Date.parse(updatedAt) - Date.parse(startedAt)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function customerChangeOrder(change: GroundedChangeOrder): ChangeOrder {
  return Object.freeze({
    changeOrderId: change.id,
    version: change.version,
    status: change.status,
    existingAgreementSummary: `Scope version ${change.baseScopeVersion}`,
    extraDescription: change.description,
    addedTimeLabel: change.extraMinutes === null ? null : `${change.extraMinutes} minutes`,
    materialsLabel: change.addedScopeItems.length > 0 ? change.addedScopeItems.join('; ') : null,
    baseTotal: change.originalTotalAmount,
    additionalAmount: change.additionalAmount,
    revisedTotal: change.revisedTotalAmount,
    expiresAt: change.expiresAt,
  });
}

export function customerActiveWorkFromFulfilmentV1(
  fulfilment: GroundedFulfilment,
): FulfilmentAdaptResult<ActiveWorkSnapshot> {
  const current = fulfilment.scope.current;
  if (!current || current.status !== 'confirmed') {
    return Object.freeze({ ok: false, reasonCode: 'invalid_fulfilment_contract', field: 'confirmed_scope_unavailable' });
  }
  const lastApproved = [...fulfilment.changeOrders]
    .filter((change) => change.status === 'approved')
    .sort((left, right) => right.version - left.version)[0] ?? null;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: fulfilment.projectId,
      stateVersion: fulfilment.revision,
      elapsedLabel: elapsedLabel(fulfilment.start.workStartedAt, fulfilment.updatedAt),
      currentScope: customerScopeSnapshot(fulfilment, current, null),
      runningEstimate: lastApproved?.revisedTotalAmount ?? null,
      changeOrders: Object.freeze(fulfilment.changeOrders.map(customerChangeOrder)),
    }),
  });
}
