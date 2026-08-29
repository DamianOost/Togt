'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  adaptWorkerAvailabilityV1,
  adaptWorkerEarningsV1,
  adaptWorkerJobsV1,
  adaptWorkerOffersV1,
  composeWorkerTodayV1,
  workerJobsSnapshotV1,
} = require('../../src/data/grounded/workerShell.ts');

const WORKER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const OFFER_ID = '33333333-3333-4333-8333-333333333333';
const LEDGER_ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const OBSERVED = '2026-08-29T08:00:00.000Z';

function projectResponse() {
  return {
    schema: 'togt.project.v1',
    projects: [{
      schema: 'togt.project.v1',
      id: PROJECT_ID,
      revision: 3,
      segment: 'upcoming',
      transactionalStatus: 'accepted',
      operational: { phase: 'scheduled', label: 'Job confirmed', dominantAction: 'review_job' },
      service: { label: 'Tap repair' },
      schedule: { startsAt: '2026-08-30T10:00:00.000Z' },
      area: { precision: 'approximate', label: 'Approximate job area' },
      participants: { customer: { displayName: 'Naledi' }, worker: { displayName: 'Thabo' } },
      commercial: { currency: 'ZAR', agreedTotal: '500.00', source: 'server_booking_record' },
      payment: { status: 'pending', currency: 'ZAR' },
      completion: { status: 'not_requested' },
      updatedAt: OBSERVED,
    }],
    meta: { segment: 'all', count: 1 },
  };
}

function offersResponse() {
  return {
    schema: 'togt.worker-offers.v1',
    serverNow: OBSERVED,
    offers: [{
      id: OFFER_ID,
      kind: 'instant',
      matchingMode: 'fast_match',
      status: 'open',
      serverExpiresAt: '2026-08-29T08:00:30.000Z',
      serviceLabel: 'Tap repair',
      customer: { displayName: 'Naledi', trust: [] },
      broadAreaLabel: 'Approx. area -33.92, 18.42',
      schedule: {
        kind: 'scheduled',
        startsAt: '2026-08-30T10:00:00.000Z',
        timezone: 'Africa/Johannesburg',
      },
      expectedDuration: { minimumMinutes: 90, maximumMinutes: 90 },
      travel: null,
      scopeSummary: null,
      attachmentCount: null,
      commercial: null,
      acceptancePermission: {
        allowed: false,
        reasonCode: 'worker_activation_incomplete',
        explanation: 'Activation prerequisites are incomplete.',
      },
      observedAt: OBSERVED,
    }],
    meta: { count: 1 },
  };
}

function earningsResponse(allTime = 500) {
  return {
    today: 500,
    this_week: 500,
    this_month: 500,
    all_time: 500,
    paid: { today: 500, this_week: 500, this_month: 500, all_time: 500 },
    pending: { today: 0, this_week: 0, this_month: 0, all_time: 0 },
    job_value: { today: allTime, this_week: allTime, this_month: allTime, all_time: allTime },
    daily: [],
    worker_payable_ledger: {
      schema: 'togt.worker-payable-ledger.v1',
      definition: 'completed_reconciled_paid_project_value_not_worker_net_v1',
      currency: 'ZAR',
      totals: {
        reconciledPaidJobValue: { today: '500.00', thisWeek: '500.00', thisMonth: '500.00', allTime: '500.00' },
        workerGross: { state: 'unavailable', amount: null, reasonCode: 'worker_gross_policy_not_configured' },
        platformFee: { state: 'unavailable', amount: null, reasonCode: 'platform_fee_policy_not_configured' },
        workerNet: { state: 'unavailable', amount: null, reasonCode: 'worker_net_policy_not_configured' },
      },
      projects: [{
        ledgerEntryId: LEDGER_ENTRY_ID,
        projectId: PROJECT_ID,
        serviceLabel: 'Tap repair',
        completedAt: OBSERVED,
        ledgerState: 'recognised',
        latestReasonCode: 'project_reconciled_paid',
        adjustmentCount: 1,
        reconciledPaidJobValue: { currency: 'ZAR', amount: '500.00' },
        workerGross: { state: 'unavailable', amount: null, reasonCode: 'worker_gross_policy_not_configured' },
        platformFee: { state: 'unavailable', amount: null, reasonCode: 'platform_fee_policy_not_configured' },
        workerNet: { state: 'unavailable', amount: null, reasonCode: 'worker_net_policy_not_configured' },
        paymentState: 'paid_online',
        payout: { supported: false, state: 'unavailable', reasonCode: 'payout_capability_unavailable' },
        updatedAt: OBSERVED,
      }],
      entries: [{
        id: LEDGER_ENTRY_ID,
        projectId: PROJECT_ID,
        sequence: 1,
        type: 'recognition',
        reasonCode: 'project_reconciled_paid',
        reconciledPaidJobValueDelta: { currency: 'ZAR', amount: '500.00' },
        occurredAt: OBSERVED,
      }],
      capabilities: {
        workerGross: false,
        platformFee: false,
        workerNet: false,
        availableBalance: false,
        payout: false,
      },
    },
    semantics: {
      currency: 'ZAR',
      legacy_totals: 'paid_job_value',
      paid: 'completed_reconciled_paid_project_value_not_worker_net',
      pending: 'completed_project_value_without_current_reconciled_paid_evidence',
      job_value: 'completed_project_locked_or_booking_total',
      ledger_definition: 'completed_reconciled_paid_project_value_not_worker_net_v1',
      worker_gross_supported: false,
      platform_fee_supported: false,
      worker_net_supported: false,
      available_balance_supported: false,
      payout_supported: false,
    },
  };
}

test('availability requires an authenticated server observation and never defaults Online', () => {
  const adapted = adaptWorkerAvailabilityV1({
    profile: { user_id: WORKER_ID, is_available: false },
  }, OBSERVED);
  assert.equal(adapted.ok, true);
  assert.equal(adapted.value.availability, 'offline');
  assert.equal(adaptWorkerAvailabilityV1({ profile: { user_id: WORKER_ID } }, OBSERVED).ok, false);
});

test('canonical Projects map to worker segments without inferring travel, scope or net', () => {
  const adapted = adaptWorkerJobsV1(projectResponse(), OBSERVED);
  assert.equal(adapted.ok, true);
  assert.equal(adapted.value.upcoming.length, 1);
  const job = adapted.value.upcoming[0];
  assert.equal(job.jobId, PROJECT_ID);
  assert.equal(job.phase.value, 'scheduled');
  assert.equal(job.travel.status, 'unavailable');
  assert.equal(job.scopeSummary.status, 'unavailable');
  assert.equal(job.expectedNet.status, 'unavailable');
  assert.equal(job.paymentState.value, 'processing');
});

test('persisted offers keep server expiry and permission but withhold unsupported evidence', () => {
  const adapted = adaptWorkerOffersV1(offersResponse());
  assert.equal(adapted.ok, true);
  const offer = adapted.value.offers[0];
  assert.equal(offer.offerId, OFFER_ID);
  assert.equal(offer.serverExpiresAt.value, '2026-08-29T08:00:30.000Z');
  assert.equal(offer.acceptancePermission.value.allowed, false);
  assert.equal(offer.travel.status, 'unavailable');
  assert.equal(offer.commercial.status, 'unavailable');
});

test('append-only paid Project evidence never becomes Worker net, balance or a payout promise', () => {
  const adapted = adaptWorkerEarningsV1(earningsResponse(), OBSERVED);
  assert.equal(adapted.ok, true);
  assert.equal(adapted.value.totals.status, 'unavailable');
  assert.equal(adapted.value.paymentEvidence.value.confirmedPaidMinor, 50000);
  assert.equal(adapted.value.paymentEvidence.value.pendingPaidEvidenceMinor, 0);
  assert.equal(adapted.value.completedJobs.length, 1);
  assert.equal(adapted.value.completedJobs[0].jobId, PROJECT_ID);
  assert.equal(adapted.value.completedJobs[0].reconciledPaidJobValue.amountMinor, 50000);
  assert.equal(adapted.value.completedJobs[0].workerGross.status, 'unavailable');
  assert.equal(adapted.value.completedJobs[0].platformFee.status, 'unavailable');
  assert.equal(adapted.value.completedJobs[0].net.status, 'unavailable');
  assert.equal(adapted.value.payoutCapability.value.state, 'not_operational');
  assert.equal(adapted.value.availableBalance.status, 'unavailable');
  assert.equal(adapted.value.nextPayout.status, 'unavailable');
  assert.equal(adapted.value.ledgerNotice, null);
});

test('ledger adapter rejects duplicate accounting and accepts an exactly balanced refund reversal', () => {
  const refunded = earningsResponse();
  refunded.paid = { today: 0, this_week: 0, this_month: 0, all_time: 0 };
  refunded.pending = { today: 500, this_week: 500, this_month: 500, all_time: 500 };
  refunded.worker_payable_ledger.totals.reconciledPaidJobValue = {
    today: '0.00', thisWeek: '0.00', thisMonth: '0.00', allTime: '0.00',
  };
  refunded.worker_payable_ledger.projects[0] = {
    ...refunded.worker_payable_ledger.projects[0],
    ledgerState: 'reversed',
    latestReasonCode: 'payment_refunded',
    adjustmentCount: 2,
    reconciledPaidJobValue: { currency: 'ZAR', amount: '0.00' },
    paymentState: 'refunded',
  };
  refunded.worker_payable_ledger.entries.push({
    id: '55555555-5555-4555-8555-555555555555',
    projectId: PROJECT_ID,
    sequence: 2,
    type: 'reversal',
    reasonCode: 'payment_refunded',
    reconciledPaidJobValueDelta: { currency: 'ZAR', amount: '-500.00' },
    occurredAt: '2026-08-29T09:00:00.000Z',
  });
  const adapted = adaptWorkerEarningsV1(refunded, OBSERVED);
  assert.equal(adapted.ok, true);
  assert.equal(adapted.value.completedJobs[0].ledgerState, 'reversed');
  assert.equal(adapted.value.completedJobs[0].paymentState, 'refunded');

  const duplicated = earningsResponse();
  duplicated.worker_payable_ledger.entries.push({
    ...duplicated.worker_payable_ledger.entries[0],
    id: '66666666-6666-4666-8666-666666666666',
  });
  assert.equal(adaptWorkerEarningsV1(duplicated, OBSERVED).ok, false);
});

test('Today composes only matching server identities and preserves partial evidence', () => {
  const jobs = adaptWorkerJobsV1(projectResponse(), OBSERVED).value;
  const offers = adaptWorkerOffersV1(offersResponse()).value;
  const earnings = adaptWorkerEarningsV1(earningsResponse(), OBSERVED).value;
  const activation = {
    schemaVersion: 1,
    workerId: WORKER_ID,
    stateVersion: 2,
    items: [{
      itemId: 'identity-assurance',
      kind: 'identity_assurance',
      title: 'Identity assurance',
      status: 'pending_review',
      required: true,
      visibility: 'public',
      evidenceLabel: null,
      remedy: 'Wait for review.',
      destinationKey: 'KYC',
    }],
    onlinePermission: {
      status: 'supported',
      source: 'server',
      observedAt: OBSERVED,
      value: { allowed: false, reasonCode: 'worker_activation_incomplete', explanation: 'Identity review remains.' },
    },
    lastUpdatedAt: OBSERVED,
  };
  const profile = {
    snapshot: {
      workerId: WORKER_ID,
      stateVersion: 1,
      services: [],
      publicProfile: {
        displayName: 'Thabo',
        profilePhoto: { status: 'unavailable', reasonCode: 'none', explanation: 'No photo.' },
      },
      lastUpdatedAt: OBSERVED,
    },
    capabilities: {},
  };
  const composed = composeWorkerTodayV1({
    activation,
    profile,
    availability: { workerId: WORKER_ID, availability: 'offline', observedAt: OBSERVED },
    jobs,
    offers,
    earnings,
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.value.nextJob.value.jobId, PROJECT_ID);
  assert.equal(composed.value.newOfferCount.value, 1);
  assert.equal(composed.value.weeklyNet.status, 'unavailable');
  assert.equal(composed.value.identity.value, 'verification_pending');
  assert.equal(composed.value.fastMatchEligibility.value, 'ineligible');

  const inbox = workerJobsSnapshotV1(jobs, offers);
  assert.equal(inbox.offers.status, 'ready');
  assert.equal(inbox.upcoming.status, 'ready');
  assert.equal(inbox.active.status, 'empty');

  const unavailableInbox = workerJobsSnapshotV1(null, null);
  assert.equal(unavailableInbox.offers.status, 'error');
  assert.equal(unavailableInbox.upcoming.status, 'error');
  assert.equal(unavailableInbox.lastUpdatedAt, null);
});
