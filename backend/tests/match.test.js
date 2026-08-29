process.env.WORKER_FOREGROUND_LOCATION_EXPLANATION_VERSION = 'match-test-foreground-v1';
process.env.WORKER_SAFETY_POLICY_VERSION = 'match-test-safety-v1';
process.env.WORKER_FIRST_JOB_READINESS_VERSION = 'match-test-readiness-v1';
process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = 'true';
process.env.GROUNDED_FULFILMENT_POLICY_VERSION = 'match-test-fulfilment-v1';
process.env.GROUNDED_FULFILMENT_ROUTE_REVEAL_LEAD_MINUTES = '60';
process.env.GROUNDED_FULFILMENT_ARRIVAL_EVIDENCE_MODE = 'worker_attestation';
process.env.GROUNDED_FULFILMENT_NO_SHOW_GRACE_MINUTES = '15';
process.env.GROUNDED_FULFILMENT_START_PIN_TTL_MINUTES = '60';
process.env.GROUNDED_FULFILMENT_START_PIN_MAX_ATTEMPTS = '3';
process.env.GROUNDED_FULFILMENT_RESCHEDULE_EXPIRY_MINUTES = '120';
process.env.GROUNDED_FULFILMENT_CHANGE_ORDER_EXPIRY_MINUTES = '120';
const originalPublicProfileImageOrigin = process.env.PUBLIC_PROFILE_IMAGE_ORIGIN;
process.env.PUBLIC_PROFILE_IMAGE_ORIGIN = 'https://images.example.test';

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const matcher = require('../src/services/matcher');

const VALID_ID = '9001049818080';
const MATCH_SERVICE_ID = '77777777-7777-4777-8777-777777777777';
const FUTURE_ISO = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function seedMatchService() {
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key,
       label_en_za, description_en_za, pricing_mode, fulfilment_mode,
       risk_tier, required_question_ids, brief_schema, pricing_rules,
       materials_rules, change_order_rules, cancellation_policy_version,
       worker_eligibility, is_published, published_at
     ) VALUES (
       $1, 1, 'match_test_plumbing', 'home_repairs', 'Plumbing',
       'Canonical plumbing fixture for matcher acceptance tests.',
       'remote_quote', 'receive_quotes', 'standard', '{}',
       '{"questions":[]}'::jsonb, '{"finalPrice":"accepted_quote_only"}'::jsonb,
       '{}'::jsonb, '{}'::jsonb, 'match-test-v1', '{}'::jsonb, true, NOW()
     )
     ON CONFLICT (service_id, service_version) DO NOTHING`,
    [MATCH_SERVICE_ID]
  );
}

async function seedCanonicalActivation(workerId) {
  await seedMatchService();
  await db.query(
    `UPDATE users
        SET is_verified = true,
            kyc_status = 'verified',
            avatar_url = 'https://images.example.test/match-worker.jpg',
            emergency_contact = '0840000000'
      WHERE id = $1`,
    [workerId]
  );
  await db.query(
    `INSERT INTO kyc_verifications (
       user_id, id_number, status, provider, verified_name, verified_at
     ) VALUES ($1, $2, 'verified', 'verifynow', 'Match Worker', NOW())`,
    [workerId, VALID_ID]
  );
  await db.query(
    `INSERT INTO grounded_worker_public_profiles (
       worker_id, public_display_name, about_experience
     ) VALUES ($1, 'Match Worker', 'Experienced household plumbing and repair professional.')`,
    [workerId]
  );
  await db.query(
    `INSERT INTO grounded_worker_service_offerings (
       worker_id, service_id, service_version, customer_facing_title,
       description, service_area_label
     ) VALUES (
       $1, $2, 1, 'Plumbing',
       'Experienced household plumbing and repair professional.',
       'Durban service area'
     )`,
    [workerId, MATCH_SERVICE_ID]
  );
  await db.query(
    `INSERT INTO catalogue_worker_opt_ins (
       worker_id, service_id, service_version, status
     ) VALUES ($1, $2, 1, 'active')`,
    [workerId, MATCH_SERVICE_ID]
  );
  await db.query(
    `INSERT INTO grounded_worker_activation_acknowledgements (
       worker_id, acknowledgement_kind, policy_version
     ) VALUES
       ($1, 'foreground_location', $2),
       ($1, 'safety_policy', $3),
       ($1, 'first_job_readiness', $4)`,
    [
      workerId,
      process.env.WORKER_FOREGROUND_LOCATION_EXPLANATION_VERSION,
      process.env.WORKER_SAFETY_POLICY_VERSION,
      process.env.WORKER_FIRST_JOB_READINESS_VERSION,
    ]
  );
}

async function makeVerifiedLabourer(opts = {}) {
  const u = await registerUser({ role: 'labourer' });
  await db.query(
    `UPDATE labourer_profiles
       SET skills = $2::text[], hourly_rate = $3,
           is_available = $4, current_lat = $5, current_lng = $6,
           rating_avg = $7, rating_count = $8,
           location_updated_at = COALESCE($9, NOW())
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
      opts.location_updated_at ?? null,
    ]
  );
  if (opts.activationReady !== false) await seedCanonicalActivation(u.user.id);
  else await db.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [u.user.id]);
  return u;
}

async function waitForAttempt(matchId, count = 1, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await db.query(
      'SELECT id FROM match_attempts WHERE match_request_id = $1',
      [matchId]
    );
    if (r.rows.length >= count) return r.rows;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`waitForAttempt timed out (matchId=${matchId}, expected ${count})`);
}

async function insertPendingMatch(customerId, overrides = {}) {
  const inserted = await db.query(
    `INSERT INTO match_requests (
       customer_id, skill_needed, address, location_lat, location_lng,
       scheduled_at, hours_est, expires_at, dispatch_next_at
     )
     VALUES (
       $1, $2, $3, $4, $5,
       NOW() + INTERVAL '1 hour', 2,
       NOW() + INTERVAL '10 minutes', $6
     )
     RETURNING *`,
    [
      customerId,
      overrides.skill || 'Plumbing',
      overrides.address || '1 Durable Dispatch Rd',
      overrides.lat ?? -29.8,
      overrides.lng ?? 31.0,
      overrides.dispatchNextAt || new Date(),
    ]
  );
  return inserted.rows[0];
}

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM match_attempts');
  await db.query('DELETE FROM match_requests');
});

afterEach(() => {
  // Always reset, even if the test threw. Stops PING_TIMEOUT_MS bleed.
  matcher.__resetPingTimeoutForTesting();
  matcher.__resetDispatchLeaseForTesting();
  matcher.__resetOfferDeliveryForTesting();
});

afterAll(async () => {
  if (originalPublicProfileImageOrigin === undefined) delete process.env.PUBLIC_PROFILE_IMAGE_ORIGIN;
  else process.env.PUBLIC_PROFILE_IMAGE_ORIGIN = originalPublicProfileImageOrigin;
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

    const offered = await request(app)
      .get(`/api/worker/offers/${matchId}`)
      .set(authHeader(labourer.accessToken));
    expect(offered.status).toBe(200);
    expect(offered.body.offer.scopeSummary).toBe('Plumbing');
    const offeredJson = JSON.stringify(offered.body.offer);
    expect(offeredJson).not.toContain('1 Test Rd');
    expect(offeredJson).not.toContain('customer-private@example.test');
    expect(offeredJson).not.toContain('082 123 4567');

    // Labourer accepts the exact bounded scope summary shown in the offer.
    const accept = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(accept.status).toBe(200);
    expect(accept.body.booking).toBeDefined();
    expect(accept.body.booking.labourer_id).toBe(labourer.user.id);
    expect(accept.body.booking.customer_id).toBe(customer.user.id);
    expect(accept.body.booking.status).toBe('accepted');
    expect(accept.body.booking.address).toBeUndefined();

    const fulfilment = await request(app)
      .get(`/api/projects/${accept.body.booking.id}/fulfilment`)
      .set(authHeader(labourer.accessToken));
    expect(fulfilment.status).toBe(200);
    expect(fulfilment.body.fulfilment).toMatchObject({
      projectId: accept.body.booking.id,
      transactionalStatus: 'accepted',
      operationalPhase: 'scheduled',
      scope: {
        current: {
          version: 1,
          status: 'confirmed',
          source: 'accepted_agreement',
          proposedByRole: 'customer',
        },
        proposal: null,
      },
      integrity: {
        policySnapshotPresent: true,
        policyVersion: 'match-test-fulfilment-v1',
        readOnly: false,
      },
    });
    expect(fulfilment.body.fulfilment.location.precision).toBe('approximate');

    const row = await db.query(
      'SELECT status, matched_booking_id, matched_labourer_id FROM match_requests WHERE id = $1',
      [matchId]
    );
    expect(row.rows[0].status).toBe('matched');
    expect(row.rows[0].matched_labourer_id).toBe(labourer.user.id);
    expect(row.rows[0].matched_booking_id).toBe(accept.body.booking.id);

    const canonical = await db.query(
      `SELECT b.current_scope_version,
              (SELECT COUNT(*)::int FROM grounded_fulfilment_policy_snapshots p
                WHERE p.booking_id = b.id) AS policies,
              (SELECT COUNT(*)::int FROM grounded_scope_versions s
                WHERE s.booking_id = b.id AND s.status = 'confirmed') AS scopes,
              (SELECT s.scope_snapshot FROM grounded_scope_versions s
                WHERE s.booking_id = b.id AND s.status = 'confirmed') AS scope_snapshot
         FROM bookings b WHERE b.id = $1`,
      [accept.body.booking.id]
    );
    expect(canonical.rows[0]).toMatchObject({ current_scope_version: 1, policies: 1, scopes: 1 });
    expect(canonical.rows[0].scope_snapshot.description).toBe(offered.body.offer.scopeSummary);
    expect(canonical.rows[0].scope_snapshot.serviceLabel).toBe(offered.body.offer.scopeSummary);
    expect(canonical.rows[0].scope_snapshot.items).toEqual([{ label: offered.body.offer.scopeSummary }]);
    const confirmedScopeJson = JSON.stringify(canonical.rows[0].scope_snapshot);
    expect(confirmedScopeJson).not.toContain('1 Test Rd');
    expect(confirmedScopeJson).not.toContain('customer-private@example.test');
    expect(confirmedScopeJson).not.toContain('082 123 4567');

    matcher.__resetPingTimeoutForTesting();
  });

  test('match acceptance fails before attempt, request or booking mutation when policy is unapproved', async () => {
    matcher.__setPingTimeoutForTesting(10000);
    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Policy Gate Rd',
      location_lat: -29.8,
      location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
      notes: 'Private note: email customer-private@example.test or call 082 123 4567.',
    });
    const matchId = create.body.match.id;
    const attempts = await waitForAttempt(matchId);
    const approved = process.env.GROUNDED_FULFILMENT_POLICY_APPROVED;
    let acceptance;
    try {
      process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = 'false';
      acceptance = await request(app)
        .post(`/api/match/${matchId}/accept`)
        .set(authHeader(labourer.accessToken));
    } finally {
      process.env.GROUNDED_FULFILMENT_POLICY_APPROVED = approved;
    }
    expect(acceptance.status).toBe(503);
    expect(acceptance.body.type).toMatch(/\/errors\/fulfilment_policy_unavailable$/);
    expect(acceptance.body.extensions.reasonCode).toBe('fulfilment_policy_not_approved');
    const state = await db.query(
      `SELECT m.status AS match_status, a.status AS attempt_status,
              (SELECT COUNT(*)::int FROM bookings) AS bookings
         FROM match_requests m
         JOIN match_attempts a ON a.match_request_id = m.id
        WHERE m.id = $1 AND a.id = $2`,
      [matchId, attempts[0].id]
    );
    expect(state.rows[0]).toEqual({
      match_status: 'pending',
      attempt_status: 'pinged',
      bookings: 0,
    });
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
    await waitForAttempt(matchId); // first ping fires

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
    await waitForAttempt(matchId);

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
    await waitForAttempt(matchId);

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

  test('GET /api/match/:id filters attempt rows for a pinged labourer', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const pinged = await makeVerifiedLabourer();
    const other = await makeVerifiedLabourer({ lat: -29.805, lng: 31.0 });
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing',
      address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(),
      hours_est: 2,
    });
    const matchId = create.body.match.id;
    const [attempt] = await waitForAttempt(matchId);
    await db.query(
      `INSERT INTO match_attempts (match_request_id, labourer_id, status)
       VALUES ($1, $2, 'pinged')`,
      [matchId, other.user.id]
    );

    const get = await request(app).get(`/api/match/${matchId}`).set(authHeader(pinged.accessToken));
    expect(get.status).toBe(200);
    expect(get.body.match.address).toBeUndefined();
    expect(get.body.attempts).toHaveLength(1);
    expect(get.body.attempts[0].id).toBe(attempt.id);
    expect(get.body.attempts[0].labourer_id).toBe(pinged.user.id);

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
    await waitForAttempt(matchId);

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
  test('DB-time attempt deadline blocks acceptance before the dispatcher timer fires', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    const [attempt] = await waitForAttempt(matchId);
    await db.query(
      `UPDATE match_attempts
          SET pinged_at = clock_timestamp() - INTERVAL '7 seconds',
              offer_expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE id = $1`,
      [attempt.id]
    );

    const accepted = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(accepted.status).toBe(409);
    expect(accepted.body).toMatchObject({
      error: 'offer_expired',
      reason_code: 'match_attempt_expired',
    });
    const state = await db.query(
      `SELECT a.status AS attempt_status,
              (SELECT COUNT(*)::int FROM bookings WHERE id = m.matched_booking_id) AS booking_count
         FROM match_attempts a
         JOIN match_requests m ON m.id = a.match_request_id
        WHERE a.id = $1`,
      [attempt.id]
    );
    expect(state.rows[0]).toEqual({ attempt_status: 'timeout', booking_count: 0 });
  });

  test('DB-time request deadline expires the match and every still-open attempt atomically', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await waitForAttempt(matchId);
    await db.query(
      `UPDATE match_requests
          SET expires_at = clock_timestamp() - INTERVAL '1 millisecond'
        WHERE id = $1`,
      [matchId]
    );

    const accepted = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(accepted.status).toBe(409);
    expect(accepted.body).toMatchObject({
      error: 'offer_expired',
      reason_code: 'match_request_expired',
    });
    const state = await db.query(
      `SELECT m.status, m.expire_reason,
              COUNT(*) FILTER (WHERE a.status = 'timeout')::int AS timed_out,
              COUNT(b.id)::int AS booking_count
         FROM match_requests m
         JOIN match_attempts a ON a.match_request_id = m.id
         LEFT JOIN bookings b ON b.id = m.matched_booking_id
        WHERE m.id = $1
        GROUP BY m.id`,
      [matchId]
    );
    expect(state.rows[0]).toEqual({
      status: 'expired',
      expire_reason: 'request_deadline_elapsed',
      timed_out: 1,
      booking_count: 0,
    });
  });

  test('acceptance rechecks both canonical availability and activation inside the transaction', async () => {
    matcher.__setPingTimeoutForTesting(10000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    const [attempt] = await waitForAttempt(matchId);

    await db.query('UPDATE labourer_profiles SET is_available = false WHERE user_id = $1', [labourer.user.id]);
    const offline = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(offline.status).toBe(409);
    expect(offline.body).toMatchObject({ error: 'worker_offline', reason_code: 'worker_offline' });

    await db.query('UPDATE labourer_profiles SET is_available = true WHERE user_id = $1', [labourer.user.id]);
    await db.query(
      `DELETE FROM grounded_worker_activation_acknowledgements
        WHERE worker_id = $1 AND acknowledgement_kind = 'safety_policy'`,
      [labourer.user.id]
    );
    const incomplete = await request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(incomplete.status).toBe(409);
    expect(incomplete.body.error).toBe('worker_activation_incomplete');
    expect(incomplete.body.reason_code).toBe('worker_online_prerequisites_incomplete');

    const stored = await db.query('SELECT status FROM match_attempts WHERE id = $1', [attempt.id]);
    expect(stored.rows[0].status).toBe('pinged');
    await request(app).post(`/api/match/${matchId}/cancel`).set(authHeader(customer.accessToken));
  });

  test('two concurrent accepts preserve one winner and create exactly one booking', async () => {
    matcher.__setPingTimeoutForTesting(10000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await waitForAttempt(matchId);

    const accept = () => request(app)
      .post(`/api/match/${matchId}/accept`)
      .set(authHeader(labourer.accessToken));
    const responses = await Promise.all([accept(), accept()]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status !== 200)).toHaveLength(1);
    expect([403, 409]).toContain(responses.find((response) => response.status !== 200).status);

    const stored = await db.query(
      `SELECT m.status, COUNT(b.id)::int AS booking_count
         FROM match_requests m
         LEFT JOIN bookings b ON b.id = m.matched_booking_id
        WHERE m.id = $1
        GROUP BY m.id`,
      [matchId]
    );
    expect(stored.rows[0]).toEqual({ status: 'matched', booking_count: 1 });
  });

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
    await matcher.tick({ matchId });

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
    await waitForAttempt(matchId);

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
    await waitForAttempt(matchId);

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
    await matcher.tick({ matchId });

    const accept = await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(lB.accessToken));
    expect(accept.status).toBe(200);
    expect(accept.body.booking.labourer_id).toBe(lB.user.id);

    matcher.__resetPingTimeoutForTesting();
  });

  test('active offer ownership is durable DB state, not a pending process Map', async () => {
    matcher.__setPingTimeoutForTesting(5000);

    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });

    const create = await request(app).post('/api/match').set(authHeader(customer.accessToken)).send({
      skill_needed: 'Plumbing', address: '1 Test Rd',
      location_lat: -29.8, location_lng: 31.0,
      scheduled_at: FUTURE_ISO(), hours_est: 2,
    });
    const matchId = create.body.match.id;
    await waitForAttempt(matchId);

    expect(matcher.__pendingSize()).toBe(0);
    const active = await db.query(
      `SELECT offer_expires_at, dispatched_at, dispatch_attempt_count,
              dispatch_lease_id
         FROM match_attempts
        WHERE match_request_id = $1`,
      [matchId]
    );
    expect(active.rows[0].offer_expires_at).toBeTruthy();
    expect(active.rows[0].dispatched_at).toBeTruthy();
    expect(active.rows[0].dispatch_attempt_count).toBeGreaterThanOrEqual(1);
    expect(active.rows[0].dispatch_lease_id).toBeNull();

    await request(app).post(`/api/match/${matchId}/accept`).set(authHeader(labourer.accessToken));
    await new Promise((r) => setTimeout(r, 100));

    expect(matcher.__pendingSize()).toBe(0);

    matcher.__resetPingTimeoutForTesting();
  });
});

describe('matcher.recoverPendingDispatches', () => {
  test('preserves and idempotently requeues a pending match after restart', async () => {
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

    await db.query(
      `UPDATE match_requests
          SET dispatch_next_at = clock_timestamp() + INTERVAL '5 minutes',
              dispatch_lease_id = gen_random_uuid(),
              dispatch_lease_expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE id = $1`,
      [stranded]
    );

    const firstRecovery = await matcher.recoverPendingDispatches();
    const secondRecovery = await matcher.recoverPendingDispatches();
    expect(firstRecovery).toBeGreaterThanOrEqual(1);
    expect(secondRecovery).toBeGreaterThanOrEqual(1);

    const after = await db.query(
      `SELECT status, expire_reason, dispatch_lease_id,
              dispatch_next_at <= clock_timestamp() AS due
         FROM match_requests WHERE id = $1`,
      [stranded]
    );
    expect(after.rows[0]).toEqual({
      status: 'pending',
      expire_reason: null,
      dispatch_lease_id: null,
      due: true,
    });

    await matcher.tick({ matchId: stranded });
    const resolved = await db.query(
      'SELECT status, expire_reason FROM match_requests WHERE id = $1',
      [stranded]
    );
    expect(resolved.rows[0]).toEqual({ status: 'expired', expire_reason: 'no_candidates' });
  });
});

describe('durable multi-dispatcher leases', () => {
  test('dispatches the privacy-safe offer on the authenticated match namespace', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    const privateSkill = 'Plumbing at 99 Exact Private Address, call 082 123 4567';
    const labourer = await makeVerifiedLabourer({ skills: [privateSkill] });
    const customer = await registerUser({ role: 'customer' });
    const match = await insertPendingMatch(customer.user.id, {
      skill: privateSkill,
      address: '99 Exact Private Address',
    });
    const originalIo = global.__togt_io;
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const of = jest.fn(() => ({ to }));
    global.__togt_io = { of };
    try {
      await matcher.tick({ matchId: match.id });
    } finally {
      global.__togt_io = originalIo;
    }

    expect(of).toHaveBeenCalledWith('/match');
    expect(to).toHaveBeenCalledWith(`user:${labourer.user.id}`);
    expect(emit).toHaveBeenCalledWith('match:incoming', expect.objectContaining({
      attemptId: expect.any(String),
      skill_needed: 'Service requested through TOGT',
      scopeSummary: 'Service requested through TOGT',
    }));
    const payload = emit.mock.calls[0][1];
    expect(payload.address).toBeUndefined();
    expect(payload.notes).toBeUndefined();
    expect(payload.customer_id).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('99 Exact Private Address');
    expect(JSON.stringify(payload)).not.toContain('082 123 4567');
  });

  test('two dispatcher ticks create and deliver one logical offer', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const match = await insertPendingMatch(customer.user.id);
    const deliveredAttemptIds = [];
    matcher.__setOfferDeliveryForTesting(async ({ attempt }) => {
      deliveredAttemptIds.push(attempt.id);
      await new Promise(resolve => setTimeout(resolve, 25));
    });

    await Promise.all([
      matcher.tick({ matchId: match.id }),
      matcher.tick({ matchId: match.id }),
    ]);
    await matcher.tick({ matchId: match.id });

    const attempts = await db.query(
      `SELECT id, labourer_id, dispatched_at, dispatch_attempt_count,
              dispatch_lease_id
         FROM match_attempts
        WHERE match_request_id = $1`,
      [match.id]
    );
    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows[0].labourer_id).toBe(labourer.user.id);
    expect(attempts.rows[0].dispatched_at).toBeTruthy();
    expect(attempts.rows[0].dispatch_attempt_count).toBe(1);
    expect(attempts.rows[0].dispatch_lease_id).toBeNull();
    expect(deliveredAttemptIds).toEqual([attempts.rows[0].id]);
  });

  test('an unexpired match lease is not stolen, then one dispatcher recovers it', async () => {
    await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const match = await insertPendingMatch(customer.user.id);
    await db.query(
      `UPDATE match_requests
          SET dispatch_lease_id = gen_random_uuid(),
              dispatch_lease_expires_at = clock_timestamp() + INTERVAL '1 minute'
        WHERE id = $1`,
      [match.id]
    );

    const liveLeaseResults = await Promise.all([
      matcher.tick({ matchId: match.id }),
      matcher.tick({ matchId: match.id }),
    ]);
    expect(liveLeaseResults.reduce((sum, value) => sum + value.matchesClaimed, 0)).toBe(0);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM match_attempts WHERE match_request_id = $1',
      [match.id]
    )).rows[0].count).toBe(0);

    await db.query(
      `UPDATE match_requests
          SET dispatch_lease_expires_at = clock_timestamp() - INTERVAL '1 millisecond'
        WHERE id = $1`,
      [match.id]
    );
    const recovered = await Promise.all([
      matcher.tick({ matchId: match.id }),
      matcher.tick({ matchId: match.id }),
    ]);
    expect(recovered.reduce((sum, value) => sum + value.matchesClaimed, 0)).toBe(1);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM match_attempts WHERE match_request_id = $1',
      [match.id]
    )).rows[0].count).toBe(1);
  });

  test('a crashed offer-delivery claim is retried at least once with the same attempt id', async () => {
    matcher.__setPingTimeoutForTesting(10000);
    const labourer = await makeVerifiedLabourer();
    const customer = await registerUser({ role: 'customer' });
    const match = await insertPendingMatch(customer.user.id, {
      dispatchNextAt: new Date(Date.now() + 60_000),
    });
    const attempt = await db.query(
      `INSERT INTO match_attempts (
         match_request_id, labourer_id, pinged_at, offer_expires_at,
         dispatch_next_at, dispatch_lease_id, dispatch_lease_expires_at,
         dispatch_attempt_count
       ) VALUES (
         $1, $2, clock_timestamp(), clock_timestamp() + INTERVAL '10 seconds',
         clock_timestamp() - INTERVAL '2 seconds', gen_random_uuid(),
         clock_timestamp() - INTERVAL '1 second', 1
       )
       RETURNING id`,
      [match.id, labourer.user.id]
    );
    const attemptId = attempt.rows[0].id;
    const deliveries = [];
    matcher.__setOfferDeliveryForTesting(async ({ attempt: offered }) => {
      deliveries.push(offered.id);
    });

    await matcher.recoverPendingDispatches();
    await Promise.all([
      matcher.tick({ matchId: match.id, attemptId }),
      matcher.tick({ matchId: match.id, attemptId }),
    ]);
    await matcher.tick({ matchId: match.id, attemptId });

    const stored = await db.query(
      `SELECT dispatched_at, dispatch_attempt_count, dispatch_lease_id,
              dispatch_last_error
         FROM match_attempts WHERE id = $1`,
      [attemptId]
    );
    expect(deliveries).toEqual([attemptId]);
    expect(stored.rows[0].dispatched_at).toBeTruthy();
    expect(stored.rows[0].dispatch_attempt_count).toBe(2);
    expect(stored.rows[0].dispatch_lease_id).toBeNull();
    expect(stored.rows[0].dispatch_last_error).toBeNull();
  });

  test('concurrent timeout recovery advances to exactly one next candidate', async () => {
    matcher.__setPingTimeoutForTesting(5000);
    const first = await makeVerifiedLabourer({ rating_avg: 5, lat: -29.805, lng: 31.0 });
    const second = await makeVerifiedLabourer({ rating_avg: 4, lat: -29.81, lng: 31.0 });
    const customer = await registerUser({ role: 'customer' });
    const match = await insertPendingMatch(customer.user.id);
    await matcher.tick({ matchId: match.id });
    const firstAttempt = await db.query(
      'SELECT id, labourer_id FROM match_attempts WHERE match_request_id = $1',
      [match.id]
    );
    expect(firstAttempt.rows).toHaveLength(1);
    expect(firstAttempt.rows[0].labourer_id).toBe(first.user.id);
    await db.query(
      `UPDATE match_attempts
          SET pinged_at = clock_timestamp() - INTERVAL '7 seconds',
              offer_expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE id = $1`,
      [firstAttempt.rows[0].id]
    );
    await db.query(
      `UPDATE match_requests
          SET dispatch_next_at = clock_timestamp(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL
        WHERE id = $1`,
      [match.id]
    );

    await Promise.all([
      matcher.tick({ matchId: match.id }),
      matcher.tick({ matchId: match.id }),
    ]);

    const attempts = await db.query(
      `SELECT labourer_id, status FROM match_attempts
        WHERE match_request_id = $1 ORDER BY pinged_at`,
      [match.id]
    );
    expect(attempts.rows).toEqual([
      { labourer_id: first.user.id, status: 'timeout' },
      { labourer_id: second.user.id, status: 'pinged' },
    ]);
  });
});
