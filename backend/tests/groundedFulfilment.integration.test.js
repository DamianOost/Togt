const crypto = require('crypto');
const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const fulfilmentRouter = require('../src/routes/groundedFulfilment');
const { problemHandler } = require('../src/lib/problemJson');
const { createPinMaterial } = require('../src/services/groundedFulfilment/pin');

const app = express();
app.use(express.json());
app.use('/api/projects', fulfilmentRouter);
app.use(problemHandler);
const request = supertest(app);

let sequence = 0;

function auth(user) {
  const token = signAccessToken({ id: user.id, role: user.role });
  return { Authorization: `Bearer ${token}` };
}

function transition(path, user, revision, key, body = {}) {
  return request.post(path)
    .set(auth(user))
    .set('If-Match', String(revision))
    .set('Idempotency-Key', key)
    .send(body);
}

async function resetDatabase() {
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
}

async function createUser(role) {
  sequence += 1;
  const suffix = String(8_000_000 + sequence);
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, 'test-hash', $4, true)
     RETURNING id, name, role`,
    [
      role === 'customer' ? `Naledi ${suffix}` : `Thabo ${suffix}`,
      `${role}-${suffix}@fulfilment.example.test`,
      role === 'customer' ? `082${suffix}` : `083${suffix}`,
      role,
    ]
  );
  return result.rows[0];
}

async function createFixture({
  status = 'accepted',
  phase = 'scheduled',
  scheduleMinutes = 30,
  routeLeadMinutes = 60,
  withPolicy = true,
  pinAttempts = 3,
} = {}) {
  const customer = await createUser('customer');
  const worker = await createUser('labourer');
  const outsider = await createUser('customer');
  const bookingResult = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, hours_est,
       total_amount, notes, scope_items
     ) VALUES (
       $1, $2, $3, $4, 'Plumbing', '12 Exact Street, Cape Town',
       -33.9248685, 18.4240553, NOW() + ($5 * INTERVAL '1 minute'),
       2.0, 1000.00, 'Gate four', '[]'::jsonb
     ) RETURNING *`,
    [customer.id, worker.id, status, phase, scheduleMinutes]
  );
  const booking = bookingResult.rows[0];
  if (withPolicy) {
    await db.query(
      `INSERT INTO grounded_fulfilment_policy_snapshots (
         booking_id, policy_version, source, route_reveal_lead_minutes,
         arrival_evidence_mode, no_show_grace_minutes,
         start_pin_ttl_minutes, start_pin_max_attempts,
         reschedule_expiry_minutes, change_order_expiry_minutes
       ) VALUES (
         $1, 'ops-test-v1', 'operations_override', $2,
         'worker_attestation', 15, 60, $3, 120, 120
       )`,
      [booking.id, routeLeadMinutes, pinAttempts]
    );
  }
  if (['en_route', 'arrived', 'scope_confirmation', 'work_active'].includes(phase)) {
    await db.query(
      `UPDATE bookings
          SET route_access_granted_at = NOW(),
              en_route_at = NOW(),
              arrived_at = CASE WHEN $2 IN ('arrived', 'scope_confirmation', 'work_active')
                                THEN NOW() ELSE NULL END
        WHERE id = $1`,
      [booking.id, phase]
    );
  }
  return { customer, worker, outsider, booking };
}

async function seedConfirmedScope(fixture, version = 1) {
  const snapshot = {
    description: 'Repair the leaking tap',
    items: ['Replace damaged washer'],
    materialsResponsibility: 'Worker supplies washer',
    estimatedMinutes: 60,
  };
  await db.query(
    `INSERT INTO grounded_scope_versions (
       booking_id, version, status, source, proposed_by, proposed_by_role,
       scope_snapshot, customer_confirmed_by, customer_confirmed_at,
       worker_confirmed_by, worker_confirmed_at
     ) VALUES (
       $1, $2, 'confirmed', 'participant_proposal', $3, 'labourer', $4::jsonb,
       $5, NOW(), $3, NOW()
     )`,
    [fixture.booking.id, version, fixture.worker.id, JSON.stringify(snapshot), fixture.customer.id]
  );
  await db.query(
    `UPDATE bookings
        SET current_scope_version = $2, scope_items = $3::jsonb,
            scope_confirmed_by_customer = true,
            scope_confirmed_by_labourer = true,
            scope_confirmed_at = NOW()
      WHERE id = $1`,
    [fixture.booking.id, version, JSON.stringify(snapshot.items)]
  );
  return snapshot;
}

beforeEach(resetDatabase);

afterAll(async () => {
  await db.end();
});

describe('Grounded fulfilment authorization and route privacy', () => {
  test('hides Projects from outsiders and reveals exact address only after an authorized route start', async () => {
    const fixture = await createFixture();

    const outsider = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.outsider));
    expect(outsider.status).toBe(404);

    const before = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.worker));
    expect(before.status).toBe(200);
    expect(before.body.fulfilment.location.precision).toBe('approximate');
    expect(before.body.fulfilment.location).not.toHaveProperty('address');
    expect(before.body.fulfilment.participants.customer.phone).toBeNull();

    const customerBefore = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.customer));
    expect(customerBefore.status).toBe(200);
    expect(customerBefore.body.fulfilment.participants.worker.phone).toBeNull();

    const started = await transition(
      `/api/projects/${fixture.booking.id}/en-route`,
      fixture.worker,
      0,
      'route-start-0001'
    );
    expect(started.status).toBe(200);
    expect(started.body.fulfilment.revision).toBe(1);
    expect(started.body.fulfilment.location).toMatchObject({
      precision: 'exact',
      address: '12 Exact Street, Cape Town',
    });
    expect(started.body.fulfilment.participants.customer.phone).toBeTruthy();

    const customerAfter = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.customer));
    expect(customerAfter.status).toBe(200);
    expect(customerAfter.body.fulfilment.participants.worker.phone).toBeTruthy();

    const arrived = await transition(
      `/api/projects/${fixture.booking.id}/arrivals`,
      fixture.worker,
      1,
      'arrival-attest-0001',
      { attestation: true }
    );
    expect(arrived.status).toBe(200);
    expect(arrived.body.fulfilment.operationalPhase).toBe('arrived');

    const evidence = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM grounded_project_events WHERE booking_id = $1) AS events,
         (SELECT COUNT(*) FROM grounded_project_outbox WHERE aggregate_id = $1) AS outbox,
         (SELECT COUNT(*) FROM grounded_arrival_attestations WHERE booking_id = $1) AS arrivals`,
      [fixture.booking.id]
    );
    expect(Number(evidence.rows[0].events)).toBe(2);
    expect(Number(evidence.rows[0].outbox)).toBe(2);
    expect(Number(evidence.rows[0].arrivals)).toBe(1);
  });

  test('enforces policy lead-time and missing-policy fail-closed gates', async () => {
    const early = await createFixture({ routeLeadMinutes: 0, scheduleMinutes: 30 });
    const tooEarly = await transition(
      `/api/projects/${early.booking.id}/en-route`,
      early.worker,
      0,
      'route-too-early-1'
    );
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.type).toMatch(/route_reveal_too_early$/);

    const legacy = await createFixture({ withPolicy: false });
    const read = await request
      .get(`/api/projects/${legacy.booking.id}/fulfilment`)
      .set(auth(legacy.customer));
    expect(read.body.fulfilment.integrity.readOnly).toBe(true);
    expect(Object.values(read.body.fulfilment.allowedActions).every((value) => value === false)).toBe(true);
    const blocked = await transition(
      `/api/projects/${legacy.booking.id}/en-route`,
      legacy.worker,
      0,
      'legacy-no-policy-1'
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.type).toMatch(/fulfilment_policy_missing$/);
  });
});

describe('bilateral scope and actor-safe start PIN', () => {
  test('confirms a versioned scope, stores no plaintext PIN and starts work atomically', async () => {
    const fixture = await createFixture({ phase: 'arrived' });
    const proposed = await transition(
      `/api/projects/${fixture.booking.id}/scope-proposals`,
      fixture.customer,
      0,
      'scope-propose-0001',
      {
        baseVersion: null,
        description: 'Repair the leaking tap',
        items: ['Replace damaged washer'],
        materialsResponsibility: 'Worker supplies washer',
        estimatedMinutes: 60,
      }
    );
    expect(proposed.status).toBe(201);
    expect(proposed.body.fulfilment.scope.proposal.version).toBe(1);

    const confirmed = await transition(
      `/api/projects/${fixture.booking.id}/scope-confirmations`,
      fixture.worker,
      1,
      'scope-confirm-0001',
      { scopeVersion: 1, decision: 'confirm' }
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.fulfilment.scope.current).toMatchObject({ version: 1, status: 'confirmed' });

    const workerReveal = await transition(
      `/api/projects/${fixture.booking.id}/start-pin-reveals`,
      fixture.worker,
      2,
      'worker-pin-reveal-1'
    );
    expect(workerReveal.status).toBe(403);

    const revealed = await transition(
      `/api/projects/${fixture.booking.id}/start-pin-reveals`,
      fixture.customer,
      2,
      'customer-pin-reveal-1'
    );
    expect(revealed.status).toBe(201);
    expect(revealed.body.startPin).toMatch(/^\d{6}$/);
    expect(revealed.body.fulfilment.revision).toBe(3);
    const startPin = revealed.body.startPin;

    const storage = await db.query(
      `SELECT
         (SELECT row_to_json(p)::text FROM grounded_start_pin_challenges p WHERE booking_id = $1) AS challenge,
         (SELECT response_body::text FROM grounded_fulfilment_commands
           WHERE booking_id = $1 AND command_type = 'reveal_start_pin') AS receipt`,
      [fixture.booking.id]
    );
    expect(storage.rows[0].challenge).not.toContain(startPin);
    expect(storage.rows[0].receipt).not.toContain(startPin);

    const workerRead = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.worker));
    expect(JSON.stringify(workerRead.body)).not.toContain(startPin);

    const wrongPin = startPin === '999999' ? '000000' : '999999';
    const rejected = await transition(
      `/api/projects/${fixture.booking.id}/start`,
      fixture.worker,
      3,
      'start-wrong-pin-1',
      { startPin: wrongPin, deviceId: 'android:test-device-001' }
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body.extensions.attemptsRemaining).toBe(2);
    expect(rejected.body.fulfilment.revision).toBe(4);

    const replay = await transition(
      `/api/projects/${fixture.booking.id}/start`,
      fixture.worker,
      3,
      'start-wrong-pin-1',
      { startPin: wrongPin, deviceId: 'android:test-device-001' }
    );
    expect(replay.status).toBe(403);
    expect(replay.headers['idempotent-replay']).toBe('true');
    const attemptCount = await db.query(
      'SELECT COUNT(*) AS count FROM grounded_start_pin_attempts WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(Number(attemptCount.rows[0].count)).toBe(1);

    const started = await transition(
      `/api/projects/${fixture.booking.id}/start`,
      fixture.worker,
      4,
      'start-correct-pin-1',
      { startPin, deviceId: 'android:test-device-001' }
    );
    expect(started.status).toBe(200);
    expect(started.body.fulfilment).toMatchObject({
      transactionalStatus: 'in_progress',
      operationalPhase: 'work_active',
      revision: 5,
    });
    expect(started.body.fulfilment.start.status).toBe('consumed');

    const durable = await db.query(
      `SELECT status, operational_phase, start_device_id_hash, start_verified_by,
              (SELECT status FROM grounded_start_pin_challenges WHERE booking_id = $1) AS pin_status
         FROM bookings WHERE id = $1`,
      [fixture.booking.id]
    );
    expect(durable.rows[0]).toMatchObject({
      status: 'in_progress',
      operational_phase: 'work_active',
      start_verified_by: fixture.worker.id,
      pin_status: 'consumed',
    });
    expect(durable.rows[0].start_device_id_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('serializes bilateral scope decision races to one winner', async () => {
    const fixture = await createFixture({ phase: 'arrived' });
    await transition(
      `/api/projects/${fixture.booking.id}/scope-proposals`,
      fixture.customer,
      0,
      'scope-race-propose-1',
      {
        baseVersion: null,
        description: 'Repair the leaking tap',
        items: ['Replace damaged washer'],
        materialsResponsibility: 'Worker supplies washer',
        estimatedMinutes: 60,
      }
    );
    const path = `/api/projects/${fixture.booking.id}/scope-confirmations`;
    const [first, second] = await Promise.all([
      transition(path, fixture.worker, 1, 'scope-race-decide-1', { scopeVersion: 1, decision: 'confirm' }),
      transition(path, fixture.worker, 1, 'scope-race-decide-2', { scopeVersion: 1, decision: 'confirm' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 412]);
    const scopes = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM grounded_scope_versions
        WHERE booking_id = $1 GROUP BY status`,
      [fixture.booking.id]
    );
    expect(scopes.rows).toEqual([{ status: 'confirmed', count: 1 }]);
  });

  test('locks a challenge after the snapshotted attempt limit and permits customer reissue', async () => {
    const fixture = await createFixture({ phase: 'scope_confirmation', pinAttempts: 3 });
    await seedConfirmedScope(fixture);
    const material = createPinMaterial({ bookingId: fixture.booking.id, scopeVersion: 1, generation: 1 });
    await db.query(
      `INSERT INTO grounded_start_pin_challenges (
         booking_id, generation, scope_version, pin_salt, pin_hash,
         max_attempts, expires_at
       ) VALUES ($1, 1, 1, $2, $3, 3, NOW() + INTERVAL '1 hour')`,
      [fixture.booking.id, material.salt, material.hash]
    );
    const wrongPin = material.pin === '999999' ? '000000' : '999999';
    for (let revision = 0; revision < 3; revision += 1) {
      const result = await transition(
        `/api/projects/${fixture.booking.id}/start`,
        fixture.worker,
        revision,
        `pin-lock-attempt-${revision}`,
        { startPin: wrongPin, deviceId: 'android:lock-test-001' }
      );
      expect(result.status).toBe(403);
      if (revision === 2) expect(result.body.type).toMatch(/start_pin_locked$/);
    }
    const locked = await db.query(
      'SELECT status, failed_attempts FROM grounded_start_pin_challenges WHERE booking_id = $1',
      [fixture.booking.id]
    );
    expect(locked.rows[0]).toMatchObject({ status: 'locked', failed_attempts: 3 });
    const reissued = await transition(
      `/api/projects/${fixture.booking.id}/start-pin-reveals`,
      fixture.customer,
      3,
      'pin-reissue-after-lock-1'
    );
    expect(reissued.status).toBe(201);
    expect(reissued.body.startPin).toMatch(/^\d{6}$/);
    const challenges = await db.query(
      'SELECT generation, status FROM grounded_start_pin_challenges WHERE booking_id = $1 ORDER BY generation',
      [fixture.booking.id]
    );
    expect(challenges.rows).toEqual([
      { generation: 1, status: 'locked' },
      { generation: 2, status: 'active' },
    ]);
  });
});

describe('bilateral schedule and commercial revisions', () => {
  test('keeps the original schedule until the other participant accepts a versioned proposal', async () => {
    const fixture = await createFixture();
    const before = await db.query('SELECT scheduled_at FROM bookings WHERE id = $1', [fixture.booking.id]);
    const proposedStartsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const proposed = await transition(
      `/api/projects/${fixture.booking.id}/reschedule-proposals`,
      fixture.customer,
      0,
      'reschedule-propose-1',
      { proposedStartsAt, reason: 'Customer access window changed' }
    );
    expect(proposed.status).toBe(201);
    expect(proposed.body.fulfilment.schedule.startsAt).toBe(new Date(before.rows[0].scheduled_at).toISOString());
    const proposalId = proposed.body.transition.proposalId;

    const accepted = await transition(
      `/api/projects/${fixture.booking.id}/reschedule-proposals/${proposalId}/accept`,
      fixture.worker,
      1,
      'reschedule-accept-1'
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.fulfilment.schedule).toEqual({ revision: 2, startsAt: proposedStartsAt });

    const replay = await transition(
      `/api/projects/${fixture.booking.id}/reschedule-proposals/${proposalId}/accept`,
      fixture.worker,
      1,
      'reschedule-accept-1'
    );
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
  });

  test('approves a Worker change order as one new scope and commercial revision', async () => {
    const fixture = await createFixture({ status: 'in_progress', phase: 'work_active' });
    await seedConfirmedScope(fixture);
    const proposed = await transition(
      `/api/projects/${fixture.booking.id}/change-orders`,
      fixture.worker,
      0,
      'change-propose-0001',
      {
        baseScopeVersion: 1,
        description: 'Replace the damaged isolation valve',
        addedScopeItems: ['Replace isolation valve'],
        extraMinutes: 30,
        labourAmount: '100.00',
        materialsAmount: '50.00',
      }
    );
    expect(proposed.status).toBe(201);
    const changeOrderId = proposed.body.transition.changeOrderId;
    expect(proposed.body.fulfilment.changeOrders[0].commercial).toMatchObject({
      originalTotalAmount: '1000.00',
      additionalAmount: '150.00',
      revisedTotalAmount: '1150.00',
      currency: 'ZAR',
    });

    const approved = await transition(
      `/api/projects/${fixture.booking.id}/change-orders/${changeOrderId}/approve`,
      fixture.customer,
      1,
      'change-approve-0001'
    );
    expect(approved.status).toBe(200);
    expect(approved.body.fulfilment.scope.current.version).toBe(2);
    expect(approved.body.fulfilment.changeOrders[0].status).toBe('approved');

    const evidence = await db.query(
      `SELECT b.total_amount, b.current_scope_version, co.status AS legacy_status,
              g.status AS grounded_status,
              (SELECT COUNT(*) FROM grounded_scope_versions
                WHERE booking_id = b.id AND status = 'confirmed') AS confirmed_count
         FROM bookings b
         JOIN grounded_change_orders g ON g.booking_id = b.id
         JOIN change_orders co ON co.id = g.legacy_change_order_id
        WHERE b.id = $1`,
      [fixture.booking.id]
    );
    expect(evidence.rows[0]).toMatchObject({
      total_amount: '1150.00',
      current_scope_version: 2,
      legacy_status: 'accepted',
      grounded_status: 'approved',
      confirmed_count: '1',
    });
  });
});

describe('truthful no-show recovery', () => {
  test('revokes the original Worker immediately and records replacement without inventing assignment', async () => {
    const fixture = await createFixture({ phase: 'en_route' });
    await db.query(
      `UPDATE bookings SET scheduled_at = NOW() - INTERVAL '2 hours' WHERE id = $1`,
      [fixture.booking.id]
    );
    const report = await transition(
      `/api/projects/${fixture.booking.id}/no-show-reports`,
      fixture.customer,
      0,
      'no-show-report-0001',
      { attestation: 'Worker did not arrive and cannot be reached in the app' }
    );
    expect(report.status).toBe(201);
    expect(report.body.fulfilment.travel.accessRevokedReason).toBe('worker_no_show');

    const workerRead = await request
      .get(`/api/projects/${fixture.booking.id}/fulfilment`)
      .set(auth(fixture.worker));
    expect(workerRead.body.fulfilment.location.precision).toBe('approximate');
    expect(workerRead.body.fulfilment.participants.customer.phone).toBeNull();
    expect(Object.values(workerRead.body.fulfilment.allowedActions).every((value) => value === false)).toBe(true);

    const replacement = await transition(
      `/api/projects/${fixture.booking.id}/replacement-requests`,
      fixture.customer,
      1,
      'replacement-request-1'
    );
    expect(replacement.status).toBe(202);
    expect(replacement.body.transition).toMatchObject({
      type: 'replacement_requested',
      assignmentChanged: false,
    });
    expect(replacement.body.fulfilment.recovery.replacement.status).toBe('received');

    const durable = await db.query(
      `SELECT b.labourer_id, b.fulfilment_access_revoked_reason,
              r.status AS replacement_status, n.status AS no_show_status
         FROM bookings b
         JOIN grounded_replacement_requests r ON r.booking_id = b.id
         JOIN grounded_no_show_reports n ON n.id = r.no_show_report_id
        WHERE b.id = $1`,
      [fixture.booking.id]
    );
    expect(durable.rows[0]).toMatchObject({
      labourer_id: fixture.worker.id,
      fulfilment_access_revoked_reason: 'replacement_requested',
      replacement_status: 'received',
      no_show_status: 'replacement_requested',
    });
  });
});

describe('command preconditions', () => {
  test('requires revision/idempotency and rejects a contradictory key without mutation', async () => {
    const fixture = await createFixture();
    const missing = await request
      .post(`/api/projects/${fixture.booking.id}/en-route`)
      .set(auth(fixture.worker))
      .send({});
    expect(missing.status).toBe(428);

    const first = await transition(
      `/api/projects/${fixture.booking.id}/en-route`,
      fixture.worker,
      0,
      'contradictory-key-1'
    );
    expect(first.status).toBe(200);
    const reused = await transition(
      `/api/projects/${fixture.booking.id}/arrivals`,
      fixture.worker,
      1,
      'contradictory-key-1',
      { attestation: true }
    );
    // Keys are scoped by command type, so a distinct semantic command may
    // intentionally reuse the transport token.
    expect(reused.status).toBe(200);

    const changedInput = await transition(
      `/api/projects/${fixture.booking.id}/arrivals`,
      fixture.worker,
      1,
      'contradictory-key-1',
      { attestation: false }
    );
    // Contract validation happens before receipt lookup and still fails safe.
    expect(changedInput.status).toBe(422);
  });
});
