const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const projectRouter = require('../src/routes/groundedProjects');
const { problemHandler } = require('../src/lib/problemJson');

const testApp = express();
testApp.use(express.json());
testApp.use('/api/projects', projectRouter);
testApp.use(problemHandler);
const request = supertest(testApp);

function token(user) {
  return signAccessToken({ id: user.id, role: user.role });
}

function auth(user) {
  return { Authorization: `Bearer ${token(user)}` };
}

async function resetDatabase() {
  await db.query(`
    TRUNCATE TABLE
      grounded_project_commands,
      grounded_project_outbox,
      grounded_project_events,
      grounded_project_completions,
      grounded_project_issues,
      grounded_project_commercial_snapshots,
      ratings, payments, change_orders, sos_events, bookings,
      labourer_profiles, kyc_verifications, users
    RESTART IDENTITY CASCADE
  `);
}

async function createUser(role, suffix) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, 'test-hash', $4, true)
     RETURNING id, name, role`,
    [
      role === 'customer' ? `Naledi ${suffix}` : `Thabo ${suffix}`,
      `${role}-${suffix}@example.test`,
      role === 'customer' ? `082${suffix.padStart(7, '0')}` : `083${suffix.padStart(7, '0')}`,
      role,
    ]
  );
  const user = result.rows[0];
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (
         user_id, skills, hourly_rate, is_available, rating_avg, rating_count,
         current_lat, current_lng, location_updated_at
       ) VALUES ($1, ARRAY['Plumbing'], 425.00, true, 4.80, 25, -33.93, 18.43, NOW())`,
      [user.id]
    );
  }
  return user;
}

async function createFixture({ status = 'in_progress', paymentStatus = 'pending' } = {}) {
  const suffix = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const customer = await createUser('customer', suffix);
  const worker = await createUser('labourer', String(Number(suffix) + 1));
  const outsider = await createUser('customer', String(Number(suffix) + 2));
  const bookingResult = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, hours_est,
       total_amount, notes, scope_items, scope_confirmed_by_customer,
       scope_confirmed_by_labourer, scope_confirmed_at
     ) VALUES (
       $1, $2, $3, $4, 'Plumbing', '12 Exact Street, Cape Town',
       -33.9248685, 18.4240553, NOW() + INTERVAL '1 day', 2.0,
       850.00, 'Gate 4. Call 082 123 4567',
       $5::jsonb, true, true, NOW()
     ) RETURNING *`,
    [
      customer.id,
      worker.id,
      status,
      status === 'in_progress' ? 'work_active' : status === 'accepted' ? 'scheduled' : 'matching',
      JSON.stringify([{ label: 'Fix tap', phone: '0821234567' }]),
    ]
  );
  const booking = bookingResult.rows[0];
  if (paymentStatus) {
    await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status)
       VALUES ($1, 850.00, 'ZAR', $2)`,
      [booking.id, paymentStatus]
    );
  }
  return { customer, worker, outsider, booking };
}

function transitionRequest(method, path, user, revision, key, body = {}) {
  return request[method](path)
    .set(auth(user))
    .set('If-Match', String(revision))
    .set('Idempotency-Key', key)
    .send(body);
}

async function requestCompletion(fixture, key = 'request-completion-key') {
  return transitionRequest(
    'post',
    `/api/projects/${fixture.booking.id}/completion-requests`,
    fixture.worker,
    0,
    key
  );
}

beforeEach(resetDatabase);

afterAll(async () => {
  await db.end();
});

describe('participant-authorized Project reads', () => {
  test('database lifecycle accepts the canonical post-start terminal status', async () => {
    const fixture = await createFixture({ status: 'in_progress', paymentStatus: null });
    const result = await db.query(
      `UPDATE bookings
          SET status = 'terminated_after_start', operational_phase = 'closed'
        WHERE id = $1
        RETURNING status, operational_phase`,
      [fixture.booking.id]
    );
    expect(result.rows[0]).toEqual({
      status: 'terminated_after_start',
      operational_phase: 'closed',
    });
  });

  test('requires authentication and hides an existing Project from non-participants', async () => {
    const fixture = await createFixture({ status: 'accepted' });
    const unauthenticated = await request.get(`/api/projects/${fixture.booking.id}`);
    expect(unauthenticated.status).toBe(401);

    const outsider = await request
      .get(`/api/projects/${fixture.booking.id}`)
      .set(auth(fixture.outsider));
    expect(outsider.status).toBe(404);
    expect(outsider.body.type).toMatch(/project_not_found$/);
  });

  test('rejects malformed Project identifiers as a safe client error', async () => {
    const fixture = await createFixture({ status: 'accepted' });
    const result = await request.get('/api/projects/not-a-uuid').set(auth(fixture.customer));
    expect(result.status).toBe(400);
    expect(result.body.type).toMatch(/project_id_invalid$/);
  });

  test('lists only participant Projects in the requested canonical segment', async () => {
    const own = await createFixture({ status: 'accepted' });
    await createFixture({ status: 'in_progress' });

    const result = await request
      .get('/api/projects?segment=upcoming')
      .set(auth(own.customer));
    expect(result.status).toBe(200);
    expect(result.body.meta).toEqual({ segment: 'upcoming', count: 1 });
    expect(result.body.projects).toHaveLength(1);
    expect(result.body.projects[0].id).toBe(own.booking.id);
    expect(result.body.projects[0].operational.label).toBe('Worker confirmed');
    expect(result.body.projects[0]).not.toHaveProperty('timeline');
  });

  test('scheduled worker detail hides exact address, customer contact and unsafe scope keys', async () => {
    const fixture = await createFixture({ status: 'accepted' });
    const result = await request
      .get(`/api/projects/${fixture.booking.id}`)
      .set(auth(fixture.worker));

    expect(result.status).toBe(200);
    expect(result.headers.etag).toBe('"0"');
    expect(result.body.project.area.precision).toBe('approximate');
    expect(result.body.project.area).not.toHaveProperty('address');
    expect(result.body.project.participants.customer).not.toHaveProperty('phone');
    expect(result.body.project.scope.items[0]).not.toHaveProperty('phone');
    expect(result.body.project.scope).not.toHaveProperty('customerNotes');
  });

  test('active participant projections reveal only phase-permitted location/contact', async () => {
    const fixture = await createFixture();
    const workerResult = await request
      .get(`/api/projects/${fixture.booking.id}`)
      .set(auth(fixture.worker));
    expect(workerResult.body.project.area.precision).toBe('exact');
    expect(workerResult.body.project.participants.customer.phone).toBeDefined();

    const customerResult = await request
      .get(`/api/projects/${fixture.booking.id}`)
      .set(auth(fixture.customer));
    expect(customerResult.body.project.workerLiveLocation.freshness).toBe('fresh');
    expect(customerResult.body.project.payment.status).toBe('pending');
  });
});

describe('worker completion request', () => {
  test('requires optimistic concurrency and idempotency headers', async () => {
    const fixture = await createFixture();
    const noKey = await request
      .post(`/api/projects/${fixture.booking.id}/completion-requests`)
      .set(auth(fixture.worker))
      .set('If-Match', '0')
      .send({});
    expect(noKey.status).toBe(400);
    expect(noKey.body.type).toMatch(/idempotency_key_required$/);

    const noRevision = await request
      .post(`/api/projects/${fixture.booking.id}/completion-requests`)
      .set(auth(fixture.worker))
      .set('Idempotency-Key', 'missing-revision-key')
      .send({});
    expect(noRevision.status).toBe(428);
    expect(noRevision.body.type).toMatch(/project_revision_required$/);
  });

  test('rejects client-authored money/status fields', async () => {
    const fixture = await createFixture();
    const result = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-requests`,
      fixture.worker,
      0,
      'client-money-key',
      { total_amount: '1.00' }
    );
    expect(result.status).toBe(422);
    expect(result.body.extensions.unsupportedFields).toEqual(['total_amount']);
  });

  test('allows only the assigned worker and blocks unresolved changes', async () => {
    const fixture = await createFixture();
    const customerAttempt = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-requests`,
      fixture.customer,
      0,
      'customer-request-key'
    );
    expect(customerAttempt.status).toBe(403);

    await db.query(
      `INSERT INTO change_orders (
         booking_id, requested_by, description, extra_amount, status
       ) VALUES ($1, $2, 'Extra fitting', 100.00, 'pending')`,
      [fixture.booking.id, fixture.worker.id]
    );
    const blocked = await requestCompletion(fixture, 'open-change-key');
    expect(blocked.status).toBe(409);
    expect(blocked.body.type).toMatch(/completion_open_change_order$/);
    const completionCount = await db.query(
      'SELECT COUNT(*)::int AS count FROM grounded_project_completions WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(completionCount.rows[0].count).toBe(0);
  });

  test('atomically freezes server commercial truth, keeps booking active and leaves payment untouched', async () => {
    const fixture = await createFixture();
    await db.query(
      `INSERT INTO change_orders (
         booking_id, requested_by, description, extra_hours, extra_amount, status, responded_at
       ) VALUES ($1, $2, 'Approved valve', 0.5, 150.00, 'accepted', NOW())`,
      [fixture.booking.id, fixture.worker.id]
    );
    const result = await requestCompletion(fixture);

    expect(result.status).toBe(201);
    expect(result.headers.etag).toBe('"1"');
    expect(result.body.transition).toEqual({ type: 'completion_requested', applied: true });
    expect(result.body.project.transactionalStatus).toBe('in_progress');
    expect(result.body.project.operational.phase).toBe('completion_review');
    expect(result.body.project.completion.status).toBe('requested');

    const snapshot = await db.query(
      `SELECT agreed_total_amount, payment_status_at_capture, accepted_change_orders
         FROM grounded_project_commercial_snapshots WHERE booking_id = $1`,
      [fixture.booking.id]
    );
    expect(snapshot.rows[0].agreed_total_amount).toBe('850.00');
    expect(snapshot.rows[0].payment_status_at_capture).toBe('pending');
    expect(snapshot.rows[0].accepted_change_orders).toHaveLength(1);

    const payment = await db.query(
      'SELECT status, amount FROM payments WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(payment.rows).toEqual([expect.objectContaining({ status: 'pending', amount: '850.00' })]);

    const events = await db.query(
      `SELECT aggregate_sequence, event_type FROM grounded_project_events
        WHERE booking_id = $1 ORDER BY aggregate_sequence`,
      [fixture.booking.id]
    );
    expect(events.rows).toEqual([
      { aggregate_sequence: '0', event_type: 'project.created' },
      { aggregate_sequence: '1', event_type: 'completion.requested' },
    ]);
    const outbox = await db.query(
      'SELECT status, payload FROM grounded_project_outbox WHERE aggregate_id = $1',
      [fixture.booking.id]
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0].status).toBe('pending');
    expect(outbox.rows[0].payload).not.toHaveProperty('address');
  });

  test('same-key replay returns the original response without duplicating evidence', async () => {
    const fixture = await createFixture();
    const first = await requestCompletion(fixture, 'stable-replay-key');
    const replay = await requestCompletion(fixture, 'stable-replay-key');

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);

    const counts = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM grounded_project_completions WHERE booking_id = $1) AS completions,
         (SELECT COUNT(*)::int FROM grounded_project_commercial_snapshots WHERE booking_id = $1) AS snapshots,
         (SELECT COUNT(*)::int FROM grounded_project_events WHERE booking_id = $1 AND event_type = 'completion.requested') AS events`,
      [fixture.booking.id]
    );
    expect(counts.rows[0]).toEqual({ completions: 1, snapshots: 1, events: 1 });
  });

  test('same key with a changed If-Match fingerprint conflicts', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture, 'fingerprint-key');
    const changed = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-requests`,
      fixture.worker,
      1,
      'fingerprint-key'
    );
    expect(changed.status).toBe(422);
    expect(changed.body.type).toMatch(/idempotency_key_reused$/);
  });

  test('two concurrent same-key requests apply exactly once', async () => {
    const fixture = await createFixture();
    const [left, right] = await Promise.all([
      requestCompletion(fixture, 'concurrent-request-key'),
      requestCompletion(fixture, 'concurrent-request-key'),
    ]);
    expect([left.status, right.status]).toEqual([201, 201]);
    expect([left.headers['idempotent-replay'], right.headers['idempotent-replay']].filter(Boolean))
      .toEqual(['true']);

    const count = await db.query(
      `SELECT COUNT(*)::int AS count FROM grounded_project_events
        WHERE booking_id = $1 AND event_type = 'completion.requested'`,
      [fixture.booking.id]
    );
    expect(count.rows[0].count).toBe(1);
  });
});

describe('bilateral completion decision', () => {
  test('customer confirmation alone completes fulfilment and preserves pending payment truth', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture);

    const workerAttempt = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.worker,
      1,
      'worker-confirm-key'
    );
    expect(workerAttempt.status).toBe(403);

    const confirmed = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.customer,
      1,
      'customer-confirm-key'
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.project.revision).toBe(3);
    expect(confirmed.body.project.transactionalStatus).toBe('completed');
    expect(confirmed.body.project.operational.phase).toBe('payment_pending');
    expect(confirmed.body.project.payment.status).toBe('pending');
    expect(confirmed.body.project.completion.status).toBe('confirmed');

    const payment = await db.query(
      'SELECT status, amount FROM payments WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(payment.rows[0]).toEqual({ status: 'pending', amount: '850.00' });

    const events = await db.query(
      `SELECT aggregate_sequence, event_type FROM grounded_project_events
        WHERE booking_id = $1 ORDER BY aggregate_sequence`,
      [fixture.booking.id]
    );
    expect(events.rows.map((item) => item.event_type)).toEqual([
      'project.created',
      'completion.requested',
      'completion.confirmed',
      'booking.completed',
    ]);
  });

  test('a paid payment projects closed without rewriting the payment record', async () => {
    const fixture = await createFixture({ paymentStatus: 'paid' });
    await requestCompletion(fixture);
    const confirmed = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.customer,
      1,
      'paid-confirm-key'
    );
    expect(confirmed.body.project.operational.phase).toBe('closed');
    expect(confirmed.body.project.segment).toBe('past');
    expect(confirmed.body.project.payment.status).toBe('paid');
  });

  test('an unresolved safety record blocks confirmation without changing either domain', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture);
    await db.query(
      'INSERT INTO sos_events (user_id, booking_id, lat, lng) VALUES ($1, $2, -33.9, 18.4)',
      [fixture.customer.id, fixture.booking.id]
    );

    const blocked = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.customer,
      1,
      'safety-hold-key'
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.type).toMatch(/completion_open_safety_hold$/);
    const state = await db.query(
      `SELECT b.status, c.status AS completion_status
         FROM bookings b JOIN grounded_project_completions c ON c.booking_id = b.id
        WHERE b.id = $1`,
      [fixture.booking.id]
    );
    expect(state.rows[0]).toEqual({ status: 'in_progress', completion_status: 'requested' });
  });

  test('customer dispute opens a separate issue and never completes or charges the booking', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture);
    const disputed = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/disputes`,
      fixture.customer,
      1,
      'dispute-key',
      { reason: 'The leak is still present.' }
    );

    expect(disputed.status).toBe(200);
    expect(disputed.body.project.transactionalStatus).toBe('in_progress');
    expect(disputed.body.project.completion.status).toBe('disputed');
    expect(disputed.body.project.completion.issue).toEqual(expect.objectContaining({
      status: 'open',
      reason: 'The leak is still present.',
    }));

    const payment = await db.query(
      'SELECT status FROM payments WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(payment.rows[0].status).toBe('pending');

    const confirmAfterDispute = await transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.customer,
      2,
      'late-confirm-key'
    );
    expect(confirmAfterDispute.status).toBe(409);
    expect(confirmAfterDispute.body.type).toMatch(/completion_not_awaiting_confirmation$/);
  });

  test('concurrent contradictory customer decisions resolve once without corrupting state', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture);

    const [confirm, dispute] = await Promise.all([
      transitionRequest(
        'post',
        `/api/projects/${fixture.booking.id}/completion-confirmations`,
        fixture.customer,
        1,
        'race-confirm-key'
      ),
      transitionRequest(
        'post',
        `/api/projects/${fixture.booking.id}/disputes`,
        fixture.customer,
        1,
        'race-dispute-key',
        { reason: 'Race-safe issue report' }
      ),
    ]);

    expect([confirm.status, dispute.status].sort()).toEqual([200, 412]);
    const state = await db.query(
      `SELECT b.status, b.lifecycle_revision, c.status AS completion_status,
              c.dispute_issue_id
         FROM bookings b JOIN grounded_project_completions c ON c.booking_id = b.id
        WHERE b.id = $1`,
      [fixture.booking.id]
    );
    const final = state.rows[0];
    if (final.completion_status === 'confirmed') {
      expect(final.status).toBe('completed');
      expect(final.lifecycle_revision).toBe('3');
      expect(final.dispute_issue_id).toBeNull();
    } else {
      expect(final.completion_status).toBe('disputed');
      expect(final.status).toBe('in_progress');
      expect(final.lifecycle_revision).toBe('2');
      expect(final.dispute_issue_id).not.toBeNull();
    }
    const duplicateSequences = await db.query(
      `SELECT aggregate_sequence, COUNT(*)::int AS count
         FROM grounded_project_events WHERE booking_id = $1
        GROUP BY aggregate_sequence HAVING COUNT(*) > 1`,
      [fixture.booking.id]
    );
    expect(duplicateSequences.rows).toEqual([]);
  });

  test('concurrent same-key confirmations emit one completion pair', async () => {
    const fixture = await createFixture();
    await requestCompletion(fixture);
    const makeConfirmation = () => transitionRequest(
      'post',
      `/api/projects/${fixture.booking.id}/completion-confirmations`,
      fixture.customer,
      1,
      'concurrent-confirm-key'
    );
    const [left, right] = await Promise.all([makeConfirmation(), makeConfirmation()]);
    expect([left.status, right.status]).toEqual([200, 200]);
    expect([left.headers['idempotent-replay'], right.headers['idempotent-replay']].filter(Boolean))
      .toEqual(['true']);

    const counts = await db.query(
      `SELECT event_type, COUNT(*)::int AS count
         FROM grounded_project_events
        WHERE booking_id = $1 AND event_type IN ('completion.confirmed', 'booking.completed')
        GROUP BY event_type ORDER BY event_type`,
      [fixture.booking.id]
    );
    expect(counts.rows).toEqual([
      { event_type: 'booking.completed', count: 1 },
      { event_type: 'completion.confirmed', count: 1 },
    ]);
  });
});
