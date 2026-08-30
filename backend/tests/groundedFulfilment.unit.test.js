const {
  normalizeScopeProposal,
  normalizeChangeOrder,
  normalizeStart,
  requestHash,
} = require('../src/services/groundedFulfilment/contracts');
const { assertCanonicalInitialScope } = require('../src/services/groundedFulfilment/bootstrap');
const {
  createPinMaterial,
  verifyPin,
  revealPin,
  deviceIdHash,
} = require('../src/services/groundedFulfilment/pin');
const {
  LEGACY_MATERIALS_RESPONSIBILITY,
  canonicalScopeSnapshot,
  scopeMaterialsResolved,
  scrub,
  workerExactAccess,
  serializeFulfilment,
} = require('../src/services/groundedFulfilment/privacy');

const IDS = {
  booking: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  worker: '33333333-3333-4333-8333-333333333333',
};

function booking(overrides = {}) {
  return {
    id: IDS.booking,
    customer_id: IDS.customer,
    labourer_id: IDS.worker,
    customer_name: 'Naledi Mokoena',
    customer_phone: '0821234567',
    customer_avatar: null,
    worker_name: 'Thabo Dlamini',
    worker_phone: '0837654321',
    worker_avatar: null,
    status: 'accepted',
    operational_phase: 'scheduled',
    lifecycle_revision: 2,
    schedule_revision: 1,
    scheduled_at: '2026-08-30T10:00:00.000Z',
    created_at: '2026-08-29T10:00:00.000Z',
    phase_updated_at: '2026-08-29T11:00:00.000Z',
    address: '12 Exact Street, Cape Town',
    location_lat: -33.92486,
    location_lng: 18.42405,
    route_access_granted_at: null,
    fulfilment_access_revoked_at: null,
    current_scope_version: null,
    policy_version: 'ops-v1',
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    scopes: [],
    pin: null,
    reschedules: [],
    changes: [],
    noShows: [],
    replacement: null,
    ...overrides,
  };
}

describe('Grounded fulfilment input contracts', () => {
  test('initial agreement bootstrap rejects split or malformed scope shapes', () => {
    const snapshot = {
      description: 'Replace the failed connector',
      items: ['Remove failed connector', 'Fit replacement'],
      materialsResponsibility: 'Worker supplies materials or parts.',
      materialsResponsibilityCode: 'worker',
    };
    expect(() => assertCanonicalInitialScope(snapshot, snapshot.items)).not.toThrow();
    expect(() => assertCanonicalInitialScope(
      { ...snapshot, items: [{ label: 'Remove failed connector' }] },
      [{ label: 'Remove failed connector' }]
    )).toThrow(/Canonical initial scope/);
    expect(() => assertCanonicalInitialScope(snapshot, ['Different item']))
      .toThrow(/Canonical initial scope/);
  });

  test('normalizes scope and monetary intent without allowing server-owned fields', () => {
    expect(normalizeScopeProposal({
      baseVersion: null,
      description: 'Repair the leaking tap',
      items: ['Replace damaged washer'],
      materialsResponsibility: 'Customer supplies the washer',
      materialsResponsibilityCode: 'worker',
      estimatedMinutes: 60,
    })).toEqual({
      baseVersion: null,
      description: 'Repair the leaking tap',
      items: ['Replace damaged washer'],
      materialsResponsibility: 'Worker supplies materials or parts.',
      materialsResponsibilityCode: 'worker',
      estimatedMinutes: 60,
    });
    expect(() => normalizeChangeOrder({
      baseScopeVersion: 1,
      description: 'Replace damaged valve',
      addedScopeItems: ['Replace valve'],
      labourAmount: '100.00',
      materialsAmount: '50.00',
      revisedTotalAmount: '1.00',
    })).toThrow(/unsupported/i);
  });

  test('rejects contact details in bilateral scope evidence', () => {
    expect(() => normalizeScopeProposal({
      baseVersion: null,
      description: 'Call me on 082 123 4567 before the repair',
      items: ['Replace washer'],
      materialsResponsibility: 'Worker supplies washer',
      materialsResponsibilityCode: 'worker',
    })).toThrow(/contact/i);
    expect(() => normalizeScopeProposal({
      baseVersion: null,
      description: 'Repair the leaking tap',
      items: ['Replace washer'],
      materialsResponsibility: 'Discuss later',
      materialsResponsibilityCode: 'discuss',
    })).toThrow(/supplies materials/i);
  });

  test('requires a six-digit PIN and opaque device identifier', () => {
    expect(normalizeStart({ startPin: '012345', deviceId: 'device:android:123' }))
      .toEqual({ startPin: '012345', deviceId: 'device:android:123' });
    expect(() => normalizeStart({ startPin: '12345', deviceId: 'short' })).toThrow(/six-digit/i);
  });

  test('uses a stable keyed command fingerprint', () => {
    const first = requestHash({ b: 2, a: 1 }, 4);
    expect(first).toBe(requestHash({ a: 1, b: 2 }, 4));
    expect(first).not.toBe(requestHash({ a: 1, b: 2 }, 5));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('server-issued start PIN material', () => {
  test('keeps only keyed material reproducible and timing-safe verifiable', () => {
    const material = createPinMaterial({ bookingId: IDS.booking, scopeVersion: 1, generation: 1 });
    const challenge = {
      booking_id: IDS.booking,
      scope_version: 1,
      generation: 1,
      pin_salt: material.salt,
      pin_hash: material.hash,
    };
    expect(material.pin).toMatch(/^\d{6}$/);
    expect(material.hash).not.toContain(material.pin);
    expect(revealPin(challenge)).toBe(material.pin);
    expect(verifyPin(material.pin, challenge)).toBe(true);
    expect(verifyPin('999999' === material.pin ? '000000' : '999999', challenge)).toBe(false);
  });

  test('device identifiers are one-way hashed before storage', () => {
    expect(deviceIdHash('device:android:123')).toMatch(/^[a-f0-9]{64}$/);
    expect(deviceIdHash('device:android:123')).not.toContain('android');
    expect(deviceIdHash(null)).toBeNull();
  });
});

describe('fulfilment privacy projection', () => {
  test('legacy accepted scope snapshots project the documented string contract without inventing responsibility', () => {
    expect(canonicalScopeSnapshot({
      description: 'Replace the failed connector',
      items: [{ label: 'Remove failed connector' }, { label: 'Fit replacement' }],
    }, 'accepted_agreement')).toEqual({
      description: 'Replace the failed connector',
      items: ['Remove failed connector', 'Fit replacement'],
      materialsResponsibility: LEGACY_MATERIALS_RESPONSIBILITY,
    });
    const corrupt = { description: 'Unknown shape', items: [{ value: 'must not disappear' }] };
    expect(canonicalScopeSnapshot(corrupt, 'accepted_agreement')).toBe(corrupt);
    const mixed = { description: 'Mixed shape', items: ['Keep me', { label: 'Keep me too' }] };
    expect(canonicalScopeSnapshot(mixed, 'accepted_agreement')).toEqual({
      description: 'Mixed shape',
      items: ['Keep me', 'Keep me too'],
      materialsResponsibility: LEGACY_MATERIALS_RESPONSIBILITY,
    });
    expect(canonicalScopeSnapshot(mixed, 'approved_change_order')).toEqual({
      description: 'Mixed shape',
      items: ['Keep me', 'Keep me too'],
      materialsResponsibility: LEGACY_MATERIALS_RESPONSIBILITY,
    });
    const unknownMaterials = { items: [{ label: 'Keep me' }], materialsResponsibility: { code: 'worker' } };
    expect(canonicalScopeSnapshot(unknownMaterials, 'accepted_agreement')).toBe(unknownMaterials);
    expect(canonicalScopeSnapshot({ items: [{ label: 'Proposal' }] }, 'worker_proposal'))
      .toEqual({ items: [{ label: 'Proposal' }] });
  });

  test('start authority requires explicit accepted terms or a bilaterally confirmed participant scope', () => {
    const accepted = {
      status: 'confirmed',
      source: 'accepted_agreement',
      scope_snapshot: {
        materialsResponsibility: 'Worker supplies materials or parts.',
        materialsResponsibilityCode: 'worker',
      },
    };
    expect(scopeMaterialsResolved(accepted)).toBe(true);
    expect(scopeMaterialsResolved({
      ...accepted,
      scope_snapshot: {
        materialsResponsibility: 'Agree on site.',
        materialsResponsibilityCode: 'discuss',
      },
    })).toBe(false);
    expect(scopeMaterialsResolved({
      status: 'confirmed',
      source: 'participant_proposal',
      scope_snapshot: {
        materialsResponsibility: 'Customer supplies the valve.',
        materialsResponsibilityCode: 'customer',
      },
      customer_confirmed_at: '2026-08-29T11:05:00.000Z',
      worker_confirmed_at: '2026-08-29T11:00:00.000Z',
    })).toBe(true);
    expect(scopeMaterialsResolved({
      status: 'confirmed',
      source: 'participant_proposal',
      scope_snapshot: { materialsResponsibility: 'TBD' },
      customer_confirmed_at: '2026-08-29T11:05:00.000Z',
      worker_confirmed_at: '2026-08-29T11:00:00.000Z',
    })).toBe(false);
  });

  test('unresolved accepted terms remain visible but expose no PIN or start authority', () => {
    const unresolvedScope = {
      version: 1,
      status: 'confirmed',
      source: 'accepted_agreement',
      proposed_by_role: 'customer',
      scope_snapshot: {
        description: 'Repair the leaking tap',
        items: ['Replace damaged washer'],
        materialsResponsibility: LEGACY_MATERIALS_RESPONSIBILITY,
        materialsResponsibilityCode: 'not_recorded',
      },
      customer_confirmed_at: '2026-08-29T11:00:00.000Z',
      worker_confirmed_at: '2026-08-29T11:00:00.000Z',
      created_at: '2026-08-29T10:00:00.000Z',
    };
    const dto = serializeFulfilment(
      booking({ operational_phase: 'scope_confirmation', current_scope_version: 1 }),
      state({ scopes: [unresolvedScope] }),
      { id: IDS.customer, role: 'customer' }
    );
    expect(dto.scope.current.snapshot.materialsResponsibility).toBe(LEGACY_MATERIALS_RESPONSIBILITY);
    expect(dto.start.customerCanReveal).toBe(false);
    expect(dto.allowedActions.revealStartPin).toBe(false);
    expect(dto.allowedActions.startWork).toBe(false);
  });

  test('scheduled Workers receive only an approximate area and no participant contact', () => {
    const dto = serializeFulfilment(booking(), state(), { id: IDS.worker, role: 'labourer' });
    expect(dto.location.precision).toBe('approximate');
    expect(dto.location).not.toHaveProperty('address');
    expect(dto.participants.customer.phone).toBeNull();
    expect(dto.allowedActions.startRoute).toBe(true);
  });

  test('scheduled customers cannot see Worker contact before route access', () => {
    const dto = serializeFulfilment(booking(), state(), { id: IDS.customer, role: 'customer' });
    expect(dto.participants.worker.phone).toBeNull();
  });

  test('route access reveals exact location then revocation removes it immediately', () => {
    const active = booking({
      operational_phase: 'en_route',
      route_access_granted_at: '2026-08-29T11:00:00.000Z',
    });
    expect(workerExactAccess(active)).toBe(true);
    const worker = serializeFulfilment(active, state(), { id: IDS.worker, role: 'labourer' });
    const customer = serializeFulfilment(active, state(), { id: IDS.customer, role: 'customer' });
    expect(worker.location.precision).toBe('exact');
    expect(worker.participants.customer.phone).toBe('0821234567');
    expect(customer.participants.worker.phone).toBe('0837654321');
    const revoked = { ...active, fulfilment_access_revoked_at: '2026-08-29T11:05:00.000Z' };
    expect(workerExactAccess(revoked)).toBe(false);
    expect(serializeFulfilment(revoked, state(), { id: IDS.worker, role: 'labourer' }).location.precision)
      .toBe('approximate');
  });

  test('scope scrubbing recursively removes contact-shaped fields and strings', () => {
    const safe = scrub({
      notes: 'Email a.person@example.test',
      phone: '0821234567',
      nested: { address: 'secret', detail: 'Call 083 123 4567' },
    });
    expect(JSON.stringify(safe)).not.toMatch(/0821234567|083 123 4567|a\.person|secret/);
    expect(safe).not.toHaveProperty('phone');
    expect(safe.nested).not.toHaveProperty('address');
  });

  test('missing policy fails closed as a read-only projection', () => {
    const dto = serializeFulfilment(
      booking({ policy_version: null }),
      state(),
      { id: IDS.customer, role: 'customer' }
    );
    expect(dto.integrity).toEqual({
      policySnapshotPresent: false,
      policyVersion: null,
      readOnly: true,
    });
    expect(Object.values(dto.allowedActions).every((value) => value === false)).toBe(true);
  });
});
