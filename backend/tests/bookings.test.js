const originalLegacyDirectBookingGate = process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED;
process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = 'true';

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (originalLegacyDirectBookingGate === undefined) delete process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED;
  else process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = originalLegacyDirectBookingGate;
  if (db.end) await db.end();
});

async function makeCustomerAndLabourer() {
  const customer = await registerUser({ role: 'customer' });
  const labourer = await registerUser({ role: 'labourer' });
  return { customer, labourer };
}

describe('POST /bookings scheduled_at validation', () => {
  test('rejects past scheduled_at with 400', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '123 Test Rd',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: past,
        hours_est: 2,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });

  test('accepts future scheduled_at with 201', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '123 Test Rd',
        location_lat: -29.8,
        location_lng: 31.0,
        coordinate_source: 'device_gps',
        scheduled_at: future,
        hours_est: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('pending');
    const stored = await db.query('SELECT coordinate_source FROM bookings WHERE id = $1', [res.body.booking.id]);
    expect(stored.rows[0].coordinate_source).toBe('device_gps');
  });

  test('keeps legacy NULL explicit and rejects manufactured verified provenance', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const legacy = await request(app)
      .post('/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '123 Test Rd',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: future,
      });
    expect(legacy.status).toBe(201);
    const storedLegacy = await db.query(
      'SELECT coordinate_source FROM bookings WHERE id = $1',
      [legacy.body.booking.id]
    );
    expect(storedLegacy.rows[0].coordinate_source).toBeNull();

    for (const coordinate_source of ['map_pin', 'saved_verified_place', 'provider_geocode']) {
      const rejected = await request(app)
        .post('/bookings')
        .set(authHeader(customer.accessToken))
        .send({
          labourer_id: labourer.user.id,
          skill_needed: 'Plumbing',
          address: '123 Test Rd',
          location_lat: -29.8,
          location_lng: 31.0,
          coordinate_source,
          scheduled_at: future,
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.type).toMatch(/coordinate_source_(?:not_permitted|server_reserved)$/);
    }
  });

  test('rejects non-finite or out-of-range direct-booking coordinates before mutation', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const rejected = await request(app)
      .post('/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '123 Test Rd',
        location_lat: -29.8,
        location_lng: 181,
        coordinate_source: 'entered_coordinates',
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.type).toMatch(/address_coordinates_invalid$/);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count).toBe(0);
  });

  test('rejects invalid scheduled_at string with 400', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const res = await request(app)
      .post('/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '123 Test Rd',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: 'not-a-date',
        hours_est: 2,
      });
    expect(res.status).toBe(400);
  });

  test('DB trigger also rejects past scheduled_at on direct INSERT', async () => {
    const { customer, labourer } = await makeCustomerAndLabourer();
    const pastIso = new Date(Date.now() - 3600_000).toISOString();
    await expect(
      db.query(
        `INSERT INTO bookings
           (customer_id, labourer_id, skill_needed, address,
            location_lat, location_lng, scheduled_at, hours_est, total_amount, status)
         VALUES ($1, $2, 'Plumbing', '1 Direct Lane', -29.8, 31.0, $3, 1, 100, 'pending')`,
        [customer.user.id, labourer.user.id, pastIso]
      )
    ).rejects.toThrow(/scheduled_at must be in the future/);
  });
});
