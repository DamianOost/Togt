'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CUSTOMER_CONFIRMATION_SNAPSHOT_VERSION,
  CUSTOMER_INTAKE_SCHEMA_VERSION,
  createCustomerIntakeDraft,
  createResolvedJobAddress,
  createSubmissionIntent,
  deriveSubmissionReadiness,
  isAddressResolutionDispatchSafe,
  reviseCustomerIntakeDraft,
  saveCustomerIntakeDraftLocally,
  updateJobAddressDetail,
  validateScheduleSelection,
} = require('../../src/features/customer/intake/model.ts');

const AVAILABLE = Object.freeze({
  status: 'available',
  reasonCode: 'available',
  explanation: 'Available for this build and service area.',
});

const UNAVAILABLE = Object.freeze({
  status: 'unavailable',
  reasonCode: 'disabled_by_default',
  explanation: 'This capability is not available yet.',
});

function capabilities(payment = AVAILABLE) {
  return Object.freeze({
    payment,
    fulfilment: Object.freeze({
      fast_match: AVAILABLE,
      compare_workers: AVAILABLE,
      receive_quotes: AVAILABLE,
      diagnostic_visit: AVAILABLE,
    }),
  });
}

function createReadyDraft({
  pricingMode = 'fixed',
  connectionState = 'online',
  fulfilmentMode = pricingMode === 'remote_quote' ? 'receive_quotes' : pricingMode === 'diagnostic_visit' ? 'diagnostic_visit' : 'compare_workers',
} = {}) {
  let draft = createCustomerIntakeDraft({
    draftId: 'draft-c01',
    createdAt: '2026-08-29T07:00:00.000Z',
    connectionState,
  });
  draft = reviseCustomerIntakeDraft(draft, {
    needText: 'Repair the leaking kitchen tap.',
    selectedService: {
      serviceId: 'plumbing-tap-repair',
      serviceVersion: 3,
      label: 'Tap repair',
      requiredQuestionIds: ['leak-location'],
      allowedPricingModes: [pricingMode],
      allowedFulfilmentModes: [fulfilmentMode],
      permitsNow: true,
      photoRequirement: 'optional',
    },
    brief: {
      answers: { 'leak-location': 'Kitchen tap' },
      attachments: [],
      materialsResponsibility: 'discuss',
      budgetCapMinor: 100000,
      diagnosticNeed: '',
    },
    address: createResolvedJobAddress({
      entryMode: 'manual',
      details: {
        line1: '23 Example Street',
        unitOrComplex: '',
        suburb: 'Roodepoort',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '1724',
        landmark: 'Community hall',
        accessInstructions: 'Call at the gate.',
      },
      source: 'provider_geocode',
      coordinates: { latitude: -26.16, longitude: 27.87 },
      confirmedAt: '2026-08-29T07:01:00.000Z',
    }),
    schedule: {
      kind: 'scheduled',
      startsAt: '2026-08-30T08:00:00.000Z',
      timezone: 'Africa/Johannesburg',
      estimatedDurationMinutes: { min: 60, max: 120 },
      fulfilmentMode,
    },
    commercialTerms: pricingMode === 'fixed'
      ? {
          pricingMode: 'fixed',
          labourAmountMinor: 40000,
          platformFeeMinor: 5000,
          allInTotalMinor: 45000,
          materialsAssumption: 'Parts are excluded until approved.',
          cancellationSummary: 'Cancellation terms shown before confirmation.',
        }
      : pricingMode === 'hourly'
        ? {
            pricingMode: 'hourly',
            hourlyRateMinor: 30000,
            estimatedHours: { min: 1, max: 2 },
            estimatedTotalMinor: { min: 30000, max: 60000 },
            approvalCapMinor: 70000,
            platformFeeAssumption: 'The shown estimate includes the disclosed fee basis.',
            materialsAssumption: 'Materials need separate approval.',
            cancellationSummary: 'Cancellation terms shown before confirmation.',
          }
        : pricingMode === 'remote_quote'
          ? {
              pricingMode: 'remote_quote',
              requestFeeMinor: null,
              finalPriceStatus: 'not_available_until_quote',
              materialsAssumption: 'Each complete quote must state materials.',
              cancellationSummary: 'No worker is booked until a quote is accepted.',
            }
          : {
              pricingMode: 'diagnostic_visit',
              diagnosticFeeMinor: 30000,
              platformFeeMinor: 3000,
              visitTotalMinor: 33000,
              deliverable: 'A written fault assessment and recommended next step.',
              laterWorkIncluded: false,
              cancellationSummary: 'Cancellation terms shown before confirmation.',
            },
  }, '2026-08-29T07:02:00.000Z');
  return draft;
}

test('draft creation and revision are deterministic, versioned and deeply immutable', () => {
  const original = createCustomerIntakeDraft({
    draftId: 'draft-immutable',
    createdAt: '2026-08-29T07:00:00Z',
    connectionState: 'offline',
  });
  const revised = reviseCustomerIntakeDraft(original, { needText: '  Install a light  ' }, '2026-08-29T07:01:00Z');

  assert.equal(original.schemaVersion, CUSTOMER_INTAKE_SCHEMA_VERSION);
  assert.equal(original.revision, 1);
  assert.equal(original.needText, '');
  assert.equal(revised.revision, 2);
  assert.equal(revised.needText, 'Install a light');
  assert.equal(Object.isFrozen(revised), true);
  assert.equal(Object.isFrozen(revised.brief.answers), true);
  assert.throws(() => { revised.needText = 'mutated'; }, TypeError);
});

test('catalogue selection is snapshotted and normalized instead of retaining mutable caller data', () => {
  const allowed = ['fixed'];
  const required = ['second', 'first', 'first'];
  const draft = reviseCustomerIntakeDraft(
    createCustomerIntakeDraft({ draftId: 'draft-catalogue', createdAt: '2026-08-29T07:00:00Z', connectionState: 'online' }),
    {
      selectedService: {
        serviceId: 'service-one',
        serviceVersion: 2,
        label: '  Service one ',
        requiredQuestionIds: required,
        allowedPricingModes: allowed,
        allowedFulfilmentModes: ['compare_workers'],
        permitsNow: false,
        photoRequirement: 'optional',
      },
    },
    '2026-08-29T07:01:00Z',
  );
  allowed.push('hourly');
  required.push('third');

  assert.deepEqual(draft.selectedService.allowedPricingModes, ['fixed']);
  assert.deepEqual(draft.selectedService.requiredQuestionIds, ['first', 'second']);
  assert.equal(draft.selectedService.label, 'Service one');
  assert.equal(Object.isFrozen(draft.selectedService.requiredQuestionIds), true);
});

test('offline edits save locally but consequential submission fails closed', () => {
  const offline = createReadyDraft({ connectionState: 'offline' });
  const saved = saveCustomerIntakeDraftLocally(offline, '2026-08-29T07:03:00Z');
  const result = createSubmissionIntent(saved, capabilities(), '2026-08-29T07:04:00Z');

  assert.equal(saved.persistence.state, 'saved_locally');
  assert.equal(saved.persistence.savedAt, '2026-08-29T07:03:00.000Z');
  assert.equal(result.ok, false);
  assert.ok(result.readiness.blockers.some((item) => item.code === 'offline'));
});

test('fixed and hourly submissions require truthful payment capability', () => {
  for (const pricingMode of ['fixed', 'hourly']) {
    const readiness = deriveSubmissionReadiness(
      createReadyDraft({ pricingMode }),
      capabilities(UNAVAILABLE),
      '2026-08-29T07:04:00Z',
    );
    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.some((item) => item.code === 'payment_unavailable'));
  }
});

test('catalogue-required photos block submission until an attachment is present', () => {
  const ready = createReadyDraft();
  const requiredPhoto = reviseCustomerIntakeDraft(ready, {
    selectedService: { ...ready.selectedService, photoRequirement: 'required' },
  }, '2026-08-29T07:03:00Z');
  const result = createSubmissionIntent(requiredPhoto, capabilities(), '2026-08-29T07:04:00Z');
  assert.equal(result.ok, false);
  assert.ok(result.readiness.blockers.some((item) => item.code === 'required_photos_missing'));
});

test('materials responsibility is required before a consequential submission', () => {
  const ready = createReadyDraft();
  const missing = reviseCustomerIntakeDraft(ready, {
    brief: { ...ready.brief, materialsResponsibility: null },
  }, '2026-08-29T07:03:00Z');
  const result = createSubmissionIntent(missing, capabilities(), '2026-08-29T07:04:00Z');
  assert.equal(result.ok, false);
  assert.ok(result.readiness.blockers.some((item) => item.code === 'materials_responsibility_missing'));
});

test('a no-fee remote quote contains no fabricated final total and does not require payment', () => {
  const result = createSubmissionIntent(
    createReadyDraft({ pricingMode: 'remote_quote' }),
    capabilities(UNAVAILABLE),
    '2026-08-29T07:04:00Z',
  );

  assert.equal(result.ok, true);
  assert.equal(result.intent.snapshot.commercialTerms.pricingMode, 'remote_quote');
  assert.equal(result.intent.snapshot.commercialTerms.finalPriceStatus, 'not_available_until_quote');
  assert.equal('allInTotalMinor' in result.intent.snapshot.commercialTerms, false);
});

test('diagnostic snapshot states a deliverable and preserves that later work is excluded', () => {
  const result = createSubmissionIntent(
    createReadyDraft({ pricingMode: 'diagnostic_visit' }),
    capabilities(),
    '2026-08-29T07:04:00Z',
  );

  assert.equal(result.ok, true);
  assert.equal(result.intent.snapshot.schemaVersion, CUSTOMER_CONFIRMATION_SNAPSHOT_VERSION);
  assert.equal(result.intent.snapshot.commercialTerms.laterWorkIncluded, false);
  assert.match(result.intent.snapshot.commercialTerms.deliverable, /assessment/i);
});

test('duplicate confirmation attempts reuse the exact deterministic idempotency key', () => {
  const draft = createReadyDraft();
  const first = createSubmissionIntent(draft, capabilities(), '2026-08-29T07:04:00Z');
  const duplicate = createSubmissionIntent(draft, capabilities(), '2026-08-29T07:05:00Z');

  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(first.intent.idempotencyKey, duplicate.intent.idempotencyKey);
  assert.equal(first.intent.snapshot.fingerprint, duplicate.intent.snapshot.fingerprint);
  assert.match(first.intent.idempotencyKey, /^customer-intake:draft-c01:r2:[a-f0-9]{8}$/);

  const changed = reviseCustomerIntakeDraft(draft, { needText: 'Repair two kitchen taps.' }, '2026-08-29T07:06:00Z');
  const changedResult = createSubmissionIntent(changed, capabilities(), '2026-08-29T07:07:00Z');
  assert.equal(changedResult.ok, true);
  assert.notEqual(changedResult.intent.idempotencyKey, first.intent.idempotencyKey);
});

test('manual address remains draftable while unresolved coordinates block dispatch', () => {
  const ready = createReadyDraft();
  const unresolved = reviseCustomerIntakeDraft(ready, {
    address: {
      ...ready.address,
      resolution: {
        status: 'unresolved',
        source: null,
        coordinates: null,
        reasonCode: 'provider_unavailable',
      },
      confirmedAt: null,
    },
  }, '2026-08-29T07:03:00Z');
  const result = createSubmissionIntent(unresolved, capabilities(), '2026-08-29T07:04:00Z');

  assert.equal(result.ok, false);
  assert.ok(result.readiness.blockers.some((item) => item.code === 'coordinates_unresolved'));
  assert.ok(result.readiness.blockers.some((item) => item.code === 'address_not_confirmed'));
});

test('raw device or entered coordinates cannot be confirmed or dispatched with typed address text', () => {
  const ready = createReadyDraft();
  for (const source of ['device_gps', 'entered_coordinates']) {
    const unverified = createResolvedJobAddress({
      entryMode: source === 'device_gps' ? 'current_location' : 'manual',
      details: ready.address.details,
      source,
      coordinates: { latitude: -26.2041, longitude: 28.0473 },
      confirmedAt: '2026-08-29T07:03:00.000Z',
    });

    assert.equal(unverified.confirmedAt, null, `${source} must not retain dispatch confirmation`);
    assert.equal(isAddressResolutionDispatchSafe(unverified), false);

    // Exercise the consequential boundary with a forged confirmation as well
    // as the normalised draft, so callers cannot bypass the UI guard.
    const forged = {
      ...ready,
      address: { ...unverified, confirmedAt: '2026-08-29T07:03:00.000Z' },
    };
    const result = createSubmissionIntent(forged, capabilities(), '2026-08-29T07:04:00Z');
    assert.equal(result.ok, false);
    assert.ok(result.readiness.blockers.some((item) => item.code === 'coordinates_unverified'));
  }
});

test('provider-resolved, verified-place and integrated-map coordinates remain dispatch eligible', () => {
  const ready = createReadyDraft();
  for (const source of ['provider_geocode', 'saved_verified_place', 'map_pin']) {
    const verified = createResolvedJobAddress({
      entryMode: source === 'saved_verified_place' ? 'saved_place' : source === 'map_pin' ? 'map_pin' : 'manual',
      details: ready.address.details,
      source,
      coordinates: { latitude: -26.2041, longitude: 28.0473 },
      confirmedAt: '2026-08-29T07:03:00.000Z',
    });
    assert.equal(isAddressResolutionDispatchSafe(verified), true, source);
    assert.equal(verified.confirmedAt, '2026-08-29T07:03:00.000Z');
  }
});

test('address text cannot drift away from the coordinate resolution it was confirmed against', () => {
  const ready = createReadyDraft();
  assert.throws(
    () => reviseCustomerIntakeDraft(ready, {
      address: {
        ...ready.address,
        details: { ...ready.address.details, line1: 'A different street' },
      },
    }, '2026-08-29T07:03:00Z'),
    /same address version/,
  );
});

test('landmark and access-note edits keep confirmed coordinates recoverable', () => {
  const address = createReadyDraft().address;
  const withAccessNote = updateJobAddressDetail(address, 'accessInstructions', 'Use the side gate.');
  const withLandmark = updateJobAddressDetail(withAccessNote, 'landmark', 'Opposite the library.');

  assert.equal(withAccessNote.resolution.status, 'resolved');
  assert.deepEqual(withAccessNote.resolution.coordinates, address.resolution.coordinates);
  assert.equal(withAccessNote.confirmedAt, null);
  assert.equal(withLandmark.resolution.status, 'resolved');
  assert.deepEqual(withLandmark.resolution.coordinates, address.resolution.coordinates);
  assert.equal(withLandmark.details.landmark, 'Opposite the library.');
});

test('actual address-field edits still invalidate coordinates and confirmation', () => {
  const address = createReadyDraft().address;
  const changed = updateJobAddressDetail(address, 'line1', '99 Different Street');

  assert.deepEqual(changed.resolution, {
    status: 'unresolved',
    source: null,
    coordinates: null,
    reasonCode: 'address_text_changed',
  });
  assert.equal(changed.confirmedAt, null);
  assert.equal(changed.entryMode, 'manual');
});

test('schedule validation rejects past work and Now when the catalogue does not permit it', () => {
  assert.deepEqual(
    validateScheduleSelection({
      kind: 'scheduled',
      startsAt: '2026-08-29T06:00:00Z',
      timezone: 'Africa/Johannesburg',
      estimatedDurationMinutes: null,
      fulfilmentMode: 'compare_workers',
    }, { now: '2026-08-29T07:00:00Z', permitsNow: true }),
    { valid: false, reasonCode: 'scheduled_time_not_future' },
  );
  assert.deepEqual(
    validateScheduleSelection({
      kind: 'now',
      startsAt: null,
      timezone: 'Africa/Johannesburg',
      estimatedDurationMinutes: null,
      fulfilmentMode: 'compare_workers',
    }, { now: '2026-08-29T07:00:00Z', permitsNow: false }),
    { valid: false, reasonCode: 'now_not_permitted' },
  );
});

test('unavailable fulfilment fails closed without implying supply', () => {
  const context = capabilities();
  const restricted = {
    ...context,
    fulfilment: { ...context.fulfilment, compare_workers: UNAVAILABLE },
  };
  const result = createSubmissionIntent(createReadyDraft(), restricted, '2026-08-29T07:04:00Z');
  assert.equal(result.ok, false);
  assert.ok(result.readiness.blockers.some((item) => item.code === 'fulfilment_unavailable'));
});
