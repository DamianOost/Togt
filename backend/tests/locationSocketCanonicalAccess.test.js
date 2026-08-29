const db = require('../src/config/db');
const initLocationSockets = require('../src/sockets/location');

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const WORKER_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ID = '33333333-3333-4333-8333-333333333333';

function booking(overrides = {}) {
  return {
    id: BOOKING_ID,
    customer_id: CUSTOMER_ID,
    labourer_id: WORKER_ID,
    status: 'accepted',
    operational_phase: 'scheduled',
    route_access_granted_at: null,
    fulfilment_access_revoked_at: null,
    canonical_fulfilment_policy_present: true,
    location_lat: -33.9249,
    location_lng: 18.4241,
    ...overrides,
  };
}

function socketHarness(currentBooking) {
  const handlers = new Map();
  const roomEmit = jest.fn();
  let connect;
  const namespace = {
    use: jest.fn(),
    on: jest.fn((event, handler) => {
      if (event === 'connection') connect = handler;
    }),
    to: jest.fn(() => ({ emit: roomEmit })),
  };
  initLocationSockets({ of: jest.fn(() => namespace) });
  const socket = {
    user: { id: WORKER_ID, role: 'labourer' },
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn((event, handler) => handlers.set(event, handler)),
  };
  connect(socket);

  const query = jest.spyOn(db, 'query').mockImplementation(async (sql) => {
    if (String(sql).includes('SELECT b.*')) return { rows: [currentBooking()] };
    if (String(sql).includes('UPDATE labourer_profiles')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected location socket query: ${sql}`);
  });

  return { handlers, namespace, query, roomEmit, socket };
}

function wroteWorkerLocation(query) {
  return query.mock.calls.some(([sql]) => String(sql).includes('UPDATE labourer_profiles'));
}

describe('canonical location socket access', () => {
  afterEach(() => jest.restoreAllMocks());

  test('scheduled canonical projects cannot join or publish location', async () => {
    const state = booking({
      // A stale/mistaken grant is insufficient outside an operational route phase.
      route_access_granted_at: new Date('2026-08-30T08:00:00Z'),
    });
    const harness = socketHarness(() => state);

    await harness.handlers.get('join:booking')(BOOKING_ID);
    await harness.handlers.get('location:update')({ bookingId: BOOKING_ID, lat: -33.93, lng: 18.43 });

    expect(harness.socket.join).not.toHaveBeenCalled();
    expect(harness.socket.leave).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);
    expect(wroteWorkerLocation(harness.query)).toBe(false);
    expect(harness.roomEmit).not.toHaveBeenCalled();
  });

  test('en-route canonical projects with an active grant can join and publish location', async () => {
    const state = booking({
      operational_phase: 'en_route',
      route_access_granted_at: new Date('2026-08-30T08:00:00Z'),
    });
    const harness = socketHarness(() => state);

    await harness.handlers.get('join:booking')(BOOKING_ID);
    await harness.handlers.get('location:update')({ bookingId: BOOKING_ID, lat: -33.93, lng: 18.43 });

    expect(harness.socket.join).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);
    expect(wroteWorkerLocation(harness.query)).toBe(true);
    expect(harness.namespace.to).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);
    expect(harness.roomEmit).toHaveBeenCalledWith('worker_location', expect.objectContaining({
      bookingId: BOOKING_ID,
      labourerId: WORKER_ID,
    }));
  });

  test('revocation after a successful join blocks the next update and removes the socket', async () => {
    let state = booking({
      operational_phase: 'en_route',
      route_access_granted_at: new Date('2026-08-30T08:00:00Z'),
    });
    const harness = socketHarness(() => state);
    await harness.handlers.get('join:booking')(BOOKING_ID);
    expect(harness.socket.join).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);

    state = booking({
      operational_phase: 'en_route',
      route_access_granted_at: new Date('2026-08-30T08:00:00Z'),
      fulfilment_access_revoked_at: new Date('2026-08-30T08:05:00Z'),
    });
    await harness.handlers.get('location:update')({ bookingId: BOOKING_ID, lat: -33.93, lng: 18.43 });

    expect(harness.socket.leave).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);
    expect(wroteWorkerLocation(harness.query)).toBe(false);
    expect(harness.roomEmit).not.toHaveBeenCalled();
  });

  test('genuine legacy accepted bookings retain status-only live-location behavior', async () => {
    const state = booking({
      canonical_fulfilment_policy_present: false,
      operational_phase: null,
    });
    const harness = socketHarness(() => state);

    await harness.handlers.get('join:booking')(BOOKING_ID);
    await harness.handlers.get('location:update')({ bookingId: BOOKING_ID, lat: -33.93, lng: 18.43 });

    expect(harness.socket.join).toHaveBeenCalledWith(`booking:${BOOKING_ID}`);
    expect(wroteWorkerLocation(harness.query)).toBe(true);
    expect(harness.roomEmit).toHaveBeenCalledWith('worker_location', expect.any(Object));
  });
});
