'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DOMAIN_DTO_VERSION,
  adaptCapabilityAvailabilityV1,
  adaptProjectSummaryV1,
  adaptServiceSummaryV1,
  adaptWorkerSummaryV1,
} = require('../../src/domain/contracts/dtoAdapters.ts');

test('service adapter normalises existing snake-case legacy fields', () => {
  const result = adaptServiceSummaryV1({
    id: 'service_1',
    labourer_id: 'worker_1',
    title: 'Geyser repair',
    skill: 'Plumbing',
    description: 'Assessment and repair',
    rate_per_hour: '275.50',
    is_active: true,
    photos: ['https://cdn.example.test/service.jpg', 'data:text/plain,unsafe'],
    secret_note: 'never copy this',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, DOMAIN_DTO_VERSION);
  assert.equal(result.value.workerId, 'worker_1');
  assert.equal(result.value.categoryLabel, 'Plumbing');
  assert.equal(result.value.hourlyRateMinor, 27550);
  assert.deepEqual(result.value.photoUrls, ['https://cdn.example.test/service.jpg']);
  assert.equal(Object.hasOwn(result.value, 'secret_note'), false);
  assert.deepEqual(result.warnings, [{ field: 'photoUrls', code: 'invalid' }]);
});

test('service and worker adapters reject missing identity fields', () => {
  assert.deepEqual(
    adaptServiceSummaryV1({ title: 'Plumbing', skill: 'Plumbing' }),
    {
      ok: false,
      issues: [
        { field: 'id', code: 'missing' },
        { field: 'workerId', code: 'missing' },
      ],
    },
  );
  assert.equal(adaptWorkerSummaryV1({ id: 'worker_1' }).ok, false);
});

test('worker adapter does not invent verification, ratings or availability', () => {
  const noEvidence = adaptWorkerSummaryV1({
    id: 'worker_1',
    name: 'Thandi',
    rating_avg: 0,
    rating_count: 0,
  });
  assert.equal(noEvidence.ok, true);
  assert.equal(noEvidence.value.verificationStatus, 'not_provided');
  assert.equal(noEvidence.value.rating, null);
  assert.equal(noEvidence.value.available, null);

  const explicitEvidence = adaptWorkerSummaryV1({
    user_id: 'worker_2',
    display_name: 'Sipho',
    is_verified: true,
    is_available: false,
    rating_avg: '4.8',
    rating_count: 17,
    distance_km: '3.2',
  });
  assert.equal(explicitEvidence.ok, true);
  assert.equal(explicitEvidence.value.verificationStatus, 'verified');
  assert.equal(explicitEvidence.value.available, false);
  assert.deepEqual(explicitEvidence.value.rating, { average: 4.8, count: 17 });
  assert.equal(explicitEvidence.value.distanceKm, 3.2);
});

test('project adapter keeps payment and currency unknown when not explicitly supplied', () => {
  const result = adaptProjectSummaryV1({
    id: 'booking_1',
    status: 'completed',
    skill_needed: 'Painting',
    scheduled_at: '2026-09-01T08:00:00+02:00',
    total_amount: '900.00',
    customer_name: 'Lerato',
    labourer_name: 'Anele',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.lifecycleStatus, 'completed');
  assert.equal(result.value.totalAmountMinor, 90000);
  assert.equal(result.value.currency, null);
  assert.equal(result.value.paymentStatus, 'not_provided');
  assert.equal(result.value.scheduledAt, '2026-09-01T06:00:00.000Z');
});

test('project adapter accepts only explicit recognised payment evidence', () => {
  const paid = adaptProjectSummaryV1({
    booking_id: 'booking_2',
    status: 'accepted',
    service_label: 'Electrical work',
    payment_status: 'paid',
    currency: 'ZAR',
  });
  const unknown = adaptProjectSummaryV1({
    booking_id: 'booking_3',
    status: 'accepted',
    service_label: 'Electrical work',
    payment_status: 'settled_somehow',
  });

  assert.equal(paid.ok, true);
  assert.equal(paid.value.paymentStatus, 'paid');
  assert.equal(paid.value.currency, 'ZAR');
  assert.equal(unknown.ok, true);
  assert.equal(unknown.value.paymentStatus, 'not_provided');
});

test('capability adapter fails closed unless v1 data explicitly says available', () => {
  const unavailable = adaptCapabilityAvailabilityV1('peach_checkout', null);
  const missing = adaptCapabilityAvailabilityV1('peach_checkout', {
    schema_version: 1,
    features: {},
  });
  const disabled = adaptCapabilityAvailabilityV1('peach_checkout', {
    schema_version: 1,
    features: {
      peach_checkout: { available: 'true', reason_code: 'not_approved' },
    },
  });
  const enabled = adaptCapabilityAvailabilityV1('foreground_location_updates', {
    schema_version: 1,
    features: {
      foreground_location_updates: { available: true, mode: 'active_app_only' },
    },
  });

  assert.equal(unavailable.available, false);
  assert.equal(missing.available, false);
  assert.equal(disabled.available, false);
  assert.equal(disabled.reasonCode, 'not_approved');
  assert.equal(enabled.available, true);
  assert.equal(enabled.mode, 'active_app_only');
});
