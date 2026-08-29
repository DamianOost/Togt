'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deriveAvailabilityPresentation,
  deriveLedgerRowPresentation,
  deriveOfferActionPresentation,
  derivePayoutVisibility,
  hasValidEarningsTotals,
  hasValidOfferCommercialBreakdown,
  isValidZarAmount,
} = require('../../src/features/worker/shell/model.ts');
const {
  createWorkerShellTranslator,
  dayPeriodForHour,
  formatDurationEstimate,
  formatTravelEstimate,
  formatZarEnZa,
} = require('../../src/features/worker/shell/copy.ts');

const OBSERVED_AT = '2026-08-29T08:00:00.000Z';

function supported(value, source = 'server') {
  return Object.freeze({ status: 'supported', source, observedAt: OBSERVED_AT, value });
}

function unknown(explanation = 'The server has not confirmed this value.') {
  return Object.freeze({
    status: 'unknown',
    reasonCode: 'not_confirmed',
    explanation,
  });
}

function instantOffer(overrides = {}) {
  return Object.freeze({
    kind: 'instant',
    matchingMode: 'fast_match',
    offerId: 'offer-fast-1',
    serviceLabel: supported('Tap repair'),
    serverStatus: supported('open'),
    cacheFreshness: supported('fresh'),
    acceptancePermission: supported({ allowed: true, reasonCode: 'eligible', explanation: 'Eligible.' }),
    customerDisplayName: supported('Customer J.'),
    customerTrust: supported([{ kind: 'verified_contact', label: 'Contact verified' }]),
    broadArea: supported('Roodepoort'),
    travel: supported({ distanceMetres: 4300, durationMinutes: 18, calculatedAt: OBSERVED_AT }),
    schedule: supported({ kind: 'now', startsAt: null, timezone: 'Africa/Johannesburg' }),
    expectedDuration: supported({ minimumMinutes: 60, maximumMinutes: 120 }),
    scopeSummary: supported('Repair a leaking kitchen tap.'),
    attachmentCount: supported(1),
    commercial: supported({
      currency: 'ZAR',
      grossMinor: 45000,
      platformFeeMinor: 4500,
      expectedNetMinor: 40500,
      pricingMode: 'fixed',
      ledgerDefinition: 'worker-payable-v1',
    }, 'server_ledger'),
    serverExpiresAt: supported('2026-08-29T08:02:00.000Z'),
    ...overrides,
  });
}

function scheduledRequest(overrides = {}) {
  const {
    kind: _kind,
    matchingMode: _matchingMode,
    serverExpiresAt: _serverExpiresAt,
    ...base
  } = instantOffer();
  return Object.freeze({
    ...base,
    kind: 'scheduled',
    matchingMode: 'scheduled_request',
    offerId: 'offer-scheduled-1',
    schedule: supported({
      kind: 'scheduled',
      startsAt: '2026-08-31T08:00:00.000Z',
      timezone: 'Africa/Johannesburg',
    }),
    serverRespondBy: supported('2026-08-30T08:00:00.000Z'),
    ...overrides,
  });
}

test('availability is never inferred when server evidence is absent', () => {
  const presentation = deriveAvailabilityPresentation({
    availability: unknown(),
    fastMatchEligibility: supported('eligible'),
  }, { connection: 'online', requestPending: false });

  assert.deepEqual(presentation, {
    state: 'unknown',
    eligibility: 'unknown',
    showSwitch: false,
    switchValue: null,
    canRequestChange: false,
    statusCode: 'availability_unknown',
  });
});

test('network loss preserves a confirmed online display but blocks optimistic changes', () => {
  const presentation = deriveAvailabilityPresentation({
    availability: supported('online'),
    fastMatchEligibility: supported('eligible'),
  }, { connection: 'offline', requestPending: false });

  assert.equal(presentation.state, 'online');
  assert.equal(presentation.switchValue, true);
  assert.equal(presentation.canRequestChange, false);
  assert.equal(presentation.statusCode, 'online');
});

test('reconnect warning appears only from explicit heartbeat-stale evidence', () => {
  const stale = deriveAvailabilityPresentation({
    availability: supported('online'),
    fastMatchEligibility: supported('heartbeat_stale'),
  }, { connection: 'online', requestPending: false });
  const unknownEligibility = deriveAvailabilityPresentation({
    availability: supported('online'),
    fastMatchEligibility: unknown(),
  }, { connection: 'online', requestPending: false });

  assert.equal(stale.statusCode, 'online_reconnect');
  assert.equal(unknownEligibility.statusCode, 'online');
  assert.equal(unknownEligibility.eligibility, 'unknown');
});

test('instant offer uses a server window and never client-declines when it elapses', () => {
  const open = deriveOfferActionPresentation(instantOffer(), {
    serverNow: '2026-08-29T08:00:30.000Z',
    connection: 'online',
  });
  const elapsed = deriveOfferActionPresentation(instantOffer(), {
    serverNow: '2026-08-29T08:02:00.000Z',
    connection: 'online',
  });

  assert.equal(open.expiryKind, 'instant_window');
  assert.equal(open.remainingMinutes, 2);
  assert.equal(open.canAttemptAccept, true);
  assert.equal(elapsed.statusCode, 'window_elapsed_refresh');
  assert.equal(elapsed.canAttemptAccept, false);
  assert.equal(elapsed.canDeclineManually, false);
  assert.equal(elapsed.requiresRefresh, true);
  assert.equal(elapsed.clientSideDecline, false);
});

test('scheduled request renders a decision deadline rather than instant countdown semantics', () => {
  const presentation = deriveOfferActionPresentation(scheduledRequest(), {
    serverNow: '2026-08-29T08:00:00.000Z',
    connection: 'online',
  });

  assert.equal(presentation.expiryKind, 'scheduled_deadline');
  assert.equal(presentation.deadlineAt, '2026-08-30T08:00:00.000Z');
  assert.equal(presentation.canAttemptAccept, true);
  assert.equal(presentation.clientSideDecline, false);
});

test('stale, offline and permission-unknown offers all fail closed', () => {
  const missingExpiry = deriveOfferActionPresentation(
    instantOffer({ serverExpiresAt: unknown() }),
    { serverNow: OBSERVED_AT, connection: 'online' },
  );
  const offline = deriveOfferActionPresentation(
    instantOffer(),
    { serverNow: OBSERVED_AT, connection: 'offline' },
  );
  const permissionUnknown = deriveOfferActionPresentation(
    instantOffer({ acceptancePermission: unknown() }),
    { serverNow: OBSERVED_AT, connection: 'online' },
  );
  const staleCache = deriveOfferActionPresentation(
    instantOffer({ cacheFreshness: supported('stale') }),
    { serverNow: OBSERVED_AT, connection: 'online' },
  );

  assert.equal(missingExpiry.statusCode, 'expiry_unknown');
  assert.equal(missingExpiry.canAttemptAccept, false);
  assert.equal(offline.statusCode, 'offline');
  assert.equal(offline.canAttemptAccept, false);
  assert.equal(permissionUnknown.statusCode, 'acceptance_blocked');
  assert.equal(permissionUnknown.canAttemptAccept, false);
  assert.equal(permissionUnknown.requiresRefresh, true);
  assert.equal(staleCache.statusCode, 'stale_cache');
  assert.equal(staleCache.canAttemptAccept, false);
  assert.equal(staleCache.canDeclineManually, false);
  assert.equal(staleCache.clientSideDecline, false);
});

test('terminal offer wording follows explicit server status', () => {
  for (const status of ['accepted', 'declined', 'expired', 'taken', 'withdrawn']) {
    const result = deriveOfferActionPresentation(
      instantOffer({ serverStatus: supported(status) }),
      { serverNow: OBSERVED_AT, connection: 'online' },
    );
    assert.equal(result.statusCode, status);
    assert.equal(result.canAttemptAccept, false);
    assert.equal(result.clientSideDecline, false);
  }
});

test('available balance and next payout remain hidden until operational evidence is complete', () => {
  const money = supported({ currency: 'ZAR', amountMinor: 40500 }, 'server_payout');
  const next = supported({
    state: 'scheduled',
    amount: { currency: 'ZAR', amountMinor: 40500 },
    expectedAt: '2026-09-01T08:00:00.000Z',
  }, 'server_payout');
  const hidden = derivePayoutVisibility({
    payoutCapability: supported({
      state: 'not_operational',
      beneficiaryVerification: 'verified',
      reconciliation: 'not_operational',
    }, 'server_payout'),
    availableBalance: money,
    nextPayout: next,
  });
  const visible = derivePayoutVisibility({
    payoutCapability: supported({
      state: 'operational',
      beneficiaryVerification: 'verified',
      reconciliation: 'operational',
    }, 'server_payout'),
    availableBalance: money,
    nextPayout: next,
  });

  assert.equal(hidden.operational, false);
  assert.equal(hidden.showAvailableBalance, false);
  assert.equal(hidden.showNextPayout, false);
  assert.equal(hidden.availableBalance, null);
  assert.equal(hidden.nextPayout, null);
  assert.equal(visible.showAvailableBalance, true);
  assert.equal(visible.showNextPayout, true);
});

test('beneficiary verification is part of operational payout evidence', () => {
  const result = derivePayoutVisibility({
    payoutCapability: supported({
      state: 'operational',
      beneficiaryVerification: 'pending',
      reconciliation: 'operational',
    }, 'server_payout'),
    availableBalance: supported({ currency: 'ZAR', amountMinor: 40500 }, 'server_payout'),
    nextPayout: supported({
      state: 'scheduled',
      amount: { currency: 'ZAR', amountMinor: 40500 },
      expectedAt: '2026-09-01T08:00:00.000Z',
    }, 'server_payout'),
  });

  assert.equal(result.operational, false);
  assert.equal(result.showAvailableBalance, false);
  assert.equal(result.showNextPayout, false);
});

test('eligible payout without a server date never becomes a promised next payout', () => {
  const result = derivePayoutVisibility({
    payoutCapability: supported({
      state: 'operational',
      beneficiaryVerification: 'verified',
      reconciliation: 'operational',
    }, 'server_payout'),
    availableBalance: unknown(),
    nextPayout: supported({
      state: 'eligible',
      amount: { currency: 'ZAR', amountMinor: 40500 },
      expectedAt: null,
    }, 'server_payout'),
  });

  assert.equal(result.showNextPayout, false);
  assert.equal(result.nextPayout, null);
});

test('completed unpaid is pending, cash is separate, and payout failures need attention', () => {
  const base = {
    ledgerEntryId: 'ledger-1',
    jobId: 'job-1',
    serviceLabel: 'Tap repair',
    completedAt: OBSERVED_AT,
    gross: { currency: 'ZAR', amountMinor: 45000 },
    platformFee: { currency: 'ZAR', amountMinor: 4500 },
    net: { currency: 'ZAR', amountMinor: 40500 },
  };
  assert.equal(deriveLedgerRowPresentation({
    ...base,
    paymentState: 'awaiting_reconciliation',
    payoutState: 'not_eligible',
    paymentMethod: 'online',
  }).category, 'pending');
  assert.equal(deriveLedgerRowPresentation({
    ...base,
    paymentState: 'cash_confirmed',
    payoutState: null,
    paymentMethod: 'cash',
  }).category, 'cash');
  assert.equal(deriveLedgerRowPresentation({
    ...base,
    paymentState: 'paid_online',
    payoutState: 'failed',
    paymentMethod: 'online',
  }).category, 'issue');
});

test('financial view models reject malformed or self-inconsistent amounts', () => {
  assert.equal(isValidZarAmount({ currency: 'ZAR', amountMinor: 40500 }), true);
  assert.equal(isValidZarAmount({ currency: 'ZAR', amountMinor: -1 }), false);
  assert.equal(hasValidOfferCommercialBreakdown({
    currency: 'ZAR',
    grossMinor: 45000,
    platformFeeMinor: 4500,
    expectedNetMinor: 40500,
    pricingMode: 'fixed',
    ledgerDefinition: 'worker-payable-v1',
  }), true);
  assert.equal(hasValidOfferCommercialBreakdown({
    currency: 'ZAR',
    grossMinor: 45000,
    platformFeeMinor: 4500,
    expectedNetMinor: 45000,
    pricingMode: 'fixed',
    ledgerDefinition: 'worker-payable-v1',
  }), false);
  assert.equal(hasValidEarningsTotals({
    currency: 'ZAR',
    ledgerDefinition: 'worker-payable-v1',
    pendingMinor: 10000,
    thisWeekNetMinor: 40500,
    grossMinor: 45000,
    platformFeeMinor: 4500,
    netMinor: 40500,
    cashConfirmedMinor: 0,
    platformPaidMinor: 40500,
  }), true);
});

test('en-ZA copy adapter and formatters remain deterministic and overrideable', () => {
  const translate = createWorkerShellTranslator({ 'jobs.title': 'Work' });
  assert.equal(translate('jobs.title'), 'Work');
  assert.equal(translate('today.offerCount', { count: 3 }), '3 open');
  assert.match(formatZarEnZa({ currency: 'ZAR', amountMinor: 40500 }), /R\s*405/);
  assert.equal(formatDurationEstimate({ minimumMinutes: 60, maximumMinutes: 120 }), '1 hr–2 hr');
  assert.equal(formatTravelEstimate({ distanceMetres: 4300, durationMinutes: 18, calculatedAt: OBSERVED_AT }), '4.3 km · 18 min');
  assert.equal(dayPeriodForHour(9), 'morning');
  assert.equal(dayPeriodForHour(15), 'afternoon');
  assert.equal(dayPeriodForHour(20), 'evening');
});
