const {
  serializeLabourerPublic,
  serializeBookingForUser,
  serializeMatchForCustomer,
  serializeMatchForLabourerCandidate,
} = require('../src/lib/privacy');

const CUSTOMER_ID = 'customer-1';
const LABOURER_ID = 'labourer-1';

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    customer_id: CUSTOMER_ID,
    labourer_id: LABOURER_ID,
    status: 'pending',
    skill_needed: 'Plumbing',
    address: '12 Exact Street',
    location_lat: -33.92487,
    location_lng: 18.42406,
    notes: 'Gate code 1234',
    customer_phone: '+27820000000',
    labourer_phone: '+27830000000',
    current_lat: -33.91,
    current_lng: 18.41,
    location_updated_at: new Date().toISOString(),
    scheduled_at: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('privacy serializers', () => {
  test('public labourer search never exposes exact live coordinates', () => {
    const safe = serializeLabourerPublic({
      id: LABOURER_ID,
      user_id: LABOURER_ID,
      name: 'Labourer',
      hourly_rate: 120,
      current_lat: -33.92487,
      current_lng: 18.42406,
      location_updated_at: new Date().toISOString(),
      distance_km: '1.234',
    });

    expect(safe.current_lat).toBeUndefined();
    expect(safe.current_lng).toBeUndefined();
    expect(safe.approx_lat).toBe(-33.92);
    expect(safe.approx_lng).toBe(18.42);
    expect(safe.location_precision).toBe('approximate');
  });

  test('pending labourer booking view hides exact customer address, coordinates, notes, and phone', () => {
    const safe = serializeBookingForUser(booking(), { userId: LABOURER_ID });

    expect(safe.address).toBeUndefined();
    expect(safe.location_lat).toBeUndefined();
    expect(safe.location_lng).toBeUndefined();
    expect(safe.notes).toBeUndefined();
    expect(safe.customer_phone).toBeUndefined();
    expect(safe.approx_lat).toBe(-33.92);
    expect(safe.approx_lng).toBe(18.42);
  });

  test('accepted labourer booking view reveals exact customer job and contact fields', () => {
    const safe = serializeBookingForUser(booking({ status: 'accepted' }), { userId: LABOURER_ID });

    expect(safe.address).toBe('12 Exact Street');
    expect(safe.location_lat).toBe(-33.92487);
    expect(safe.location_lng).toBe(18.42406);
    expect(safe.notes).toBe('Gate code 1234');
    expect(safe.customer_phone).toBe('+27820000000');
    expect(safe.approx_lat).toBeUndefined();
  });

  test('customer booking view keeps entered address before labourer contact reveal', () => {
    const safe = serializeBookingForUser(booking(), { userId: CUSTOMER_ID });

    expect(safe.address).toBe('12 Exact Street');
    expect(safe.location_lat).toBe(-33.92487);
    expect(safe.location_lng).toBe(18.42406);
    expect(safe.notes).toBe('Gate code 1234');
    expect(safe.labourer_phone).toBeUndefined();
  });

  test('match serializers separate customer exact view from labourer approximate candidate view', () => {
    const match = {
      id: 'match-1',
      customer_id: CUSTOMER_ID,
      skill_needed: 'Plumbing',
      address: '12 Exact Street',
      location_lat: -33.92487,
      location_lng: 18.42406,
      notes: 'Gate code 1234',
      status: 'pending',
      scheduled_at: '2026-06-01T09:00:00.000Z',
    };

    const customer = serializeMatchForCustomer(match);
    const labourer = serializeMatchForLabourerCandidate(match);

    expect(customer.address).toBe('12 Exact Street');
    expect(customer.location_lat).toBe(-33.92487);
    expect(labourer.address).toBeUndefined();
    expect(labourer.location_lat).toBeUndefined();
    expect(labourer.notes).toBeUndefined();
    expect(labourer.approx_lat).toBe(-33.92);
    expect(labourer.location_precision).toBe('approximate');
  });
});
