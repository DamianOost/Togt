const fs = require('fs');
const path = require('path');
const {
  EMERGENCY_FALLBACK,
  sha256,
  validateOccurrenceSchedule,
} = require('../src/services/groundedTrust/contracts');
const { buildTerms } = require('../src/services/groundedTrust/recurrence');
const {
  serializeIncident,
  serializeRebookDraft,
  serializeSeries,
} = require('../src/services/groundedTrust/privacy');

function future(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('Grounded trust contracts', () => {
  test('recurring occurrence schema accepts every emitted terminal replacement state', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../src/db/migrations/020_grounded_trust_relationships.sql'),
      'utf8'
    );
    const occurrenceConstraint = migration.match(
      /CREATE TABLE IF NOT EXISTS grounded_recurring_occurrences[\s\S]*?CREATE INDEX IF NOT EXISTS idx_grounded_occurrences_series/
    )?.[0];
    expect(occurrenceConstraint).toContain("'superseded'");
  });

  test('canonical hashes ignore object key insertion order', () => {
    expect(sha256({ a: 1, b: { c: 2, d: 3 } }))
      .toBe(sha256({ b: { d: 3, c: 2 }, a: 1 }));
  });

  test('recurring schedules require ordered, distinct, bounded South African occurrences', () => {
    const valid = validateOccurrenceSchedule({
      timezone: 'Africa/Johannesburg',
      occurrences: [future(7), future(14)],
    });
    expect(valid.occurrences).toHaveLength(2);
    expect(() => validateOccurrenceSchedule({
      timezone: 'UTC',
      occurrences: [future(7), future(14)],
    })).toThrow('Schedule timezone is unsupported');
    expect(() => validateOccurrenceSchedule({
      timezone: 'Africa/Johannesburg',
      occurrences: [future(14), future(7)],
    })).toThrow('Recurring occurrences are not ordered');
  });

  test('recurring terms expose only participant-safe service/commercial evidence', () => {
    const terms = buildTerms({
      agreement_service_id: '11111111-1111-4111-8111-111111111111',
      agreement_service_version: 2,
      agreement_service_snapshot: {
        label: 'Home repair',
        pricingMode: 'remote_quote',
        workerEligibility: { privateReview: 'never expose' },
      },
      agreement_commercial_snapshot: {
        pricingMode: 'remote_quote',
        customerTotalAmount: '850.00',
        currency: 'ZAR',
        workerNet: { amount: '700.00' },
        platformFee: { amount: '150.00' },
      },
      cancellation_policy_version: 'cancel-v2',
      skill_needed: 'Home repair',
      total_amount: '850.00',
    }, {
      schedule: {
        timezone: 'Africa/Johannesburg',
        occurrences: [future(7), future(14)],
      },
      substitutionPolicy: 'explicit_approval_each_time',
    });

    expect(terms.serviceSnapshot).not.toHaveProperty('workerEligibility');
    expect(terms.commercialSnapshot).not.toHaveProperty('workerNet');
    expect(terms.commercialSnapshot).not.toHaveProperty('platformFee');
    expect(terms.commercialSnapshot.rateChangesRequireNewMutualTerms).toBe(true);
    expect(terms.substitutionPolicy).toBe('explicit_approval_each_time');
  });
});

describe('Grounded trust privacy projections', () => {
  test('incident list projection omits the restricted narrative and never claims response', () => {
    const row = {
      id: 'incident-id',
      case_kind: 'safety',
      category: 'unsafe_work',
      state: 'received',
      revision: 1,
      summary: 'Private narrative with a home address',
      intake_channel: 'in_app_record',
      operations_alerted: false,
      emergency_services_dispatched: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const list = serializeIncident(row);
    expect(list).not.toHaveProperty('summary');
    expect(list.channel.operationsAlerted).toBe(false);
    expect(list.channel.humanAcknowledgementExpected).toBe(false);
    expect(list.emergencyFallback).toEqual(EMERGENCY_FALLBACK);
    expect(serializeIncident(row, { detail: true }).summary).toBe(row.summary);
  });

  test('rebook projection cannot masquerade as a submitted booking', () => {
    const projected = serializeRebookDraft({
      id: 'draft-id',
      revision: 1,
      status: 'draft',
      source_booking_id: 'source-id',
      preferred_worker_id: 'worker-id',
      worker_name: 'Thabo',
      source_service_label: 'Plumbing',
      editable_scope: { items: ['Tap repair'] },
      created_at: new Date(),
      updated_at: new Date(),
    });
    expect(projected.submission).toEqual({
      submitted: false,
      bookingCreated: false,
      supportedByThisEndpoint: false,
    });
    expect(projected.confirmationsRequired).toEqual({
      currentPrice: true,
      location: true,
      schedule: true,
      workerAvailability: true,
    });
    expect(projected).not.toHaveProperty('price');
    expect(projected).not.toHaveProperty('address');
  });

  test('series projection exposes only the pending requester role for counterpart decisions', () => {
    const customerId = '11111111-1111-4111-8111-111111111111';
    const workerId = '22222222-2222-4222-8222-222222222222';
    const base = {
      id: '33333333-3333-4333-8333-333333333333',
      revision: 4,
      status: 'resume_requested',
      source_booking_id: '44444444-4444-4444-8444-444444444444',
      customer_id: customerId,
      worker_id: workerId,
      worker_name: 'Thabo',
      resume_requested_by: workerId,
      cancellation_requested_by: customerId,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const bundle = (series) => ({
      series,
      currentTerms: null,
      proposedTerms: null,
      acceptances: [],
      occurrences: [],
      changes: [],
    });
    const resume = serializeSeries(bundle(base));
    expect(resume.pendingRequests).toEqual({
      resumeRequestedByRole: 'worker',
      cancellationRequestedByRole: null,
    });
    expect(JSON.stringify(resume.pendingRequests)).not.toContain(workerId);

    const cancellation = serializeSeries(bundle({
      ...base,
      status: 'cancellation_requested',
    }));
    expect(cancellation.pendingRequests).toEqual({
      resumeRequestedByRole: null,
      cancellationRequestedByRole: 'customer',
    });
  });
});
