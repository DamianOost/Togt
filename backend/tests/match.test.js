const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const matcher = require('../src/services/matcher');

const VALID_ID = '9001049818080';
const FUTURE_ISO = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function makeVerifiedLabourer(opts = {}) {
  const u = await registerUser({ role: 'labourer' });
  await db.query(
    `UPDATE labourer_profiles
       SET skills = $2::text[], hourly_rate = $3,
           is_available = $4, current_lat = $5, current_lng = $6,
           rating_avg = $7, rating_count = $8
       WHERE user_id = $1`,
    [
      u.user.id,
      opts.skills || ['Plumbing'],
      opts.hourly_rate || 150,
      opts.is_available !== false,
      opts.lat ?? -29.8,
      opts.lng ?? 31.0,
      opts.rating_avg || 4.5,
      opts.rating_count || 5,
    ]
  );
  await db.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [u.user.id]);
  return u;
}

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM match_attempts');
  await db.query('DELETE FROM match_requests');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('matcher.selectCandidates', () => {
  test('returns only verified, available, skill-matching labourers within radius', async () => {
    const wrongSkill = await makeVerifiedLabourer({ skills: ['Painting'], lat: -29.81, lng: 31.0 });
    const offDuty = await makeVerifiedLabourer({ skills: ['Plumbing'], is_available: false, lat: -29.81, lng: 31.0 });
    const tooFar = await makeVerifiedLabourer({ skills: ['Plumbing'], lat: -25.0, lng: 28.0 }); // ~600km
    const goodOne = await makeVerifiedLabourer({ skills: ['Plumbing'], lat: -29.81, lng: 31.0 });
    // Unverified — should be skipped
    const unverified = await makeVerifiedLabourer({ skills: ['Plumbing'], lat: -29.81, lng: 31.0 });
    await db.query(`UPDATE users SET kyc_status = 'unverified' WHERE id = $1`, [unverified.user.id]);

    const candidates = await matcher.selectCandidates({
      skill: 'Plumbing',
      lat: -29.8,
      lng: 31.0,
      radiusKm: 50,
      limit: 5,
    });

    const ids = candidates.map((c) => c.user_id);
    expect(ids).toContain(goodOne.user.id);
    expect(ids).not.toContain(wrongSkill.user.id);
    expect(ids).not.toContain(offDuty.user.id);
    expect(ids).not.toContain(tooFar.user.id);
    expect(ids).not.toContain(unverified.user.id);
  });

  test('orders by rating desc then distance asc', async () => {
    const farHighRating = await makeVerifiedLabourer({ rating_avg: 5.0, lat: -29.85, lng: 31.05 });
    const closeLowRating = await makeVerifiedLabourer({ rating_avg: 3.0, lat: -29.81, lng: 31.0 });
    const closeHighRating = await makeVerifiedLabourer({ rating_avg: 5.0, lat: -29.805, lng: 31.005 });

    const candidates = await matcher.selectCandidates({
      skill: 'Plumbing', lat: -29.8, lng: 31.0, radiusKm: 50, limit: 5,
    });

    expect(candidates[0].user_id).toBe(closeHighRating.user.id);
    // farHighRating (5.0) before closeLowRating (3.0)
    expect(candidates[1].user_id).toBe(farHighRating.user.id);
    expect(candidates[2].user_id).toBe(closeLowRating.user.id);
  });
});

describe('POST /api/match', () => {
  test('rejects past scheduled_at with 400', async () => {
    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: '2020-01-01T00:00:00Z',
      hours_est: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduled_at|future/i);
  });

  test('labourer cannot create matches (only customers)', async () => {
    const labourer = await makeVerifiedLabourer();
    const res = await request(app).post('/api/match').set(authHeader(labourer.accessToken)).send({
      skill_needed: 'Plumbing', address: 'x',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 1,
    });
    expect(res.status).toBe(403);
  });

  test('no candidates available -> match expires immediately with no_candidates reason', async () => {
    // No labourers at all
    const customer = await registerUser({ role: 'customer' });
    const res = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    expect(res.status).toBe(201);
    const matchId = res.body.match.id;

    // Wait briefly for dispatcher
    await new Promise((r) => setTimeout(r, 200));

    const row = await db.query(
      'SELECT status, expire_reason FROM match_requests WHERE id = $1',
      [matchId]
    );
    expect(row.rows[0].status).toBe('expired');
    expect(row.rows[0].expire_reason).toBe('no_candidates');
  });

  test('candidate accept transitions match -> matched + creates a booking', async () => {
    // Speed: configure ping timeout to 1s for this test
    matcher.__setPingTimeoutForTesting(1000);

    const labourer = await makeVerifiedLabourer({ lat: -29.81, lng: 31.0 });
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    expect(create.status).toBe(201);
    const matchId = create.body.match.id;

    // Wait a tick for the first ping to be fired
    await new Promise((r) => setTimeout(r, 100));

    // Labourer accepts
    const accept = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(accept.status).toBe(200);
    expect(accept.body.booking).toBeDefined();
    expect(accept.body.booking.labourer_id).toBe(labourer.user.id);
    expect(accept.body.booking.customer_id).toBe(customer.user.id);
    expect(accept.body.booking.status).toBe('accepted');

    const row = await db.query(
      'SELECT status, matched_booking_id, matched_labourer_id FROM match_requests WHERE id = $1',
      [matchId]
    );
    expect(row.rows[0].status).toBe('matched');
    expect(row.rows[0].matched_labourer_id).toBe(labourer.user.id);
    expect(row.rows[0].matched_booking_id).toBe(accept.body.booking.id);

    matcher.__resetPingTimeoutForTesting();
  });

  test('decline cascades to next candidate; if all decline, match expires all_declined', async () => {
    matcher.__setPingTimeoutForTesting(2000);

    const l1 = await makeVerifiedLabourer({ lat: -29.805, lng: 31.0, rating_avg: 5 });
    const l2 = await makeVerifiedLabourer({ lat: -29.81, lng: 31.0, rating_avg: 4 });
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    const matchId = create.body.match.id;

    await new Promise((r) => setTimeout(r, 100)); // first ping fires

    const decline1 = await request(app).post(`/api/match/${matchId}/decline`).set(authHeader(l1.accessToken));
    expect(decline1.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100)); // second ping fires

    const decline2 = await request(app).post(`/api/match/${matchId}/decline`).set(authHeader(l2.accessToken));
    expect(decline2.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    const row = await db.query(
      'SELECT status, expire_reason FROM match_requests WHERE id = $1',
      [matchId]
    );
    expect(row.rows[0].status).toBe('expired');
    expect(row.rows[0].expire_reason).toBe('all_declined');

    matcher.__resetPingTimeoutForTesting();
  });

  test('customer cancel mid-match -> status=cancelled, dispatcher stops', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    const matchId = create.body.match.id;

    await new Promise((r) => setTimeout(r, 100));

    const cancel = await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));
    expect(cancel.status).toBe(200);

    const row = await db.query('SELECT status FROM match_requests WHERE id = $1', [matchId]);
    expect(row.rows[0].status).toBe('cancelled');

    matcher.__resetPingTimeoutForTesting();
  });

  test('GET /api/match/:id returns full state with active attempt', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    const matchId = create.body.match.id;

    await new Promise((r) => setTimeout(r, 100));

    const get = await request(app).get(`/api/match/${matchId}`).set(authHeader(customer.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.match.id).toBe(matchId);
    expect(get.body.match.status).toBe('pending');
    expect(get.body.attempts.length).toBeGreaterThanOrEqual(1);
    expect(get.body.attempts[0].labourer_id).toBe(labourer.user.id);
    expect(get.body.attempts[0].status).toBe('pinged');

    // Cancel to clean up the dispatcher
    await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });

  test('a non-pinged labourer cannot accept the match (403)', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const pinged = await makeVerifiedLabourer({ lat: -29.805, lng: 31.0, rating_avg: 5 });
    const stranger = await makeVerifiedLabourer({ lat: -25.0, lng: 28.0, rating_avg: 5 }); // outside radius
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    const matchId = create.body.match.id;
    await new Promise((r) => setTimeout(r, 100));

    const res = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(stranger.accessToken));
    expect(res.status).toBe(403);

    await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));
    matcher.__resetPingTimeoutForTesting();
  });
});

// ─── Reviewer-flagged race conditions ──────────────────────────────────────

describe('reviewer-flagged race conditions', () => {
  test('accept after attempt was timed out -> 403 (no active ping)', async () => {
    matcher.__setPingTimeoutForTesting(150);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;

    await new Promise((r) => setTimeout(r, 350));

    const res = await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(labourer.accessToken));
    expect(res.status).toBe(403);

    matcher.__resetPingTimeoutForTesting();
  });

  test('accept after customer cancelled -> 403', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await new Promise((r) => setTimeout(r, 100));

    await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));

    const res = await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(labourer.accessToken));
    expect(res.status).toBe(403);

    matcher.__resetPingTimeoutForTesting();
  });

  test('cancel after accept -> 409 already_matched with booking_id', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await new Promise((r) => setTimeout(r, 100));

    const accept = await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(labourer.accessToken));
    expect(accept.status).toBe(200);

    const cancel = await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));
    expect(cancel.status).toBe(409);
    expect(cancel.body.error).toBe('already_matched');
    expect(cancel.body.booking_id).toBe(accept.body.booking.id);

    matcher.__resetPingTimeoutForTesting();
  });

  test('timeout cascade: candidate A times out, candidate B accepts', async () => {
    matcher.__setPingTimeoutForTesting(200);

    const lA = await makeVerifiedLabourer({ rating_avg: 5.0, lat: -29.805, lng: 31.0 });
    const lB = await makeVerifiedLabourer({ rating_avg: 4.5, lat: -29.81, lng: 31.0 });
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;

    await new Promise((r) => setTimeout(r, 350));

    const accept = await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(lB.accessToken));
    expect(accept.status).toBe(200);
    expect(accept.body.booking.labourer_id).toBe(lB.user.id);

    matcher.__resetPingTimeoutForTesting();
  });

  test('pending Map drains: after accept, matcher.__pendingSize() is 0', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await new Promise((r) => setTimeout(r, 100));

    expect(matcher.__pendingSize()).toBeGreaterThan(0);

    await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(labourer.accessToken));
    await new Promise((r) => setTimeout(r, 100));

    expect(matcher.__pendingSize()).toBe(0);

    matcher.__resetPingTimeoutForTesting();
  });
});

describe('matcher.sweepStalePending', () => {
  test('expires stranded pending matches with reason=server_restart', async () => {
    const customer = await registerUser({ role: 'customer' });
    const r = await db.query(
      `INSERT INTO match_requests
         (customer_id, skill_needed, address, location_lat, location_lng,
          scheduled_at, hours_est, expires_at)
       VALUES ($1, 'Plumbing', '1 Stranded Rd', -29.8, 31.0,
               NOW() + INTERVAL '1 hour', 2, NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [customer.user.id]
    );
    const stranded = r.rows[0].id;

    const swept = await matcher.sweepStalePending();
    expect(swept).toBeGreaterThanOrEqual(1);

    const after = await db.query('SELECT status, expire_reason FROM match_requests WHERE id = $1', [stranded]);
    expect(after.rows[0].status).toBe('expired');
    expect(after.rows[0].expire_reason).toBe('server_restart');
  });
});
