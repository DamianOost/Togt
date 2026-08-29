const {
  deriveOperationalPhase,
  projectSegment,
  projectionFor,
} = require('../src/services/groundedProjects/state');
const {
  LIVE_FRESH_MS,
  LIVE_HARD_HIDE_MS,
  sanitizeScopeValue,
  serializeProject,
  timelineFor,
} = require('../src/services/groundedProjects/privacy');

const NOW = Date.parse('2026-08-29T12:00:00.000Z');

function row(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    customer_id: '22222222-2222-4222-8222-222222222222',
    labourer_id: '33333333-3333-4333-8333-333333333333',
    status: 'accepted',
    operational_phase: 'scheduled',
    lifecycle_revision: 4,
    skill_needed: 'Plumbing',
    scheduled_at: '2026-08-30T10:00:00.000Z',
    created_at: '2026-08-28T10:00:00.000Z',
    phase_updated_at: '2026-08-29T10:00:00.000Z',
    hours_est: '2.00',
    total_amount: '850.00',
    address: '12 Exact Street, Cape Town',
    location_lat: '-33.9248685',
    location_lng: '18.4240553',
    notes: 'Gate 4. Call 082 123 4567.',
    scope_items: [{ label: 'Fix tap', phone: '0821234567', note: 'mail me a@b.co.za' }],
    scope_confirmed_by_customer: true,
    scope_confirmed_by_labourer: false,
    customer_name: 'Naledi Mokoena',
    customer_phone: '0821234567',
    customer_avatar: null,
    labourer_name: 'Thabo Dlamini',
    labourer_phone: '0837654321',
    labourer_avatar: null,
    labourer_verified: true,
    rating_avg: '4.80',
    rating_count: 25,
    current_lat: '-33.93',
    current_lng: '18.43',
    location_updated_at: new Date(NOW - 10_000).toISOString(),
    payment_status: null,
    payment_id: null,
    completion_status: null,
    ...overrides,
  };
}

describe('Grounded Project canonical phase projection', () => {
  test.each([
    [{ status: 'pending' }, 'matching', 'active'],
    [{ status: 'pending', operational_phase: 'assigned' }, 'assigned', 'upcoming'],
    [{ status: 'accepted', operational_phase: 'matching' }, 'scheduled', 'upcoming'],
    [{ status: 'accepted', operational_phase: 'en_route' }, 'en_route', 'active'],
    [{ status: 'in_progress' }, 'work_active', 'active'],
    [{ status: 'in_progress', completion_status: 'requested' }, 'completion_review', 'active'],
    [{ status: 'completed', payment_status: 'pending' }, 'payment_pending', 'active'],
    [{ status: 'completed', payment_status: 'paid' }, 'closed', 'past'],
    [{ status: 'cancelled' }, 'closed', 'past'],
  ])('derives %j as %s / %s', (overrides, expectedPhase, expectedSegment) => {
    const project = row(overrides);
    expect(deriveOperationalPhase(project)).toBe(expectedPhase);
    expect(projectSegment(project)).toBe(expectedSegment);
  });

  test('unknown combinations become a safe read-only support projection', () => {
    const projection = projectionFor(row({ status: 'unknown', operational_phase: 'unknown' }), 'customer');
    expect(projection).toEqual({
      phase: 'closed',
      label: 'Status unavailable',
      dominantAction: 'view_support',
      readOnly: true,
    });
  });

  test('terminal exceptions never masquerade as successful completion', () => {
    expect(projectionFor(row({ status: 'cancelled' }), 'customer')).toEqual({
      phase: 'closed',
      label: 'Cancelled',
      dominantAction: 'view_support',
      readOnly: true,
    });
    expect(projectionFor(row({ status: 'terminated_after_start' }), 'labourer')).toEqual({
      phase: 'closed',
      label: 'Work stopped',
      dominantAction: 'view_support',
      readOnly: true,
    });
  });
});

describe('Grounded Project role x phase privacy', () => {
  test('scheduled worker gets broad area, first-name customer identity and no contact or notes', () => {
    const project = serializeProject(row(), {
      id: '33333333-3333-4333-8333-333333333333',
      role: 'labourer',
    }, { detail: true, now: NOW });

    expect(project.area).toEqual({
      precision: 'approximate',
      label: 'Approximate job area',
      coordinate: { latitude: -33.92, longitude: 18.42 },
    });
    expect(project.participants.customer.displayName).toBe('Naledi');
    expect(project.participants.customer).not.toHaveProperty('phone');
    expect(project.participants.worker).not.toHaveProperty('phone');
    expect(project.scope).not.toHaveProperty('customerNotes');
    expect(project).not.toHaveProperty('workerLiveLocation');
  });

  test('active worker receives exact job location/contact but structured scope is contact-redacted', () => {
    const project = serializeProject(row({ status: 'in_progress', operational_phase: 'work_active' }), {
      id: '33333333-3333-4333-8333-333333333333',
      role: 'labourer',
    }, { detail: true, now: NOW });

    expect(project.area.precision).toBe('exact');
    expect(project.area.address).toBe('12 Exact Street, Cape Town');
    expect(project.participants.customer.phone).toBe('0821234567');
    expect(project.scope.items[0]).not.toHaveProperty('phone');
    expect(project.scope.items[0].note).toBe('mail me [contact removed]');
  });

  test('customer retains its exact project address and private notes', () => {
    const project = serializeProject(row(), {
      id: '22222222-2222-4222-8222-222222222222',
      role: 'customer',
    }, { detail: true, now: NOW });

    expect(project.area.precision).toBe('exact');
    expect(project.scope.customerNotes).toBe('Gate 4. Call 082 123 4567.');
  });

  test('closed projects revoke worker exact address and both participants contacts', () => {
    const project = serializeProject(row({
      status: 'completed',
      operational_phase: 'closed',
      payment_status: 'paid',
    }), {
      id: '33333333-3333-4333-8333-333333333333',
      role: 'labourer',
    }, { detail: true, now: NOW });

    expect(project.area.precision).toBe('approximate');
    expect(project.participants.customer).not.toHaveProperty('phone');
    expect(project.participants.worker).not.toHaveProperty('phone');
  });

  test('customer worker-location freshness is explicit and hard-hidden at five minutes', () => {
    const viewer = { id: '22222222-2222-4222-8222-222222222222', role: 'customer' };
    const active = row({ status: 'in_progress', operational_phase: 'work_active' });

    expect(serializeProject(active, viewer, { detail: true, now: NOW }).workerLiveLocation.freshness)
      .toBe('fresh');

    active.location_updated_at = new Date(NOW - LIVE_FRESH_MS - 1).toISOString();
    expect(serializeProject(active, viewer, { detail: true, now: NOW }).workerLiveLocation.freshness)
      .toBe('stale');

    active.location_updated_at = new Date(NOW - LIVE_HARD_HIDE_MS - 1).toISOString();
    expect(serializeProject(active, viewer, { detail: true, now: NOW }))
      .not.toHaveProperty('workerLiveLocation');
  });

  test('scope sanitizer removes nested contact/location keys and bounds depth', () => {
    const sanitized = sanitizeScopeValue({
      address: 'secret',
      details: { contactEmail: 'secret@example.com', safe: 'Call 082 111 2222' },
    });
    expect(sanitized).toEqual({ details: { safe: 'Call [contact removed]' } });
  });
});

describe('Grounded Project timeline serializer', () => {
  test('returns privacy-safe event metadata and never forwards payload', () => {
    const timeline = timelineFor([{
      id: 'event-1',
      aggregate_sequence: '2',
      event_type: 'completion.requested',
      actor_role: 'labourer',
      booking_status: 'in_progress',
      operational_phase: 'completion_review',
      payload: { address: 'must not leak' },
      occurred_at: '2026-08-29T11:00:00.000Z',
    }]);

    expect(timeline).toEqual([{
      id: 'event-1',
      sequence: 2,
      type: 'completion.requested',
      label: 'Worker requested completion',
      phase: 'completion_review',
      bookingStatus: 'in_progress',
      actorRole: 'worker',
      occurredAt: '2026-08-29T11:00:00.000Z',
    }]);
  });
});
