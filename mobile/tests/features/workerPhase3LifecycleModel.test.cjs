'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deriveAccountReadiness,
  deriveActivationPresentation,
  deriveCompletionPresentation,
  derivePinEntryPresentation,
  deriveWorkerDominantAction,
  deriveWorkerPrivacyPresentation,
  isSafeLifecycleImageUri,
  hasImplementedActivationContentContract,
  normaliseChangeOrderForm,
  normaliseServiceEditorForm,
  validateProfileDraft,
  validateWorkerChangeOrder,
} = require('../../src/features/worker/lifecycle/model.ts');
const {
  createWorkerLifecycleIntent,
} = require('../../src/features/worker/lifecycle/controller.ts');
const {
  formatLifecycleMoney,
  workerLifecycleMessage,
} = require('../../src/features/worker/lifecycle/copy.ts');

const observedAt = '2026-08-29T10:00:00.000Z';
const money = (amountMinor) => Object.freeze({ currency: 'ZAR', amountMinor });
const supported = (value) => Object.freeze({ status: 'supported', source: 'server', observedAt, value });
const ledger = (value) => Object.freeze({ status: 'supported', source: 'server_ledger', observedAt, value });
const unavailable = (explanation = 'Evidence unavailable') => Object.freeze({ status: 'unavailable', reasonCode: 'not_available', explanation });

function activationItem(overrides = {}) {
  return Object.freeze({
    itemId: 'activation-one',
    kind: 'account_contact',
    title: 'Account and contact',
    status: 'complete',
    required: true,
    visibility: 'private',
    evidenceLabel: 'Server confirmed',
    remedy: null,
    destinationKey: 'account-contact',
    ...overrides,
  });
}

function service(overrides = {}) {
  return Object.freeze({
    offeringId: 'offering-one',
    stateVersion: 3,
    facts: Object.freeze({
      serviceId: 'service-one',
      serviceVersion: 2,
      canonicalCategory: 'Plumbing',
      catalogueLabel: 'Tap repair',
      pricingMode: 'hourly',
      riskTier: 'standard',
      requiredCredentials: [],
      fixedCustomerAmount: unavailable(),
      fixedWorkerNet: unavailable(),
      hourlyRateBounds: supported({ minimum: money(20000), maximum: money(50000) }),
      fixedPayoutRule: null,
    }),
    customerFacingTitle: 'Tap repair',
    description: 'Repair leaking taps.',
    hourlyRate: money(30000),
    minimumDurationMinutes: 60,
    callOutAmount: null,
    serviceAreaLabel: 'Roodepoort',
    portfolio: [],
    active: true,
    credentialEvidence: [],
    mutation: { state: 'idle', message: null, confirmedAt: null },
    ...overrides,
  });
}

function serviceForm(overrides = {}) {
  return Object.freeze({
    offeringId: 'offering-one',
    title: 'Tap repair',
    description: 'Repair leaking taps.',
    hourlyRateRand: '300.00',
    minimumDurationMinutes: '60',
    callOutAmountRand: '',
    serviceAreaLabel: 'Roodepoort',
    ...overrides,
  });
}

function job(overrides = {}) {
  return Object.freeze({
    schemaVersion: 1,
    projectId: 'project-one',
    stateVersion: 4,
    serviceLabel: supported('Tap repair'),
    phase: supported('scheduled'),
    phaseLabel: 'Scheduled',
    phaseUpdatedAt: observedAt,
    scheduleLabel: supported('Tomorrow at 10:00'),
    customerDisplayName: supported('Test customer'),
    customerEvidence: [],
    privacy: {
      broadArea: supported('Roodepoort'),
      exactAddress: supported('Private exact address'),
      exactRevealAuthorised: false,
      contact: supported('Private contact'),
      contactRevealAuthorised: false,
    },
    tracking: { status: 'not_started', explanation: 'Not started', capturedAt: null, failureReason: null },
    timeline: [],
    scopeSummary: supported('Repair the tap'),
    commercial: ledger({ gross: money(45000), platformFee: money(4500), expectedNet: money(40500), ledgerDefinition: 'worker-payable-v1', paymentState: 'not_due' }),
    commandPermissions: [{ command: 'start_route', allowed: true, reason: 'Within route window.' }],
    canChat: true,
    canOpenSafetyHelp: true,
    openIssue: null,
    lastUpdatedAt: observedAt,
    ...overrides,
  });
}

function scope(overrides = {}) {
  return Object.freeze({
    projectId: 'project-one', stateVersion: 7, scopeId: 'scope-one', scopeVersion: 2, acceptedBriefVersion: 1,
    status: 'confirmed', included: ['Repair tap'], excluded: [], checklist: [],
    materialsResponsibility: 'Customer approves parts', timeAndRateLabel: 'Fixed', totalOrCap: supported(money(45000)),
    workerConfirmedAt: observedAt, customerConfirmedAt: '2026-08-29T10:01:00.000Z', clarification: null,
    pinPolicy: supported({ actor: 'worker', status: 'entry_allowed', attemptsRemaining: 3, retryAfter: null }),
    startOutcome: { status: 'not_attempted', actorAt: null, deviceAt: null, serverAt: null, message: null },
    ...overrides,
  });
}

function active(overrides = {}) {
  return Object.freeze({
    projectId: 'project-one', stateVersion: 8, scopeId: 'scope-one', scopeVersion: 2,
    scopeSummary: 'Repair tap', elapsedLabel: supported('45 minutes'), currentApprovedTotal: supported(money(45000)),
    customerApprovalCap: supported(money(70000)), currentExpectedNet: ledger(money(40500)), changeOrders: [],
    canRequestChange: true, canRequestCompletion: true,
    ...overrides,
  });
}

function completion(overrides = {}) {
  return Object.freeze({
    projectId: 'project-one', stateVersion: 9, status: 'not_requested', requestedAt: null, customerOutcomeAt: null,
    timeoutPolicyLabel: 'Customer review window applies.', scopeSummary: 'Repair complete', evidenceLabels: [],
    finalCommercialSnapshotId: 'commercial-one', finalExpectedNet: ledger(money(40500)), paymentState: supported('not_due'),
    issue: null, ratingEligibility: supported({ eligible: false, reason: 'Completion not confirmed.' }),
    payoutEligibility: supported({ eligible: false, reason: 'Payment not reconciled.' }),
    ...overrides,
  });
}

test('Worker lifecycle intents are deterministic, frozen and fail closed offline', () => {
  const input = {
    command: 'confirm_scope', actorId: 'worker-one', projectId: 'project-one', resourceId: 'scope-one',
    stateVersion: 7, requestKey: 'confirm-scope-one', connectionState: 'online', payload: { scopeVersion: 2 },
  };
  const first = createWorkerLifecycleIntent(input);
  const duplicate = createWorkerLifecycleIntent(input);
  const offline = createWorkerLifecycleIntent({ ...input, connectionState: 'offline' });

  assert.equal(first.ok, true);
  assert.equal(first.intent.idempotencyKey, duplicate.intent.idempotencyKey);
  assert.equal(Object.isFrozen(first.intent), true);
  assert.equal(Object.isFrozen(first.intent.payload), true);
  assert.deepEqual(offline, { ok: false, reasonCode: 'offline' });
});

test('project commands require a stable project and state version', () => {
  assert.deepEqual(createWorkerLifecycleIntent({
    command: 'start_route', actorId: 'worker-one', stateVersion: 1, requestKey: 'route-one', connectionState: 'online',
  }), { ok: false, reasonCode: 'project_required' });
  assert.deepEqual(createWorkerLifecycleIntent({
    command: 'save_service', actorId: 'worker one', resourceId: 'service-one', stateVersion: 1, requestKey: 'save-one', connectionState: 'online',
  }), { ok: false, reasonCode: 'invalid_identity' });
});

test('PIN is carried only inside the command payload and never appears in the idempotency key', () => {
  const result = createWorkerLifecycleIntent({
    command: 'verify_start_pin', actorId: 'worker-one', projectId: 'project-one', resourceId: 'scope-one',
    stateVersion: 7, requestKey: 'pin-attempt-one', connectionState: 'online', payload: { pin: '1842', scopeVersion: 2 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.intent.payload.pin, '1842');
  assert.doesNotMatch(result.intent.idempotencyKey, /1842/);
});

test('activation requires every required item and explicit server Online permission', () => {
  const ready = deriveActivationPresentation({
    schemaVersion: 1, workerId: 'worker-one', stateVersion: 1,
    items: [activationItem()], onlinePermission: supported({ allowed: true, reasonCode: 'ready', explanation: 'All prerequisites pass.' }), lastUpdatedAt: observedAt,
  }, 'online');
  const blocked = deriveActivationPresentation({
    schemaVersion: 1, workerId: 'worker-one', stateVersion: 1,
    items: [activationItem({ status: 'incomplete', remedy: 'Add a profile photo.' })], onlinePermission: supported({ allowed: true, reasonCode: 'ready', explanation: 'Server has not refreshed.' }), lastUpdatedAt: observedAt,
  }, 'online');
  const offline = deriveActivationPresentation({
    schemaVersion: 1, workerId: 'worker-one', stateVersion: 1,
    items: [activationItem()], onlinePermission: supported({ allowed: true, reasonCode: 'ready', explanation: 'All prerequisites pass.' }), lastUpdatedAt: observedAt,
  }, 'offline');

  assert.equal(ready.canRequestOnline, true);
  assert.equal(blocked.canRequestOnline, false);
  assert.equal(blocked.remainingCount, 1);
  assert.equal(offline.canRequestOnline, false);
});

test('failed activation items require an exact remedy and stable destination', () => {
  const result = deriveActivationPresentation({
    schemaVersion: 1, workerId: 'worker-one', stateVersion: 1,
    items: [activationItem({ status: 'failed', remedy: null, destinationKey: '' })],
    onlinePermission: supported({ allowed: false, reasonCode: 'blocked', explanation: 'Blocked.' }), lastUpdatedAt: observedAt,
  }, 'online');
  assert.deepEqual(result.invalidItemIds, ['activation-one']);
  assert.equal(result.canRequestOnline, false);
});

test('activation remediation fails closed unless kind and destination share an implemented content contract', () => {
  for (const [kind, destinationKey] of [
    ['identity_assurance', 'KYC'],
    ['about_experience', 'WorkerServicesProfile'],
    ['eligible_service', 'WorkerServicesProfile'],
    ['pricing_acceptance', 'WorkerServicesProfile'],
    ['service_area', 'WorkerServicesProfile'],
  ]) {
    assert.equal(hasImplementedActivationContentContract({ kind, destinationKey }), true);
  }
  for (const [kind, destinationKey] of [
    ['account_contact', 'Account'],
    ['profile_photo', 'WorkerServicesProfile'],
    ['foreground_location', 'WorkerActivation'],
    ['safety_emergency', 'WorkerSafety'],
    ['first_job_readiness', 'WorkerActivation'],
    ['about_experience', 'Account'],
  ]) {
    assert.equal(hasImplementedActivationContentContract({ kind, destinationKey }), false);
  }
});

test('hourly service form normalises rand input and enforces catalogue bounds', () => {
  const valid = normaliseServiceEditorForm(service(), serviceForm());
  const tooHigh = normaliseServiceEditorForm(service(), serviceForm({ hourlyRateRand: '750.00' }));
  const malformed = normaliseServiceEditorForm(service(), serviceForm({ hourlyRateRand: '-1' }));

  assert.equal(valid.validation.valid, true);
  assert.equal(valid.draft.hourlyRateMinor, 30000);
  assert.ok(tooHigh.validation.issues.some((issue) => issue.code === 'outside_catalogue_bounds'));
  assert.ok(malformed.validation.issues.some((issue) => issue.field === 'hourlyRateMinor'));
});

test('non-hourly service cannot inject an editable hourly rate', () => {
  const fixed = service({ facts: { ...service().facts, pricingMode: 'fixed' } });
  const result = normaliseServiceEditorForm(fixed, serviceForm({ hourlyRateRand: '300.00' }));
  assert.equal(result.validation.valid, false);
  assert.ok(result.validation.issues.some((issue) => issue.message.includes('not editable')));
});

test('profile validation preserves public identity requirements', () => {
  const profile = {
    profileId: 'profile-one', stateVersion: 1, displayName: 'Test Worker', about: 'Experienced Worker profile',
    profilePhoto: unavailable(), photoReplacement: { state: 'idle', previewUri: null, progressPercent: null, message: null },
    publicBadges: [], serviceAreaLabel: 'Roodepoort', privateDetailLabels: [], mutation: { state: 'idle', message: null, confirmedAt: null },
  };
  assert.equal(validateProfileDraft(profile, { profileId: 'profile-one', displayName: 'Test Worker', about: 'Experienced Worker profile' }).valid, true);
  assert.equal(validateProfileDraft(profile, { profileId: 'profile-one', displayName: '', about: '' }).valid, false);
});

test('unknown phase fails closed for exact address and contact even when stale flags say reveal', () => {
  const presentation = deriveWorkerPrivacyPresentation({
    broadArea: supported('Roodepoort'), exactAddress: supported('Exact private address'), exactRevealAuthorised: true,
    contact: supported('Private phone'), contactRevealAuthorised: true,
  }, 'unknown');
  assert.equal(presentation.addressStatus, 'broad_only');
  assert.equal(presentation.exactAddressLabel, null);
  assert.equal(presentation.contactStatus, 'masked');
  assert.equal(presentation.contactLabel, null);
});

test('exact address/contact require explicit reveal authority and close at terminal phase', () => {
  const privacy = job().privacy;
  const broad = deriveWorkerPrivacyPresentation(privacy, 'scheduled');
  const revealed = deriveWorkerPrivacyPresentation({ ...privacy, exactRevealAuthorised: true, contactRevealAuthorised: true }, 'en_route');
  const closed = deriveWorkerPrivacyPresentation({ ...privacy, exactRevealAuthorised: true, contactRevealAuthorised: true }, 'closed');
  assert.equal(broad.addressStatus, 'broad_only');
  assert.equal(revealed.exactAddressLabel, 'Private exact address');
  assert.equal(revealed.contactLabel, 'Private contact');
  assert.equal(closed.addressStatus, 'closed');
  assert.equal(closed.exactAddressLabel, null);
});

test('scheduled and en-route dominant actions require explicit permission and connectivity', () => {
  const scheduled = deriveWorkerDominantAction(job(), 'online');
  const offline = deriveWorkerDominantAction(job(), 'offline');
  const unpermitted = deriveWorkerDominantAction(job({ commandPermissions: [] }), 'online');
  const enRoute = deriveWorkerDominantAction(job({
    phase: supported('en_route'), commandPermissions: [{ command: 'mark_arrived', allowed: true, reason: 'Route active.' }],
  }), 'online');

  assert.deepEqual([scheduled.kind, scheduled.command, scheduled.enabled], ['command', 'start_route', true]);
  assert.equal(offline.enabled, false);
  assert.equal(unpermitted.enabled, false);
  assert.deepEqual([enRoute.kind, enRoute.command, enRoute.enabled], ['command', 'mark_arrived', true]);
});

test('unknown phase is read-only while known fulfilment phases route to details', () => {
  const unknown = deriveWorkerDominantAction(job({ phase: unavailable('Phase unavailable') }), 'online');
  const scopeRoute = deriveWorkerDominantAction(job({ phase: supported('scope_confirmation') }), 'online');
  const closed = deriveWorkerDominantAction(job({ phase: supported('closed') }), 'offline');
  assert.equal(unknown.kind, 'none');
  assert.equal(unknown.enabled, false);
  assert.deepEqual([scopeRoute.kind, scopeRoute.target], ['route', 'scope']);
  assert.deepEqual([closed.kind, closed.target], ['route', 'receipt']);
});

test('PIN entry requires bilateral scope, Worker actor policy, online state and numeric input', () => {
  const allowed = derivePinEntryPresentation(scope(), '1842', 'online');
  const malformed = derivePinEntryPresentation(scope(), 'PIN1842', 'online');
  const unilateral = derivePinEntryPresentation(scope({ customerConfirmedAt: null }), '1842', 'online');
  const wrongActorEvidence = derivePinEntryPresentation(scope({ pinPolicy: supported({ actor: 'customer', status: 'entry_allowed', attemptsRemaining: 3, retryAfter: null }) }), '1842', 'online');
  const offline = derivePinEntryPresentation(scope(), '1842', 'offline');

  assert.equal(allowed.canSubmit, true);
  assert.equal(malformed.canSubmit, false);
  assert.equal(unilateral.canEnter, false);
  assert.equal(wrongActorEvidence.canEnter, false);
  assert.equal(offline.canSubmit, false);
});

test('Job start appears successful only with actor, device and server timestamps', () => {
  const incomplete = derivePinEntryPresentation(scope({
    startOutcome: { status: 'started', actorAt: observedAt, deviceAt: observedAt, serverAt: null, message: null },
  }), '', 'online');
  const complete = derivePinEntryPresentation(scope({
    startOutcome: { status: 'started', actorAt: observedAt, deviceAt: observedAt, serverAt: observedAt, message: null },
  }), '', 'online');
  assert.equal(incomplete.serverConfirmedStarted, false);
  assert.equal(complete.serverConfirmedStarted, true);
});

test('change order preview must match draft, approved base, fee/net and revised total', () => {
  const preview = ledger({
    previewVersion: 1, baseTotal: money(45000), additionalAmount: money(10000), platformFee: money(1000),
    additionalExpectedNet: money(9000), revisedTotal: money(55000),
  });
  const valid = normaliseChangeOrderForm(active(), {
    description: 'Replace valve', addedTimeMinutes: '30', materialsDescription: 'Valve', additionalAmountRand: '100.00', preview,
  });
  const doubleApplied = normaliseChangeOrderForm(active(), {
    description: 'Replace valve', addedTimeMinutes: '30', materialsDescription: 'Valve', additionalAmountRand: '100.00',
    preview: ledger({ ...preview.value, revisedTotal: money(65000) }),
  });
  assert.equal(valid.validation.valid, true);
  assert.equal(valid.draft.additionalAmountMinor, 10000);
  assert.ok(doubleApplied.validation.issues.some((issue) => issue.field === 'preview'));
});

test('recorded change orders reject double-added revised totals', () => {
  const base = {
    changeOrderId: 'change-one', version: 1, status: 'pending', description: 'Replace valve', addedTimeMinutes: 30,
    materialsDescription: 'Valve', baseTotal: money(45000), additionalAmount: money(10000), revisedTotal: money(55000),
    additionalExpectedNet: ledger(money(9000)), expiresAt: null,
  };
  assert.equal(validateWorkerChangeOrder(base), true);
  assert.equal(validateWorkerChangeOrder({ ...base, revisedTotal: money(65000) }), false);
});

test('completion request is online-only and never implies unilateral completion', () => {
  const online = deriveCompletionPresentation(completion(), 'online');
  const offline = deriveCompletionPresentation(completion(), 'offline');
  const requested = deriveCompletionPresentation(completion({ status: 'requested', requestedAt: observedAt }), 'online');
  assert.equal(online.canRequestCompletion, true);
  assert.equal(online.fulfilmentConfirmed, false);
  assert.equal(offline.canRequestCompletion, false);
  assert.equal(requested.fulfilmentConfirmed, false);
  assert.match(requested.title, /Waiting for customer/);
});

test('disputed completion preserves an issue and cannot become confirmed', () => {
  const result = deriveCompletionPresentation(completion({
    status: 'disputed', issue: { issueId: 'issue-one', status: 'under_review', label: 'Work issue under review' },
  }), 'online');
  assert.equal(result.readOnly, true);
  assert.equal(result.issueOpen, true);
  assert.equal(result.fulfilmentConfirmed, false);
});

test('only customer-confirmed/resolved status becomes fulfilment-confirmed, with money still separate', () => {
  const confirmed = deriveCompletionPresentation(completion({ status: 'customer_confirmed', customerOutcomeAt: observedAt }), 'online');
  const timedOut = deriveCompletionPresentation(completion({ status: 'timed_out', customerOutcomeAt: observedAt }), 'online');
  assert.equal(confirmed.fulfilmentConfirmed, true);
  assert.equal(timedOut.fulfilmentConfirmed, false);
  assert.match(confirmed.explanation, /Payment and payout remain separate/);
});

test('account readiness rejects duplicate IDs and unavailable sections without reasons', () => {
  const entry = {
    entryId: 'entry-one', kind: 'public_profile', label: 'Public profile', detail: 'Ready', status: 'ready',
    visibility: 'public', destinationKey: 'profile', capabilityReason: null,
  };
  const result = deriveAccountReadiness({
    workerId: 'worker-one', stateVersion: 1, publicProfilePreviewUri: null, lastUpdatedAt: observedAt,
    entries: [entry, { ...entry }, { ...entry, entryId: 'entry-two', status: 'unavailable', capabilityReason: null }],
  });
  assert.deepEqual(result.invalidEntryIds, ['entry-one', 'entry-two']);
  assert.equal(result.readyCount, 2);
});

test('copy, money and image helpers stay deterministic and evidence-safe', () => {
  assert.equal(workerLifecycleMessage('activation.progress', { complete: 2, total: 3 }), '2 of 3 required items complete');
  assert.match(formatLifecycleMoney(money(40500)), /R\s*405/);
  assert.equal(formatLifecycleMoney(money(-1)), 'Not available');
  assert.equal(isSafeLifecycleImageUri('https://cdn.example.test/photo.jpg'), true);
  assert.equal(isSafeLifecycleImageUri('data:text/plain,unsafe'), false);
});
