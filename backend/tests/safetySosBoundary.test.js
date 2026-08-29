const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const { hasSafetyHold } = require('../src/services/groundedProjects/store');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function createBookingFixture() {
  const customer = await registerUser({ role: 'customer', name: 'Safety Customer' });
  const worker = await registerUser({ role: 'labourer', name: 'Safety Worker' });
  const outsider = await registerUser({ role: 'customer', name: 'Safety Outsider' });
  const bookingResult = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, skill_needed, address,
       location_lat, location_lng, scheduled_at, hours_est, total_amount
     ) VALUES ($1, $2, 'in_progress', 'Plumbing', 'Private address',
               -33.9, 18.4, NOW() + INTERVAL '1 day', 2, 850)
     RETURNING id`,
    [customer.user.id, worker.user.id]
  );
  return { customer, worker, outsider, bookingId: bookingResult.rows[0].id };
}

async function sosCount() {
  const result = await db.query('SELECT COUNT(*)::int AS count FROM sos_events');
  return result.rows[0].count;
}

describe('POST /api/safety/sos authorization and validation boundary', () => {
  test('requires authentication and does not create a safety event', async () => {
    const missing = await request(app)
      .post('/api/safety/sos')
      .send({ lat: -33.9, lng: 18.4 });
    expect(missing.status).toBe(401);

    const invalid = await request(app)
      .post('/api/safety/sos')
      .set('Authorization', 'Bearer invalid-token')
      .send({ lat: -33.9, lng: 18.4 });
    expect(invalid.status).toBe(401);
    expect(await sosCount()).toBe(0);
  });

  test('returns the same private 404 for an outsider and a nonexistent booking, with no row', async () => {
    const fixture = await createBookingFixture();
    const outsider = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(fixture.outsider.accessToken))
      .send({ booking_id: fixture.bookingId, lat: -33.9, lng: 18.4 });

    const nonexistent = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(fixture.outsider.accessToken))
      .send({ booking_id: '00000000-0000-0000-0000-000000000001', lat: -33.9, lng: 18.4 });

    for (const response of [outsider, nonexistent]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        title: 'Booking not found',
        status: 404,
      });
      expect(response.body.type).toMatch(/sos_booking_not_found$/);
    }
    expect(await sosCount()).toBe(0);
  });

  test('allows both booking participants, preserves zero coordinates, and creates hold evidence', async () => {
    const fixture = await createBookingFixture();
    const customer = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(fixture.customer.accessToken))
      .send({ booking_id: fixture.bookingId, lat: 0, lng: 0 });
    const worker = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(fixture.worker.accessToken))
      .send({ booking_id: fixture.bookingId });

    for (const response of [customer, worker]) {
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        received: true,
        operations_alerted: false,
        emergency_services_dispatched: false,
      });
      expect(response.body.message).toMatch(/did not dispatch/i);
    }

    const rows = await db.query(
      `SELECT user_id, booking_id, lat, lng
         FROM sos_events
        WHERE booking_id = $1
        ORDER BY created_at, id`,
      [fixture.bookingId]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.user_id).sort()).toEqual(
      [fixture.customer.user.id, fixture.worker.user.id].sort()
    );
    const customerRow = rows.rows.find((row) => row.user_id === fixture.customer.user.id);
    expect(customerRow).toMatchObject({ booking_id: fixture.bookingId, lat: 0, lng: 0 });
    expect(await hasSafetyHold(db, fixture.bookingId)).toBe(true);
  });

  test('keeps the documented booking-less safety-record path truthful', async () => {
    const customer = await registerUser({ role: 'customer' });
    const response = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(customer.accessToken))
      .send({ lat: -33.9, lng: 18.4 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      received: true,
      operations_alerted: false,
      emergency_services_dispatched: false,
    });
    const rows = await db.query(
      'SELECT user_id, booking_id, lat, lng FROM sos_events WHERE user_id = $1',
      [customer.user.id]
    );
    expect(rows.rows).toEqual([{
      user_id: customer.user.id,
      booking_id: null,
      lat: -33.9,
      lng: 18.4,
    }]);
  });

  test('rejects non-object, unknown, malformed UUID and invalid coordinate payloads without a row', async () => {
    const customer = await registerUser({ role: 'customer' });
    const invalidBodies = [
      [],
      { unexpected: true },
      { booking_id: 'not-a-uuid' },
      { booking_id: null },
      { lat: -33.9 },
      { lat: '-33.9', lng: 18.4 },
      { lat: 91, lng: 18.4 },
      { lat: -33.9, lng: 181 },
      { lat: null, lng: 18.4 },
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post('/api/safety/sos')
        .set(authHeader(customer.accessToken))
        .send(body);
      expect(response.status).toBe(422);
      expect(response.body.type).toMatch(/sos_payload_invalid$/);
    }
    expect(await sosCount()).toBe(0);
  });
});
