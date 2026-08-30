jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

jest.mock('../src/services/matcher', () => ({
  selectCandidates: jest.fn(),
  loadMatch: jest.fn(),
  dispatchMatch: jest.fn(),
  cancelByCustomer: jest.fn(),
  expireMatch: jest.fn(),
}));

const db = require('../src/config/db');
const matcher = require('../src/services/matcher');
const {
  callTool,
  serializeMcpLabourerCandidate,
  serializeMcpBooking,
  serializeMcpMatch,
} = require('../mcp-server/tools');

const CUSTOMER_ID = 'customer-1';
const LABOURER_ID = 'labourer-1';
const ctx = (userId, scopes = ['mcp:read_only']) => ({ userId, scopes });

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
    scheduled_at: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MCP privacy serialization', () => {
  test('create_match_request records permitted unsafe audit provenance', async () => {
    db.query.mockResolvedValue({ rows: [{
      id: 'match-1',
      status: 'pending',
      expires_at: '2026-06-01T10:00:00.000Z',
    }] });
    const scheduled = new Date(Date.now() + 60_000).toISOString();

    const result = await callTool(ctx(CUSTOMER_ID, ['mcp:full']), 'create_match_request', {
      skill_needed: 'Plumbing',
      address: '12 Exact Street',
      location_lat: -33.92487,
      location_lng: 18.42406,
      coordinate_source: 'entered_coordinates',
      scheduled_at: scheduled,
    });

    expect(result.match_id).toBe('match-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('coordinate_source'),
      expect.arrayContaining(['entered_coordinates'])
    );
    expect(matcher.dispatchMatch).toHaveBeenCalledWith('match-1');
  });

  test('create_match_request cannot manufacture map-pin or server-issued provenance', async () => {
    const base = {
      skill_needed: 'Plumbing',
      address: '12 Exact Street',
      location_lat: -33.92487,
      location_lng: 18.42406,
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    };
    for (const coordinate_source of ['map_pin', 'saved_verified_place', 'provider_geocode']) {
      await expect(callTool(ctx(CUSTOMER_ID, ['mcp:full']), 'create_match_request', {
        ...base,
        coordinate_source,
      })).rejects.toThrow(/not permitted|server reserved/i);
    }
    await expect(callTool(ctx(CUSTOMER_ID, ['mcp:full']), 'create_match_request', {
      ...base,
      location_lat: -91,
      coordinate_source: 'device_gps',
    })).rejects.toThrow('Address coordinates are invalid');
    expect(db.query).not.toHaveBeenCalled();
    expect(matcher.dispatchMatch).not.toHaveBeenCalled();
  });

  test('serializeMcpLabourerCandidate emits approximate location without exact current coordinates', () => {
    const safe = serializeMcpLabourerCandidate({
      user_id: LABOURER_ID,
      name: 'Labourer',
      hourly_rate: '150',
      rating_avg: '4.5',
      rating_count: '8',
      current_lat: -33.92487,
      current_lng: 18.42406,
      location_updated_at: new Date().toISOString(),
      distance_km: '2.345',
    });

    expect(safe.current_lat).toBeUndefined();
    expect(safe.current_lng).toBeUndefined();
    expect(safe.approx_lat).toBe(-33.92);
    expect(safe.approx_lng).toBe(18.42);
    expect(safe.distance_km).toBe('2.35');
  });

  test('find_labourers tool does not leak exact current_lat/current_lng', async () => {
    matcher.selectCandidates.mockResolvedValue([{
      user_id: LABOURER_ID,
      name: 'Labourer',
      hourly_rate: 150,
      rating_avg: 5,
      rating_count: 2,
      current_lat: -33.92487,
      current_lng: 18.42406,
      location_updated_at: new Date().toISOString(),
      distance_km: 1.2,
    }]);

    const result = await callTool(ctx(CUSTOMER_ID), 'find_labourers', {
      skill: 'Plumbing',
      lat: -33.9,
      lng: 18.4,
    });

    expect(result[0].current_lat).toBeUndefined();
    expect(result[0].current_lng).toBeUndefined();
    expect(result[0].approx_lat).toBe(-33.92);
    expect(result[0].approx_lng).toBe(18.42);
  });

  test('list_my_bookings serializes pending labourer rows without exact customer data', async () => {
    db.query.mockResolvedValue({ rows: [booking()] });

    const result = await callTool(ctx(LABOURER_ID), 'list_my_bookings', {});

    expect(result.bookings[0].address).toBeUndefined();
    expect(result.bookings[0].location_lat).toBeUndefined();
    expect(result.bookings[0].location_lng).toBeUndefined();
    expect(result.bookings[0].customer_phone).toBeUndefined();
    expect(result.bookings[0].approx_lat).toBe(-33.92);
  });

  test('get_booking serializes accepted labourer rows with exact customer data', async () => {
    db.query.mockResolvedValue({ rows: [booking({ status: 'accepted' })] });

    const result = await callTool(ctx(LABOURER_ID), 'get_booking', { booking_id: 'booking-1' });

    expect(result.booking.address).toBe('12 Exact Street');
    expect(result.booking.location_lat).toBe(-33.92487);
    expect(result.booking.customer_phone).toBe('+27820000000');
  });

  test('get_match_request lets pinged labourer read only approximate match location and own attempt', async () => {
    matcher.loadMatch.mockResolvedValue({
      id: 'match-1',
      customer_id: CUSTOMER_ID,
      skill_needed: 'Plumbing',
      address: '12 Exact Street',
      location_lat: -33.92487,
      location_lng: 18.42406,
      notes: 'Gate code 1234',
      status: 'pending',
      scheduled_at: '2026-06-01T09:00:00.000Z',
    });
    db.query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'attempt-1', labourer_id: LABOURER_ID, status: 'pinged' },
          { id: 'attempt-2', labourer_id: 'other-labourer', status: 'pinged' },
        ],
      });

    const result = await callTool(ctx(LABOURER_ID), 'get_match_request', { match_id: 'match-1' });

    expect(result.match.address).toBeUndefined();
    expect(result.match.location_lat).toBeUndefined();
    expect(result.match.notes).toBeUndefined();
    expect(result.match.approx_lat).toBe(-33.92);
    expect(result.attempts).toEqual([{ id: 'attempt-1', labourer_id: LABOURER_ID, status: 'pinged' }]);
  });

  test('MCP helper keeps customers exact match view for their own request', () => {
    const safe = serializeMcpMatch({
      id: 'match-1',
      customer_id: CUSTOMER_ID,
      skill_needed: 'Plumbing',
      address: '12 Exact Street',
      location_lat: -33.92487,
      location_lng: 18.42406,
      notes: 'Gate code 1234',
    }, ctx(CUSTOMER_ID));

    expect(safe.address).toBe('12 Exact Street');
    expect(safe.location_lat).toBe(-33.92487);
    expect(safe.notes).toBe('Gate code 1234');
  });

  test('MCP helper hides pending labourer booking exact fields', () => {
    const safe = serializeMcpBooking(booking(), ctx(LABOURER_ID));

    expect(safe.address).toBeUndefined();
    expect(safe.customer_phone).toBeUndefined();
    expect(safe.approx_lng).toBe(18.42);
  });

  test('MCP helper requires non-revoked route access for canonical accepted bookings', () => {
    const canonical = booking({
      status: 'accepted',
      canonical_fulfilment_policy_present: true,
    });
    const scheduled = serializeMcpBooking(canonical, ctx(LABOURER_ID));
    expect(scheduled.address).toBeUndefined();
    expect(scheduled.customer_phone).toBeUndefined();

    const enRoute = serializeMcpBooking({
      ...canonical,
      operational_phase: 'en_route',
      route_access_granted_at: new Date().toISOString(),
    }, ctx(LABOURER_ID));
    expect(enRoute.address).toBe('12 Exact Street');
    expect(enRoute.customer_phone).toBe('+27820000000');

    const revoked = serializeMcpBooking({
      ...canonical,
      operational_phase: 'en_route',
      route_access_granted_at: new Date().toISOString(),
      fulfilment_access_revoked_at: new Date().toISOString(),
    }, ctx(LABOURER_ID));
    expect(revoked.address).toBeUndefined();
    expect(revoked.customer_phone).toBeUndefined();
  });
});
