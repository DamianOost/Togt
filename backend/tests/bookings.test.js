const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
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
        scheduled_at: future,
        hours_est: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('pending');
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
