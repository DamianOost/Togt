const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const matcher = require('../src/services/matcher');

const FUTURE_ISO = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function makeVerifiedLabourer(opts = {}) {
  const u = await registerUser({ role: 'labourer' });
  await db.query(
    `UPDATE labourer_profiles
       SET skills = $2::text[], hourly_rate = $3,
           is_available = $4, current_lat = $5, current_lng = $6,
           rating_avg = $7, rating_count = $8
       WHERE user_id = $1`,
    [u.user.id, opts.skills || ['Plumbing'], 150, true, -29.81, 31.0, 4.5, 5]
  );
  await db.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [u.user.id]);
  return u;
}

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM idempotency_keys');
  await db.query('DELETE FROM match_attempts');
  await db.query('DELETE FROM match_requests');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('Idempotency-Key on POST /api/match', () => {
  test('same key + same body returns identical cached response with Idempotent-Replay header', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const key = 'idem_test_' + Date.now();
    const body = {
      skill_needed: 'Plumbing', address: '1 Idem Ave',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    };

    const first = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    const firstId = first.body.match.id;
    expect(first.headers['idempotent-replay']).toBeUndefined();

    const second = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', key)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.match.id).toBe(firstId);          // same match returned
    expect(second.headers['idempotent-replay']).toBe('true');

    // Confirm only ONE match_requests row exists
    const rows = await db.query('SELECT id FROM match_requests WHERE customer_id = $1', [customer.user.id]);
    expect(rows.rows).toHaveLength(1);

    // Cleanup the in-flight match
    await request(app).post(`/api/match/${firstId}/cancel`).set(authHeader(customer.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });

  test('same key + different body returns 422 idempotency_key_reused', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const key = 'idem_diff_' + Date.now();

    const first = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', key)
      .send({
        skill_needed: 'Plumbing', address: '1 First',
        location_lat: -29.8, location_lng: 31.0,
        scheduled_at: FUTURE_ISO(), hours_est: 2,
      });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', key)
      .send({
        skill_needed: 'Plumbing', address: '2 DIFFERENT',  // different body
        location_lat: -29.8, location_lng: 31.0,
        scheduled_at: FUTURE_ISO(), hours_est: 4,
      });
    expect(second.status).toBe(422);
    expect(second.body.type).toContain('/errors/idempotency_key_reused');

    await request(app).post(`/api/match/${first.body.match.id}/cancel`).set(authHeader(customer.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });

  test('no Idempotency-Key header: handler runs as normal (backwards compat)', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const res = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .send({
        skill_needed: 'Plumbing', address: '1 NoKey',
        location_lat: -29.8, location_lng: 31.0,
        scheduled_at: FUTURE_ISO(), hours_est: 2,
      });
    expect(res.status).toBe(201);

    // No idempotency_keys row written
    const rows = await db.query('SELECT * FROM idempotency_keys WHERE user_id = $1', [customer.user.id]);
    expect(rows.rows).toHaveLength(0);

    await request(app).post(`/api/match/${res.body.match.id}/cancel`).set(authHeader(customer.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });

  test('keys are scoped per user — same key from a different customer is independent', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    await makeVerifiedLabourer();
    const c1 = await registerUser({ role: 'customer' });
    const c2 = await registerUser({ role: 'customer' });
    const sharedKey = 'shared-key-test-001';
    const body = {
      skill_needed: 'Plumbing', address: '1 Shared',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    };

    const r1 = await request(app).post('/api/match')
      .set(authHeader(c1.accessToken))
      .set('Idempotency-Key', sharedKey)
      .send(body);
    const r2 = await request(app).post('/api/match')
      .set(authHeader(c2.accessToken))
      .set('Idempotency-Key', sharedKey)
      .send(body);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.match.id).not.toBe(r2.body.match.id);

    await request(app).post(`/api/match/${r1.body.match.id}/cancel`).set(authHeader(c1.accessToken));
    await request(app).post(`/api/match/${r2.body.match.id}/cancel`).set(authHeader(c2.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });

  test('malformed Idempotency-Key (too short) -> 400', async () => {
    const customer = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/match')
      .set(authHeader(customer.accessToken))
      .set('Idempotency-Key', 'abc')
      .send({
        skill_needed: 'Plumbing', address: '1 Bad',
        location_lat: -29.8, location_lng: 31.0,
        scheduled_at: FUTURE_ISO(), hours_est: 2,
      });
    expect(res.status).toBe(400);
    expect(res.body.type).toContain('/errors/idempotency_key_invalid');
  });
});
