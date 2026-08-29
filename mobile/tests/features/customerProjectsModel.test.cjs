'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CUSTOMER_PROJECT_SCHEMA_VERSION,
  canShowRetentionActions,
  createCustomerCommandIntent,
  deriveMatchingView,
  derivePaymentView,
  derivePrivacyView,
  deriveScopeReadiness,
  deriveTravelView,
  groupProjects,
  validateChangeOrder,
  validateWorkerChoice,
} = require('../../src/features/customer/projects/model.ts');

const money = (amountMinor) => Object.freeze({ amountMinor, currency: 'ZAR' });

function worker(overrides = {}) {
  return Object.freeze({
    workerId: 'worker-alpha',
    displayName: 'Test Worker',
    photoUrl: null,
    serviceId: 'service-plumbing',
    serviceVersion: 2,
    serviceLabel: 'Tap repair',
    availabilityLabel: 'Tomorrow at 10:00',
    price: Object.freeze({ kind: 'fixed', total: money(45000), label: 'Fixed total' }),
    rating: null,
    completedJobs: null,
    reliabilityLabel: null,
    distanceLabel: null,
    serviceAreaLabel: 'Roodepoort',
    whyMatch: null,
    verification: Object.freeze([]),
    selectionKind: 'scheduled_request',
    ...overrides,
  });
}

function payment(overrides = {}) {
  return Object.freeze({
    obligationStatus: 'due',
    amountDue: money(45000),
    amountPaid: null,
    attemptStatus: 'not_started',
    methodLabel: null,
    checkoutCapability: 'unavailable',
    checkoutUnavailableReason: 'Online checkout is disabled in this build.',
    cashStatus: 'not_available',
    providerReturnState: 'not_started',
    refundStatus: 'none',
    paymentDisputeStatus: 'none',
    fundingAssurance: Object.freeze({ status: 'not_required', kindLabel: null, assuredAmount: null }),
    lastReconciledAt: null,
    ...overrides,
  });
}

test('idempotent customer command intents are deterministic and fail closed offline', () => {
  const input = {
    actorId: 'customer-one',
    command: 'approve_change_order',
    connectionState: 'online',
    projectId: 'project-one',
    requestKey: 'approve-change-1',
    stateVersion: 7,
    targetId: 'change-one',
    payload: { changeOrderVersion: 2 },
  };
  const first = createCustomerCommandIntent(input);
  const duplicate = createCustomerCommandIntent(input);
  const changedVersion = createCustomerCommandIntent({ ...input, stateVersion: 8 });
  const offline = createCustomerCommandIntent({ ...input, connectionState: 'offline' });

  assert.equal(first.ok, true);
  assert.equal(first.intent.schemaVersion, CUSTOMER_PROJECT_SCHEMA_VERSION);
  assert.equal(first.intent.idempotencyKey, duplicate.intent.idempotencyKey);
  assert.notEqual(first.intent.idempotencyKey, changedVersion.intent.idempotencyKey);
  assert.deepEqual(offline, { ok: false, reasonCode: 'offline' });
  assert.equal(Object.isFrozen(first.intent), true);
  assert.equal(Object.isFrozen(first.intent.payload), true);
});

test('invalid or caller-generated-looking identities cannot create a command', () => {
  assert.deepEqual(createCustomerCommandIntent({
    actorId: 'customer one',
    command: 'cancel_project',
    connectionState: 'online',
    projectId: 'project-one',
    requestKey: 'key-one',
    stateVersion: 1,
  }), { ok: false, reasonCode: 'invalid_identity' });
  assert.deepEqual(createCustomerCommandIntent({
    actorId: 'customer-one',
    command: 'cancel_project',
    connectionState: 'online',
    projectId: 'project-one',
    requestKey: 'key-one',
    stateVersion: -1,
  }), { ok: false, reasonCode: 'invalid_version' });
});

test('chat command payload accepts the advertised 2048-character boundary only', () => {
  const input = {
    actorId: 'customer-one',
    command: 'send_message',
    connectionState: 'online',
    projectId: 'project-one',
    requestKey: 'message-one',
    stateVersion: 1,
  };
  assert.equal(createCustomerCommandIntent({ ...input, payload: { body: 'a'.repeat(2_048) } }).ok, true);
  assert.deepEqual(
    createCustomerCommandIntent({ ...input, payload: { body: 'a'.repeat(2_049) } }),
    { ok: false, reasonCode: 'invalid_payload' },
  );
  assert.deepEqual(
    createCustomerCommandIntent({ ...input, command: 'report_issue', payload: { body: 'a'.repeat(1_001) } }),
    { ok: false, reasonCode: 'invalid_payload' },
  );
});

test('Fast Match uses truthful distinct progress and terminal recovery states', () => {
  const base = {
    mode: 'fast_match',
    requestId: 'match-one',
    projectId: 'project-one',
    stateVersion: 3,
    elapsedSeconds: 45,
    summary: 'Tap repair',
    areaLabel: 'Roodepoort',
    matchedWorker: null,
    matchedHourlyTerms: null,
  };
  const waiting = deriveMatchingView({ ...base, status: 'waiting_for_response' });
  const none = deriveMatchingView({ ...base, status: 'no_candidates' });
  const lost = deriveMatchingView({ ...base, status: 'connection_lost' });

  assert.equal(waiting.showCancel, true);
  assert.match(waiting.statusLabel, /Waiting for response/);
  assert.equal(none.terminal, true);
  assert.equal(none.recovery.action, 'retry_match');
  assert.equal(lost.terminal, false);
  assert.match(lost.body, /server state/i);
});

test('hourly Fast Match does not become operational before customer rate confirmation', () => {
  const matchedWorker = worker({
    price: Object.freeze({
      kind: 'hourly',
      rate: money(30000),
      estimatedTotal: Object.freeze({ min: money(30000), max: money(60000) }),
      approvalCap: money(70000),
    }),
  });
  const view = deriveMatchingView({
    mode: 'fast_match',
    requestId: 'match-hourly',
    projectId: 'project-hourly',
    stateVersion: 4,
    status: 'awaiting_customer_rate_confirmation',
    elapsedSeconds: 20,
    summary: 'Hourly repair',
    areaLabel: 'Randburg',
    matchedWorker,
    matchedHourlyTerms: matchedWorker.price,
  });

  assert.equal(view.terminal, false);
  assert.equal(view.confirmedWorker, null);
  assert.match(view.statusLabel, /Confirm the matched rate/);
});

test('a matched state with missing Worker evidence cannot claim confirmation', () => {
  const view = deriveMatchingView({
    mode: 'fast_match', requestId: 'match-incomplete', projectId: 'project-incomplete', stateVersion: 2,
    status: 'matched', elapsedSeconds: 12, summary: 'Repair', areaLabel: 'Broad area',
    matchedWorker: null, matchedHourlyTerms: null,
  });
  assert.equal(view.confirmedWorker, null);
  assert.equal(view.terminal, false);
  assert.equal(view.recovery.action, 'retry_match');
  assert.match(view.statusLabel, /details unavailable/i);
});

test('Compare, Quotes and Diagnostic expose different confirmation contracts', () => {
  const choice = worker();
  const compare = deriveMatchingView({
    mode: 'compare_workers', requestId: 'compare-one', projectId: 'project-one', stateVersion: 1,
    status: 'request_sent', workers: [choice], selectedWorkerId: choice.workerId, detail: null,
  });
  const quotes = deriveMatchingView({
    mode: 'receive_quotes', requestId: 'quotes-one', projectId: 'project-two', stateVersion: 1,
    status: 'partial', quotes: [], selectedQuoteId: null, responseSummary: 'One of three invited Workers responded.',
  });
  const diagnostic = deriveMatchingView({
    mode: 'diagnostic_visit', requestId: 'diagnostic-one', projectId: 'project-three', stateVersion: 1,
    status: 'ready', workers: [choice], selectedWorkerId: null,
    diagnosticTerms: { kind: 'diagnostic', visitTotal: money(30000), deliverable: 'Written findings', laterWorkIncluded: false },
    scheduleLabel: '31 August, 10:00',
  });

  assert.match(compare.body, /not an instant booking/i);
  assert.match(quotes.body, /One of three/);
  assert.match(diagnostic.body, /Later work is not included/i);
  assert.notEqual(compare.title, quotes.title);
  assert.notEqual(quotes.title, diagnostic.title);
});

test('Project grouping honours authoritative segments and rejects duplicate IDs', () => {
  const base = {
    stateVersion: 1,
    serviceId: 'service-one',
    serviceVersion: 1,
    serviceLabel: 'Painting',
    workerId: null,
    workerName: null,
    workerPhotoUrl: null,
    scheduleLabel: 'Tomorrow',
    operationalPhase: 'scheduled',
    operationalLabel: 'Scheduled',
    areaLabel: 'Soweto',
    paymentStatus: 'not_due',
    canReschedule: true,
    canCancel: true,
    hasReceipt: false,
    canRate: false,
    canRebook: false,
  };
  const grouped = groupProjects([
    { ...base, projectId: 'project-active', segment: 'active' },
    { ...base, projectId: 'project-upcoming', segment: 'upcoming' },
    { ...base, projectId: 'project-past', segment: 'past' },
  ]);
  assert.equal(grouped.active.length, 1);
  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.past.length, 1);
  assert.throws(() => groupProjects([
    { ...base, projectId: 'same-project', segment: 'active' },
    { ...base, projectId: 'same-project', segment: 'past' },
  ]), /unique stable project IDs/);
});

test('travel evidence distinguishes live, stale, hidden and unavailable without losing actions', () => {
  const evidence = {
    visibility: 'available',
    capturedAt: '2026-08-29T10:00:00.000Z',
    latitude: -26.1,
    longitude: 28.0,
    accuracyMetres: 15,
    etaLabel: '18 min',
  };
  const live = deriveTravelView(evidence, '2026-08-29T10:00:20.000Z', 60);
  const stale = deriveTravelView(evidence, '2026-08-29T10:02:00.000Z', 60);
  const hidden = deriveTravelView({ visibility: 'hidden', reason: 'before_reveal_window' }, '2026-08-29T10:00:20.000Z', 60);
  const unavailable = deriveTravelView({ visibility: 'unavailable', lastKnownAt: '2026-08-29T09:55:00.000Z' }, '2026-08-29T10:00:20.000Z', 60);

  assert.equal(live.kind, 'live');
  assert.equal(live.etaLabel, '18 min');
  assert.equal(stale.kind, 'stale');
  assert.equal(stale.etaLabel, null);
  assert.equal(hidden.coordinates, null);
  assert.equal(unavailable.timestampLabel, '2026-08-29T09:55:00.000Z');
  for (const state of [live, stale, hidden, unavailable]) assert.equal(state.preserveNonMapActions, true);
});

test('privacy view reveals exact address and contact only from explicit authority', () => {
  const broad = derivePrivacyView({ phase: 'scheduled', exactRevealAuthorised: false, contactRevealAuthorised: false });
  const route = derivePrivacyView({ phase: 'en_route', exactRevealAuthorised: true, contactRevealAuthorised: false });
  const closed = derivePrivacyView({ phase: 'closed', exactRevealAuthorised: true, contactRevealAuthorised: true });

  assert.equal(broad.workerAddressAccess, 'broad_area_only');
  assert.equal(broad.contactAccess, 'masked');
  assert.equal(route.workerAddressAccess, 'exact_revealed');
  assert.equal(route.contactAccess, 'masked');
  assert.equal(closed.workerAddressAccess, 'closed');
  assert.equal(closed.contactAccess, 'closed');
});

test('scope and server PIN readiness require bilateral confirmation and connectivity', () => {
  const scope = {
    scopeId: 'scope-one', version: 2, status: 'confirmed', included: ['Repair tap'], excluded: [], checklist: [],
    materialsResponsibility: 'Customer approves parts', timeAndRateLabel: 'Fixed', totalOrCap: money(45000),
    workerConfirmedAt: '2026-08-29T10:00:00Z', customerConfirmedAt: '2026-08-29T10:01:00Z',
    startPin: { status: 'available', value: '1842', attemptsRemaining: 3 },
  };
  const online = deriveScopeReadiness(scope, 'online');
  const offline = deriveScopeReadiness(scope, 'offline');
  const unilateral = deriveScopeReadiness({ ...scope, customerConfirmedAt: null, startPin: { status: 'hidden', value: null, attemptsRemaining: null } }, 'online');
  const malformed = deriveScopeReadiness({ ...scope, startPin: { status: 'available', value: 'PIN-1842', attemptsRemaining: 3 } }, 'online');

  assert.equal(online.canRevealPin, true);
  assert.equal(online.canStart, true);
  assert.equal(offline.canStart, false);
  assert.equal(unilateral.canRevealPin, false);
  assert.equal(malformed.canStart, false);
});

test('change order consistency prevents an additional amount being applied twice', () => {
  const valid = {
    changeOrderId: 'change-one', version: 1, status: 'pending', existingAgreementSummary: 'Original scope',
    extraDescription: 'Replace valve', addedTimeLabel: '30 minutes', materialsLabel: 'Valve',
    baseTotal: money(45000), additionalAmount: money(10000), revisedTotal: money(55000), expiresAt: null,
  };
  assert.deepEqual(validateChangeOrder(valid), { valid: true, reasonCode: null });
  assert.deepEqual(validateChangeOrder({ ...valid, revisedTotal: money(65000) }), { valid: false, reasonCode: 'revised_total_mismatch' });
});

test('payment UI never turns a client state into paid and fails closed when checkout is unavailable', () => {
  const capabilityOff = derivePaymentView(payment());
  const uncertain = derivePaymentView(payment({ checkoutCapability: 'available', attemptStatus: 'uncertain', providerReturnState: 'awaiting_reconciliation' }));
  const paid = derivePaymentView(payment({
    obligationStatus: 'paid', amountDue: money(0), amountPaid: money(45000),
    checkoutCapability: 'available', checkoutUnavailableReason: null,
    attemptStatus: 'successful', providerReturnState: 'corrected_late_success',
  }));

  assert.equal(capabilityOff.canStartCheckout, false);
  assert.equal(capabilityOff.isServerVerifiedPaid, false);
  assert.match(capabilityOff.statusLabel, /unavailable/i);
  assert.equal(uncertain.canRetryCheckout, false);
  assert.match(uncertain.body, /Do not pay again/i);
  assert.equal(paid.isServerVerifiedPaid, true);
  assert.match(paid.statusLabel, /reconciliation/i);
});

test('server-confirmed cash can satisfy paid state without pretending an online attempt succeeded', () => {
  const cash = payment({
    obligationStatus: 'paid',
    amountDue: money(0),
    amountPaid: money(45000),
    attemptStatus: 'not_started',
    cashStatus: 'worker_confirmed',
    providerReturnState: 'not_started',
  });
  const view = derivePaymentView(cash);
  assert.equal(view.isServerVerifiedPaid, true);
  assert.equal(cash.attemptStatus, 'not_started');
});

test('favourite and rebook remain hidden until completion, verified payment and capability agree', () => {
  const completion = {
    projectId: 'project-one', stateVersion: 8, status: 'confirmed', requestedAt: '2026-08-29T10:00:00Z',
    scopeSummary: 'Repair complete', evidenceLabels: [], finalAmount: money(45000), openIssue: null,
  };
  const paid = payment({
    obligationStatus: 'paid', amountDue: money(0), amountPaid: money(45000), attemptStatus: 'successful',
    checkoutCapability: 'available', checkoutUnavailableReason: null, providerReturnState: 'complete',
  });
  const unavailable = canShowRetentionActions({ completion, payment: paid, capabilities: { relationshipsAvailable: false, favouriteAllowed: true, rebookAllowed: true } });
  const available = canShowRetentionActions({ completion, payment: paid, capabilities: { relationshipsAvailable: true, favouriteAllowed: true, rebookAllowed: true } });

  assert.deepEqual(unavailable, { favourite: false, rebook: false });
  assert.deepEqual(available, { favourite: true, rebook: true });
});

test('Worker choice validation never turns missing evidence into a badge, rating or reliability claim', () => {
  const valid = validateWorkerChoice(worker());
  const invalidRating = validateWorkerChoice(worker({ rating: { average: 0, count: 0 } }));
  assert.equal(valid.valid, true);
  assert.deepEqual(worker().verification, []);
  assert.equal(worker().rating, null);
  assert.equal(worker().reliabilityLabel, null);
  assert.deepEqual(invalidRating.issues, ['rating']);
});
