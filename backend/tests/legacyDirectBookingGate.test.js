const { legacyDirectBookingCreationEnabled } = require('../src/config/legacyCompatibility');
const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

let originalGate;

beforeEach(async () => {
  await truncateAll();
  originalGate = process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED;
  process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = 'false';
});

afterEach(() => {
  if (originalGate === undefined) delete process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED;
  else process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = originalGate;
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('legacy direct booking creation gate', () => {
  test('only the exact reviewed compatibility value enables the retired route', () => {
    expect(legacyDirectBookingCreationEnabled({})).toBe(false);
    expect(legacyDirectBookingCreationEnabled({ LEGACY_DIRECT_BOOKING_CREATION_ENABLED: 'false' })).toBe(false);
    expect(legacyDirectBookingCreationEnabled({ LEGACY_DIRECT_BOOKING_CREATION_ENABLED: 'TRUE' })).toBe(false);
    expect(legacyDirectBookingCreationEnabled({ LEGACY_DIRECT_BOOKING_CREATION_ENABLED: '1' })).toBe(false);
    expect(legacyDirectBookingCreationEnabled({ LEGACY_DIRECT_BOOKING_CREATION_ENABLED: 'true' })).toBe(true);
  });

  test('default-off gate rejects before idempotency, booking, money or event mutation', async () => {
    const customer = await registerUser({ role: 'customer' });
    const worker = await registerUser({ role: 'labourer' });
    await db.query(
      'UPDATE labourer_profiles SET is_available = false, hourly_rate = 999999 WHERE user_id = $1',
      [worker.user.id]
    );
    const before = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM bookings) AS bookings,
         (SELECT COUNT(*)::int FROM idempotency_keys) AS idempotency_keys,
         (SELECT COUNT(*)::int FROM webhook_deliveries) AS webhook_deliveries`
    );

    const response = await request(app)
      .post('/api/bookings')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', 'legacy-direct-disabled-001')
      .send({
        labourer_id: worker.user.id,
        skill_needed: 'Unvalidated direct request',
        address: '1 Private Road',
        location_lat: -33.9249,
        location_lng: 18.4241,
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        hours_est: 'not-a-number',
      });

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.type).toMatch(/\/errors\/legacy_direct_booking_creation_unavailable$/);
    expect(response.body.extensions.canonicalPaths).toEqual(['/api/quote-requests', '/api/match']);
    const after = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM bookings) AS bookings,
         (SELECT COUNT(*)::int FROM idempotency_keys) AS idempotency_keys,
         (SELECT COUNT(*)::int FROM webhook_deliveries) AS webhook_deliveries`
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
