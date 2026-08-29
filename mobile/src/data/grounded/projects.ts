import type {
  CommercialSnapshot,
  CompletionPaymentViewSnapshot,
  OperationalPhase,
  PaymentSnapshot,
  PriceEvidence,
  ProjectHubSnapshot,
  ProjectListItem,
  ProjectSegment,
  TrackingEvidence,
  WorkerChoice,
} from '../../features/customer/projects';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type ProjectAdaptResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_project_contract'; field: string }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function positiveVersion(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonNegativeRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function text(value: unknown, max = 1_000): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= max ? candidate : null;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function decimalMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  const amount = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function phase(value: unknown): OperationalPhase {
  const phases = new Set<OperationalPhase>([
    'matching', 'assigned', 'scheduled', 'en_route', 'arrived', 'scope_confirmation',
    'work_active', 'completion_review', 'payment_pending', 'closed',
  ]);
  return phases.has(value as OperationalPhase) ? value as OperationalPhase : 'unknown';
}

function segment(value: unknown): ProjectSegment | null {
  return value === 'active' || value === 'upcoming' || value === 'past' ? value : null;
}

function scheduleText(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const startsAt = iso(raw.startsAt);
  if (!startsAt) return null;
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(startsAt));
}

function areaText(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (raw.precision === 'exact') return text(raw.address, 500);
  return text(raw.label, 160);
}

function paymentSnapshot(raw: unknown): PaymentSnapshot {
  if (!isRecord(raw)) {
    return Object.freeze({
      obligationStatus: 'unknown',
      amountDue: null,
      amountPaid: null,
      attemptStatus: 'uncertain',
      methodLabel: null,
      checkoutCapability: 'unavailable',
      checkoutUnavailableReason: 'Payment status could not be verified.',
      cashStatus: 'not_available',
      providerReturnState: 'awaiting_reconciliation',
      refundStatus: 'none',
      paymentDisputeStatus: 'none',
      fundingAssurance: Object.freeze({ status: 'not_required', kindLabel: null, assuredAmount: null }),
      lastReconciledAt: null,
    });
  }
  const amountMinor = raw.currency === 'ZAR' ? decimalMinor(raw.amount) : null;
  const money = amountMinor === null ? null : Object.freeze({ amountMinor, currency: 'ZAR' as const });
  const status = raw.status;
  const obligationStatus = status === 'paid'
    ? 'paid' as const
    : status === 'pending' || status === 'failed'
      ? 'due' as const
      : status === 'refunded'
        ? 'voided' as const
        : status === 'not_created'
          ? 'not_due' as const
          : 'unknown' as const;
  const attemptStatus = status === 'paid'
    ? 'successful' as const
    : status === 'pending'
      ? 'pending' as const
      : status === 'failed'
        ? 'failed' as const
        : status === 'not_created'
          ? 'not_started' as const
          : 'uncertain' as const;
  return Object.freeze({
    obligationStatus,
    amountDue: obligationStatus === 'due' ? money : null,
    amountPaid: obligationStatus === 'paid' ? money : null,
    attemptStatus,
    methodLabel: null,
    checkoutCapability: 'unavailable',
    checkoutUnavailableReason: 'Online checkout is disabled in this build.',
    cashStatus: 'not_available',
    providerReturnState: attemptStatus === 'pending' || attemptStatus === 'uncertain'
      ? 'awaiting_reconciliation'
      : attemptStatus === 'successful'
        ? 'complete'
        : 'not_started',
    refundStatus: status === 'refunded' ? 'full' : 'none',
    paymentDisputeStatus: 'none',
    fundingAssurance: Object.freeze({ status: 'not_required', kindLabel: null, assuredAmount: null }),
    lastReconciledAt: iso(raw.updatedAt),
  });
}

function serviceIdentity(raw: unknown): Readonly<{ id: string | null; version: number | null; label: string; snapshot: JsonRecord | null }> | null {
  if (!isRecord(raw)) return null;
  const label = text(raw.label, 120);
  if (!label) return null;
  const serviceId = raw.id == null ? null : id(raw.id);
  const serviceVersion = raw.version == null ? null : positiveVersion(raw.version);
  if ((raw.id != null && serviceId === null)
      || (raw.version != null && serviceVersion === null)
      || (serviceId === null) !== (serviceVersion === null)) return null;
  return Object.freeze({
    id: serviceId,
    version: serviceVersion,
    label,
    snapshot: isRecord(raw.snapshot) ? raw.snapshot : null,
  });
}

function commercialPrice(commercialRaw: unknown): PriceEvidence {
  if (!isRecord(commercialRaw)) return Object.freeze({ kind: 'not_yet_available', reasonCode: 'data_unavailable' });
  const accepted = isRecord(commercialRaw.acceptedQuote) ? commercialRaw.acceptedQuote : null;
  const acceptedCommercial = accepted && isRecord(accepted.commercial) ? accepted.commercial : null;
  const acceptedTotal = acceptedCommercial?.currency === 'ZAR'
    ? decimalMinor(acceptedCommercial.customerTotalAmount)
    : null;
  const quoteId = accepted ? id(accepted.quoteId) : null;
  const quoteVersion = accepted ? positiveVersion(accepted.quoteVersion) : null;
  if (acceptedTotal !== null && quoteId && quoteVersion) {
    return Object.freeze({
      kind: 'quote',
      total: Object.freeze({ amountMinor: acceptedTotal, currency: 'ZAR' }),
      quoteId,
      quoteVersion,
      expiresAt: null,
    });
  }
  const total = commercialRaw.currency === 'ZAR' ? decimalMinor(commercialRaw.agreedTotal) : null;
  return total === null
    ? Object.freeze({ kind: 'not_yet_available', reasonCode: 'data_unavailable' })
    : Object.freeze({
        kind: 'recorded_total',
        total: Object.freeze({ amountMinor: total, currency: 'ZAR' }),
        label: 'Recorded Project total; pricing mode is not available.',
      });
}

function workerChoice(rawParticipants: unknown, service: ReturnType<typeof serviceIdentity>, price: PriceEvidence): WorkerChoice | null {
  if (!isRecord(rawParticipants) || !service?.id || !service.version) return null;
  const raw = isRecord(rawParticipants.worker) ? rawParticipants.worker : null;
  const workerId = raw ? id(raw.id) : null;
  const displayName = raw ? text(raw.displayName, 100) : null;
  if (!raw || !workerId || !displayName) return null;
  const trust = isRecord(raw.trust) ? raw.trust : null;
  const rating = trust && typeof trust.rating === 'number' && trust.rating >= 1 && trust.rating <= 5
    && Number.isSafeInteger(trust.reviewCount) && Number(trust.reviewCount) > 0
    ? Object.freeze({ average: trust.rating, count: Number(trust.reviewCount) })
    : null;
  const verification = trust?.verified === true
    ? Object.freeze([Object.freeze({
        id: 'identity-verification',
        label: 'Identity verification',
        status: 'verified' as const,
        detail: 'The server reports an approved identity-verification state.',
      })])
    : Object.freeze([]);
  const photoUrl = raw.avatarUrl === undefined ? null : text(raw.avatarUrl, 2_048);
  return Object.freeze({
    workerId,
    displayName,
    photoUrl,
    serviceId: service.id,
    serviceVersion: service.version,
    serviceLabel: service.label,
    availabilityLabel: null,
    price,
    rating,
    completedJobs: null,
    reliabilityLabel: null,
    distanceLabel: null,
    serviceAreaLabel: null,
    whyMatch: null,
    verification,
    selectionKind: 'scheduled_request',
  });
}

function paymentStatusForList(payment: PaymentSnapshot): ProjectListItem['paymentStatus'] {
  return payment.obligationStatus;
}

export function adaptProjectListItemV1(input: unknown): ProjectAdaptResult<ProjectListItem> {
  if (!isRecord(input)) return Object.freeze({ ok: false, reasonCode: 'invalid_project_contract', field: 'project' });
  const projectId = id(input.id);
  const revision = nonNegativeRevision(input.revision);
  const projectSegment = segment(input.segment);
  const service = serviceIdentity(input.service);
  const schedule = scheduleText(input.schedule);
  const area = areaText(input.area);
  const operational = isRecord(input.operational) ? input.operational : null;
  const operationalPhase = phase(operational?.phase);
  const operationalLabel = text(operational?.label, 160);
  const updatedAt = iso(input.updatedAt);
  if (!projectId || revision === null || !projectSegment || !service || !schedule || !area || !operationalLabel || !updatedAt) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_project_contract', field: 'summary' });
  }
  const participants = isRecord(input.participants) ? input.participants : null;
  const worker = participants && isRecord(participants.worker) ? participants.worker : null;
  const workerId = worker ? id(worker.id) : null;
  const workerName = worker ? text(worker.displayName, 100) : null;
  const workerPhotoUrl = worker && typeof worker.avatarUrl === 'string' ? text(worker.avatarUrl, 2_048) : null;
  const payment = paymentSnapshot(input.payment);
  const closed = operationalPhase === 'closed';
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId,
      segment: projectSegment,
      stateVersion: revision,
      serviceId: service.id,
      serviceVersion: service.version,
      serviceLabel: service.label,
      workerId,
      workerName,
      workerPhotoUrl,
      scheduleLabel: schedule,
      operationalPhase,
      operationalLabel,
      areaLabel: area,
      paymentStatus: paymentStatusForList(payment),
      canReschedule: false,
      canCancel: false,
      hasReceipt: closed && payment.obligationStatus === 'paid',
      canRate: closed && input.transactionalStatus === 'completed',
      canRebook: false,
    }),
  });
}

function scopeSummary(input: JsonRecord): string {
  const commercial = isRecord(input.commercial) ? input.commercial : null;
  const accepted = commercial && isRecord(commercial.acceptedQuote) ? commercial.acceptedQuote : null;
  const acceptedScope = accepted && isRecord(accepted.scope) ? accepted.scope : null;
  const quoteScope = acceptedScope ? text(acceptedScope.scope, 4_000) : null;
  if (quoteScope) return quoteScope;
  const scope = isRecord(input.scope) ? input.scope : null;
  if (!scope || !Array.isArray(scope.items)) return 'Scope details are unavailable.';
  const labels = scope.items.flatMap((item) => {
    if (typeof item === 'string') return [item.trim()].filter(Boolean);
    if (isRecord(item)) return [text(item.label, 500)].filter((value): value is string => value !== null);
    return [];
  });
  return labels.length > 0 ? labels.join('; ') : 'Scope details are unavailable.';
}

function commercialSnapshot(input: JsonRecord, service: NonNullable<ReturnType<typeof serviceIdentity>>): CommercialSnapshot {
  const raw = isRecord(input.commercial) ? input.commercial : {};
  const price = commercialPrice(raw);
  const frozen = isRecord(raw.frozenSnapshot) ? raw.frozenSnapshot : null;
  const accepted = isRecord(raw.acceptedQuote) ? raw.acceptedQuote : null;
  const acceptedScope = accepted && isRecord(accepted.scope) ? accepted.scope : null;
  const assumptions = acceptedScope && Array.isArray(acceptedScope.assumptions)
    ? acceptedScope.assumptions.flatMap((item) => typeof item === 'string' ? [item.trim()] : []).filter(Boolean)
    : [];
  return Object.freeze({
    snapshotId: frozen ? id(frozen.id) : accepted ? id(accepted.quoteId) : null,
    version: frozen ? positiveVersion(frozen.version) : accepted ? positiveVersion(accepted.quoteVersion) : null,
    pricingMode: price.kind,
    price,
    scopeSummary: scopeSummary(input),
    materialsSummary: assumptions.length > 0
      ? assumptions.join('; ')
      : service.snapshot && isRecord(service.snapshot.materialsRules) && text(service.snapshot.materialsRules.summary, 500)
        ? String(service.snapshot.materialsRules.summary)
        : 'Materials evidence is not available.',
  });
}

export function adaptProjectHubV1(input: unknown): ProjectAdaptResult<ProjectHubSnapshot> {
  if (!isRecord(input)) return Object.freeze({ ok: false, reasonCode: 'invalid_project_contract', field: 'project' });
  const projectId = id(input.id);
  const revision = nonNegativeRevision(input.revision);
  const service = serviceIdentity(input.service);
  const operational = isRecord(input.operational) ? input.operational : null;
  const currentPhase = phase(operational?.phase);
  const phaseLabel = text(operational?.label, 160);
  const phaseUpdatedAt = iso(input.updatedAt);
  const schedule = scheduleText(input.schedule);
  const area = areaText(input.area);
  if (!projectId || revision === null || !service || !phaseLabel || !phaseUpdatedAt || !schedule || !area) {
    return Object.freeze({ ok: false, reasonCode: 'invalid_project_contract', field: 'detail' });
  }
  const commercial = commercialSnapshot(input, service);
  const worker = workerChoice(input.participants, service, commercial.price);
  const timelineRaw = Array.isArray(input.timeline) ? input.timeline : [];
  const timeline = timelineRaw.flatMap((event, index) => {
    if (!isRecord(event)) return [];
    const eventId = id(event.id);
    const occurredAt = iso(event.occurredAt);
    const label = text(event.label, 200);
    if (!eventId || !occurredAt || !label) return [];
    const eventPhase = phase(event.phase);
    const issue = event.type === 'completion.disputed' || String(event.type).includes('issue');
    return [Object.freeze({
      eventId,
      occurredAt,
      label,
      detail: null,
      status: issue ? 'issue' as const : eventPhase === currentPhase && index === timelineRaw.length - 1 ? 'current' as const : 'complete' as const,
    })];
  });
  const exactAddress = isRecord(input.area) && input.area.precision === 'exact' ? text(input.area.address, 500) : null;
  const participants = isRecord(input.participants) ? input.participants : null;
  const workerParticipant = participants && isRecord(participants.worker) ? participants.worker : null;
  const completion = isRecord(input.completion) ? input.completion : null;
  const issue = completion && isRecord(completion.issue) ? completion.issue : null;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId,
      stateVersion: revision,
      serviceId: service.id,
      serviceVersion: service.version,
      serviceLabel: service.label,
      phase: currentPhase,
      phaseLabel,
      phaseUpdatedAt,
      scheduleLabel: schedule,
      areaLabel: area,
      exactAddressLabel: exactAddress ?? 'Exact address is not available in this Project state.',
      worker,
      timeline: Object.freeze(timeline),
      commercial,
      payment: paymentSnapshot(input.payment),
      safetyCapability: 'minimum',
      canChat: worker !== null && currentPhase !== 'closed',
      canContact: typeof workerParticipant?.phone === 'string',
      canShareSafeStatus: false,
      openIssue: issue && id(issue.id) && text(issue.reason, 1_000)
        ? Object.freeze({ issueId: id(issue.id) as string, label: text(issue.reason, 1_000) as string })
        : null,
    }),
  });
}

export function trackingEvidenceFromProjectV1(input: unknown): TrackingEvidence {
  if (!isRecord(input)) return Object.freeze({ visibility: 'unavailable', lastKnownAt: null });
  const currentPhase = isRecord(input.operational) ? phase(input.operational.phase) : 'unknown';
  if (currentPhase === 'closed') return Object.freeze({ visibility: 'hidden', reason: 'after_terminal_state' });
  if (currentPhase !== 'en_route' && currentPhase !== 'arrived') {
    return Object.freeze({ visibility: 'hidden', reason: 'before_reveal_window' });
  }
  const raw = isRecord(input.workerLiveLocation) ? input.workerLiveLocation : null;
  const coordinate = raw && isRecord(raw.coordinate) ? raw.coordinate : null;
  const capturedAt = raw ? iso(raw.updatedAt) : null;
  const latitude = coordinate ? Number(coordinate.latitude) : NaN;
  const longitude = coordinate ? Number(coordinate.longitude) : NaN;
  if (!capturedAt || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return Object.freeze({ visibility: 'not_shared', reason: 'worker_not_sharing' });
  }
  return Object.freeze({
    visibility: 'available',
    capturedAt,
    latitude,
    longitude,
    accuracyMetres: null,
    etaLabel: null,
  });
}

export function completionPaymentFromProjectV1(input: unknown): ProjectAdaptResult<CompletionPaymentViewSnapshot> {
  const hub = adaptProjectHubV1(input);
  if (!hub.ok || !isRecord(input)) return Object.freeze({ ok: false, reasonCode: 'invalid_project_contract', field: 'completion' });
  const completionRaw = isRecord(input.completion) ? input.completion : {};
  const status = completionRaw.status === 'requested' || completionRaw.status === 'confirmed' || completionRaw.status === 'disputed'
    ? completionRaw.status
    : 'not_requested';
  const finalPrice = hub.value.commercial.price;
  const finalAmount = finalPrice.kind === 'fixed' || finalPrice.kind === 'recorded_total' || finalPrice.kind === 'quote'
    ? finalPrice.total
    : finalPrice.kind === 'diagnostic'
      ? finalPrice.visitTotal
      : null;
  const paymentRaw = isRecord(input.payment) ? input.payment : null;
  const paymentRecordId = paymentRaw ? id(paymentRaw.recordId) : null;
  const paymentIssuedAt = paymentRaw ? iso(paymentRaw.updatedAt) : null;
  const paymentAmountMinor = paymentRaw?.currency === 'ZAR' ? decimalMinor(paymentRaw.amount) : null;
  const receipt = paymentRecordId
    && paymentIssuedAt
    && paymentAmountMinor !== null
    && (paymentRaw?.status === 'paid' || paymentRaw?.status === 'refunded')
    ? Object.freeze({
        receiptId: paymentRecordId,
        projectId: hub.value.projectId,
        issuedAt: paymentIssuedAt,
        serviceLabel: hub.value.serviceLabel,
        amount: Object.freeze({ amountMinor: paymentAmountMinor, currency: 'ZAR' as const }),
        feeAndTaxLabel: 'No audited fee or tax breakdown is configured for this payment record.',
        methodLabel: 'Payment method not recorded',
        statusLabel: paymentRaw.status === 'paid' ? 'Paid' : 'Refunded',
        supportReference: `Project ${hub.value.projectId}; payment ${paymentRecordId}`,
      })
    : null;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      projectId: hub.value.projectId,
      stateVersion: hub.value.stateVersion,
      workerId: hub.value.worker?.workerId ?? null,
      completion: Object.freeze({
        projectId: hub.value.projectId,
        stateVersion: hub.value.stateVersion,
        status,
        requestedAt: iso(completionRaw.requestedAt),
        scopeSummary: hub.value.commercial.scopeSummary,
        evidenceLabels: Object.freeze([]),
        finalAmount,
        openIssue: hub.value.openIssue,
      }),
      payment: hub.value.payment,
      receipt,
      rating: Object.freeze({
        state: 'not_open',
        selectedValue: null,
        reasonLabels: Object.freeze([]),
        publicationLabel: 'Rating state is shown only after the server returns a supported rating contract.',
      }),
      retention: Object.freeze({
        relationshipsAvailable: false,
        favouriteAllowed: false,
        rebookAllowed: false,
      }),
    }),
  });
}
