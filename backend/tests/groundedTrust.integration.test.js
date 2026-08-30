const crypto = require('crypto');
const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const groundedTrustRouter = require('../src/routes/groundedTrust');
const messageRouter = require('../src/routes/messages');
const { groundedTrustErrorHandler } = require('../src/middleware/groundedTrustErrors');
const { problemHandler } = require('../src/lib/problemJson');

const app = express();
app.use(express.json());
app.use('/api/messages', messageRouter);
app.use('/api', groundedTrustRouter);
app.use(groundedTrustErrorHandler);
app.use(problemHandler);
const request = supertest(app);

function future(days, hours = 0) {
  return new Date(Date.now() + ((days * 24 + hours) * 60 * 60 * 1000)).toISOString();
}

function token(user) {
  return signAccessToken({ id: user.id, role: user.role });
}

function auth(user) {
  return { Authorization: `Bearer ${token(user)}` };
}

function command(method, path, user, key, body = {}, revision) {
  let result = request[method](path)
    .set(auth(user))
    .set('Idempotency-Key', key);
  if (revision !== undefined) result = result.set('If-Match', String(revision));
  return result.send(body);
}

async function resetDatabase() {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
}

async function createUser(role, suffix) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, 'test-hash', $4, true)
     RETURNING id, name, role`,
    [
      role === 'customer' ? `Naledi ${suffix}` : `Thabo ${suffix}`,
      `${role}-${suffix}@trust.example.test`,
      role === 'customer' ? `082${suffix.padStart(7, '0')}` : `083${suffix.padStart(7, '0')}`,
      role,
    ]
  );
  const user = result.rows[0];
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (
         user_id, skills, hourly_rate, is_available, rating_avg, rating_count
       ) VALUES ($1, ARRAY['Plumbing'], 425.00, true, 4.80, 25)`,
      [user.id]
    );
  }
  return user;
}

async function attachRecurringAgreement(fixture) {
  const serviceId = crypto.randomUUID();
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key,
       label_en_za, description_en_za, pricing_mode, fulfilment_mode,
       risk_tier, cancellation_policy_version, recurrence_eligible,
       is_published, published_at
     ) VALUES (
       $1, 1, $2, 'plumbing', 'Plumbing repair', 'Synthetic test catalogue row.',
       'remote_quote', 'receive_quotes', 'standard', 'recurring-cancel-v1', true,
       true, NOW()
     )`,
    [serviceId, `plumbing_${serviceId.replace(/-/g, '')}`]
  );
  const requestResult = await db.query(
    `INSERT INTO grounded_quote_requests (
       customer_id, service_id, service_version, service_snapshot,
       brief_snapshot, broad_area_label, private_location_snapshot,
       schedule_snapshot, quotes_close_at
     ) VALUES ($1, $2, 1, $3::jsonb, $4::jsonb, 'Cape Town', $5::jsonb,
               $6::jsonb, NOW() + INTERVAL '2 days')
     RETURNING id`,
    [
      fixture.customer.id,
      serviceId,
      JSON.stringify({
        id: serviceId,
        version: 1,
        label: 'Plumbing repair',
        pricingMode: 'remote_quote',
        fulfilmentMode: 'receive_quotes',
      }),
      JSON.stringify({ answers: { issue: 'Tap repair' } }),
      JSON.stringify({ address: 'Private source address', latitude: -33.9, longitude: 18.4 }),
      JSON.stringify({ startsAt: future(7), timezone: 'Africa/Johannesburg' }),
    ]
  );
  const quoteResult = await db.query(
    `INSERT INTO grounded_quotes (
       quote_request_id, worker_id, status, current_version, submitted_at, accepted_at
     ) VALUES ($1, $2, 'accepted', 1, NOW(), NOW())
     RETURNING id`,
    [requestResult.rows[0].id, fixture.worker.id]
  );
  await db.query(
    `INSERT INTO grounded_quote_versions (
       quote_id, version, scope, deliverables, exclusions, assumptions,
       proposed_start_at, proposed_end_at, duration_minutes,
       labour_amount, materials_amount, valid_until, authored_as, content_hash
     ) VALUES (
       $1, 1, 'Repair the tap', '["Repair"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
       NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days 2 hours', 120,
       750.00, 100.00, NOW() + INTERVAL '1 day', 'submitted', $2
     )`,
    [quoteResult.rows[0].id, 'a'.repeat(64)]
  );
  await db.query(
    `INSERT INTO grounded_booking_agreement_snapshots (
       booking_id, quote_request_id, quote_id, quote_version,
       service_id, service_version, service_snapshot, scope_snapshot,
       commercial_snapshot, schedule_snapshot, accepted_by
     ) VALUES ($1, $2, $3, 1, $4, 1, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)`,
    [
      fixture.booking.id,
      requestResult.rows[0].id,
      quoteResult.rows[0].id,
      serviceId,
      JSON.stringify({
        id: serviceId,
        version: 1,
        label: 'Plumbing repair',
        pricingMode: 'remote_quote',
        fulfilmentMode: 'receive_quotes',
        workerEligibility: { internalEvidence: 'must-not-leak' },
      }),
      JSON.stringify({
        schemaVersion: 1,
        scope: 'Repair the tap',
        description: 'Repair the tap',
        items: [{ label: 'Repair' }],
        deliverables: ['Repair'],
        customerBrief: { privateNote: 'Gate code 1234' },
      }),
      JSON.stringify({
        schemaVersion: 1,
        pricingMode: 'remote_quote',
        labourAmount: '750.00',
        materialsAmount: '100.00',
        customerTotalAmount: '850.00',
        currency: 'ZAR',
        workerNet: { state: 'not_available', amount: null },
        platformFee: { state: 'not_configured', amount: null },
      }),
      JSON.stringify({ startsAt: future(7), timezone: 'Africa/Johannesburg' }),
      fixture.customer.id,
    ]
  );
}

async function createFixture({ eligible = true, withAgreement = false, status = 'completed' } = {}) {
  const suffix = String(Math.floor(Math.random() * 8_000_000) + 1_000_000);
  const customer = await createUser('customer', suffix);
  const worker = await createUser('labourer', String(Number(suffix) + 1));
  const outsider = await createUser('customer', String(Number(suffix) + 2));
  const bookingResult = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, hours_est,
       total_amount, scope_items, completed_at
     ) VALUES (
       $1, $2, $3, $4, 'Plumbing', '12 Private Street, Cape Town',
       -33.92, 18.42, NOW() + INTERVAL '7 days', 2.0, 850.00,
       $5::jsonb, $6
     ) RETURNING *`,
    [
      customer.id,
      worker.id,
      status,
      status === 'completed' ? 'closed' : 'work_active',
      JSON.stringify([{ label: 'Repair tap', privatePhone: '0821234567' }]),
      status === 'completed' ? new Date() : null,
    ]
  );
  const booking = bookingResult.rows[0];
  const paymentResult = await db.query(
    `INSERT INTO payments (booking_id, amount, currency, status)
     VALUES ($1, 850.00, 'ZAR', $2)
     RETURNING *`,
    [booking.id, eligible ? 'paid' : 'pending']
  );
  if (status === 'completed') {
    const snapshot = await db.query(
      `INSERT INTO grounded_project_commercial_snapshots (
         booking_id, version, booking_revision, agreed_total_amount,
         estimated_hours, service_label, scope_items,
         payment_status_at_capture, capture_reason
       ) VALUES ($1, 1, 0, 850.00, 2.0, 'Plumbing', $2::jsonb, $3,
                 'completion_requested')
       RETURNING id`,
      [booking.id, JSON.stringify(booking.scope_items), paymentResult.rows[0].status]
    );
    await db.query(
      `INSERT INTO grounded_project_completions (
         booking_id, status, requested_by, snapshot_id, decided_by, decided_at
       ) VALUES ($1, 'confirmed', $2, $3, $4, NOW())`,
      [booking.id, worker.id, snapshot.rows[0].id, customer.id]
    );
  }
  const fixture = { customer, worker, outsider, booking };
  if (withAgreement) await attachRecurringAgreement(fixture);
  return fixture;
}

function seriesBody(sourceBookingId, offset = 0) {
  return {
    sourceBookingId,
    schedule: {
      timezone: 'Africa/Johannesburg',
      occurrences: [future(14 + offset), future(21 + offset), future(28 + offset)],
    },
    substitutionPolicy: 'explicit_approval_each_time',
  };
}

async function createRecurringSeries(fixture, key = 'create-series-key') {
  return command(
    'post',
    '/api/recurring-series',
    fixture.customer,
    key,
    seriesBody(fixture.booking.id)
  );
}

beforeEach(resetDatabase);

afterAll(async () => {
  await db.end();
});

describe('Safety and Support Centre truth contract', () => {
  test('fails closed for operated SOS/dispatch and creates no incident', async () => {
    const fixture = await createFixture({ status: 'in_progress' });
    const result = await command(
      'post',
      '/api/safety/incidents',
      fixture.customer,
      'unsupported-sos-key',
      {
        bookingId: fixture.booking.id,
        category: 'immediate_danger',
        summary: 'Immediate assistance requested',
        requestedChannel: 'operated_sos',
      }
    );
    expect(result.status).toBe(503);
    expect(result.body.type).toMatch(/operated_sos_unavailable$/);
    expect(result.body.extensions).toMatchObject({
      available: false,
      reasonCode: 'operations_acknowledgement_not_staffed',
    });
    expect(result.body.extensions.emergencyFallback.togtDispatch).toBe(false);
    expect(result.body.extensions.emergencyFallback.options.map((option) => option.number))
      .toEqual(['112', '10111']);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM grounded_support_incidents')).rows[0].count)
      .toBe(0);
  });

  test('records a restricted case idempotently without fake acknowledgement and keeps narrative out of list/events', async () => {
    const fixture = await createFixture({ status: 'in_progress' });
    const body = {
      bookingId: fixture.booking.id,
      category: 'unsafe_work',
      summary: 'Private narrative at 12 Private Street, phone 0821234567',
      requestedChannel: 'in_app_record',
    };
    const first = await command(
      'post', '/api/safety/incidents', fixture.worker, 'safety-record-key', body
    );
    const replay = await command(
      'post', '/api/safety/incidents', fixture.worker, 'safety-record-key', body
    );
    expect(first.status).toBe(201);
    expect(first.body.incident).toMatchObject({
      state: 'received',
      channel: {
        accepted: 'in_app_record',
        supportLevel: 'record_only',
        operationsAlerted: false,
        humanAcknowledgementExpected: false,
        emergencyServicesDispatched: false,
      },
    });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);

    const list = await request.get('/api/safety/incidents').set(auth(fixture.worker));
    expect(list.status).toBe(200);
    expect(list.body.incidents).toHaveLength(1);
    expect(list.body.incidents[0]).not.toHaveProperty('summary');
    const detail = await request
      .get(`/api/safety/incidents/${first.body.incident.id}`)
      .set(auth(fixture.worker));
    expect(detail.body.incident.summary).toBe(body.summary);
    const outsider = await request
      .get(`/api/safety/incidents/${first.body.incident.id}`)
      .set(auth(fixture.outsider));
    expect(outsider.status).toBe(404);

    const event = await db.query(
      `SELECT e.payload, o.payload AS outbox_payload
         FROM grounded_trust_events e
         JOIN grounded_trust_outbox o ON o.event_id = e.id
        WHERE e.aggregate_id = $1`,
      [first.body.incident.id]
    );
    expect(JSON.stringify(event.rows[0])).not.toContain('Private narrative');
    expect(JSON.stringify(event.rows[0])).not.toContain('0821234567');
    expect((await db.query(
      `SELECT COUNT(*)::int AS count FROM audit_log
        WHERE resource_type = 'safety_incident' AND resource_id = $1`,
      [first.body.incident.id]
    )).rows[0].count).toBe(1);
  });

  test('unavailable operations mutations leave received state unchanged and open safety blocks completion', async () => {
    const fixture = await createFixture({ status: 'in_progress' });
    const created = await command(
      'post', '/api/safety/incidents', fixture.customer, 'safety-state-key', {
        bookingId: fixture.booking.id,
        category: 'injury',
        summary: 'An injury needs to be recorded',
        requestedChannel: 'in_app_record',
      }
    );
    const operation = await command(
      'post',
      `/api/operations/safety-incidents/${created.body.incident.id}/acknowledge`,
      fixture.customer,
      'fake-ops-key',
      {}
    );
    expect(operation.status).toBe(503);
    expect(operation.body.extensions.stateChanged).toBe(false);
    const row = await db.query(
      'SELECT state, acknowledged_at FROM grounded_support_incidents WHERE id = $1',
      [created.body.incident.id]
    );
    expect(row.rows[0]).toEqual({ state: 'received', acknowledged_at: null });
    await expect(db.query(
      `UPDATE bookings SET status = 'completed' WHERE id = $1`,
      [fixture.booking.id]
    )).rejects.toMatchObject({ code: '23514' });
  });

  test('support cases are separated from safety incidents', async () => {
    const fixture = await createFixture({ status: 'in_progress' });
    const created = await command(
      'post', '/api/support/cases', fixture.customer, 'support-case-key', {
        category: 'account_help',
        summary: 'I need help updating my account',
        requestedChannel: 'in_app_record',
      }
    );
    expect(created.status).toBe(201);
    const safety = await request.get('/api/safety/incidents').set(auth(fixture.customer));
    const support = await request.get('/api/support/cases').set(auth(fixture.customer));
    expect(safety.body.meta.count).toBe(0);
    expect(support.body.meta.count).toBe(1);
  });
});

describe('relationship eligibility, favourites, blocking and rebook drafts', () => {
  test('favourite fails closed without paid reconciliation and succeeds idempotently with evidence', async () => {
    const ineligible = await createFixture({ eligible: false });
    const denied = await command('post', '/api/favourites', ineligible.customer, 'fav-denied-key', {
      workerId: ineligible.worker.id,
      sourceBookingId: ineligible.booking.id,
    });
    expect(denied.status).toBe(409);
    expect(denied.body.type).toMatch(/relationship_not_eligible$/);
    const ineligibleRead = await request
      .get(`/api/bookings/${ineligible.booking.id}/relationship-eligibility`)
      .set(auth(ineligible.customer));
    expect(ineligibleRead.body.relationship).toMatchObject({
      relationshipEligible: false,
      reasonCode: 'requirements_not_met',
      actions: { favourite: false, rebookDraft: false, createRecurringSeries: false, block: true },
    });
    expect(ineligibleRead.body.relationship).not.toHaveProperty('openIssue');

    await resetDatabase();
    const eligible = await createFixture();
    const body = { workerId: eligible.worker.id, sourceBookingId: eligible.booking.id };
    const first = await command('post', '/api/favourites', eligible.customer, 'fav-create-key', body);
    const replay = await command('post', '/api/favourites', eligible.customer, 'fav-create-key', body);
    expect(first.status).toBe(201);
    expect(first.body.favourite.worker.displayName).toContain('Thabo');
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect((await db.query('SELECT COUNT(*)::int AS count FROM grounded_favourites')).rows[0].count)
      .toBe(1);
    const eligibleRead = await request
      .get(`/api/bookings/${eligible.booking.id}/relationship-eligibility`)
      .set(auth(eligible.customer));
    expect(eligibleRead.body.relationship.relationshipEligible).toBe(true);
    expect(eligibleRead.body.relationship.actions).toMatchObject({
      favourite: true,
      rebookDraft: true,
      createRecurringSeries: false,
      block: true,
    });
    const outsiderRead = await request
      .get(`/api/bookings/${eligible.booking.id}/relationship-eligibility`)
      .set(auth(eligible.outsider));
    expect(outsiderRead.status).toBe(404);
  });

  test('eligibility uses the latest canonical payment state and treats legacy safety records as unresolved', async () => {
    const refunded = await createFixture();
    await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status, created_at)
       VALUES ($1, 850.00, 'ZAR', 'refunded', NOW() + INTERVAL '1 second')`,
      [refunded.booking.id]
    );
    const afterRefund = await command('post', '/api/favourites', refunded.customer, 'fav-refund-key', {
      workerId: refunded.worker.id,
      sourceBookingId: refunded.booking.id,
    });
    expect(afterRefund.status).toBe(409);

    await resetDatabase();
    const legacySafety = await createFixture();
    await db.query(
      `INSERT INTO sos_events (user_id, booking_id) VALUES ($1, $2)`,
      [legacySafety.customer.id, legacySafety.booking.id]
    );
    const afterLegacySafety = await command(
      'post', '/api/favourites', legacySafety.customer, 'fav-legacy-safety-key', {
        workerId: legacySafety.worker.id,
        sourceBookingId: legacySafety.booking.id,
      }
    );
    expect(afterLegacySafety.status).toBe(409);
  });

  test('a bilateral block invalidates relationship surfaces and is enforced at matching, booking and message writes', async () => {
    const fixture = await createFixture();
    await command('post', '/api/favourites', fixture.customer, 'fav-before-block', {
      workerId: fixture.worker.id,
      sourceBookingId: fixture.booking.id,
    });
    const draft = await command(
      'post',
      `/api/bookings/${fixture.booking.id}/rebook-drafts`,
      fixture.customer,
      'rebook-before-block',
      {}
    );
    const blocked = await command('post', '/api/blocks', fixture.worker, 'worker-block-key', {
      blockedUserId: fixture.customer.id,
      sourceBookingId: fixture.booking.id,
      reasonCode: 'do_not_match',
    });
    expect(blocked.status).toBe(201);
    expect(blocked.body.block.effects).toEqual({
      futureMatchingAllowed: false,
      newContactAllowed: false,
      recurringRelationshipAllowed: false,
    });
    expect(blocked.body.transition.favouriteRemoved).toBe(true);
    expect((await db.query(
      `SELECT COUNT(*)::int AS count FROM grounded_favourites WHERE status = 'active'`
    )).rows[0].count).toBe(0);
    expect((await db.query(
      `SELECT status FROM grounded_rebook_drafts WHERE id = $1`,
      [draft.body.rebookDraft.id]
    )).rows[0].status).toBe('blocked');
    const cascadeEvents = await db.query(
      `SELECT event_type FROM grounded_trust_events
        WHERE event_type IN ('relationship.favourite_blocked', 'rebook.draft_blocked')
        ORDER BY event_type`,
    );
    expect(cascadeEvents.rows.map((row) => row.event_type)).toEqual([
      'rebook.draft_blocked',
      'relationship.favourite_blocked',
    ]);

    await expect(db.query(
      `INSERT INTO messages (booking_id, sender_id, body) VALUES ($1, $2, 'hello')`,
      [fixture.booking.id, fixture.customer.id]
    )).rejects.toMatchObject({ code: '42501' });
    const blockedMessage = await request
      .post(`/api/messages/${fixture.booking.id}`)
      .set(auth(fixture.customer))
      .send({ body: 'This must not be delivered' });
    expect(blockedMessage.status).toBe(409);
    expect(blockedMessage.body.type).toMatch(/relationship_block_active$/);
    expect(blockedMessage.body.extensions.newContactAllowed).toBe(false);
    await expect(db.query(
      `INSERT INTO bookings (
         customer_id, labourer_id, skill_needed, address, location_lat,
         location_lng, scheduled_at
       ) VALUES ($1, $2, 'Plumbing', 'Another address', -33.9, 18.4,
                 NOW() + INTERVAL '2 days')`,
      [fixture.customer.id, fixture.worker.id]
    )).rejects.toMatchObject({ code: '42501' });
    const matchRequest = await db.query(
      `INSERT INTO match_requests (
         customer_id, skill_needed, address, location_lat, location_lng,
         scheduled_at, expires_at
       ) VALUES ($1, 'Plumbing', 'Private', -33.9, 18.4,
                 NOW() + INTERVAL '2 days', NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [fixture.customer.id]
    );
    await expect(db.query(
      `INSERT INTO match_attempts (match_request_id, labourer_id) VALUES ($1, $2)`,
      [matchRequest.rows[0].id, fixture.worker.id]
    )).rejects.toMatchObject({ code: '42501' });

    const reFavourite = await command('post', '/api/favourites', fixture.customer, 'fav-after-block', {
      workerId: fixture.worker.id,
      sourceBookingId: fixture.booking.id,
    });
    expect(reFavourite.status).toBe(409);
  });

  test('rebook produces an editable private draft and never submits, prices or substitutes', async () => {
    const fixture = await createFixture({ withAgreement: true });
    await db.query(
      `INSERT INTO grounded_scope_versions (
         booking_id, version, base_version, status, source,
         proposed_by, proposed_by_role, scope_snapshot,
         customer_confirmed_by, customer_confirmed_at,
         worker_confirmed_by, worker_confirmed_at
       ) VALUES (
         $1, 1, NULL, 'superseded', 'accepted_agreement',
         $2, 'labourer', $3::jsonb, $4, NOW(), $2, NOW()
       )`,
      [
        fixture.booking.id,
        fixture.worker.id,
        JSON.stringify({ description: 'Repair the tap', items: [{ label: 'Repair' }] }),
        fixture.customer.id,
      ]
    );
    await db.query(
      `INSERT INTO grounded_scope_versions (
         booking_id, version, base_version, status, source,
         proposed_by, proposed_by_role, scope_snapshot,
         customer_confirmed_by, customer_confirmed_at,
         worker_confirmed_by, worker_confirmed_at
       ) VALUES (
         $1, 2, 1, 'confirmed', 'approved_change_order',
         $2, 'labourer', $3::jsonb, $4, NOW(), $2, NOW()
       )`,
      [
        fixture.booking.id,
        fixture.worker.id,
        JSON.stringify({
          description: 'Repair the tap and replace the isolation valve',
          items: [{ label: 'Repair' }, 'Replace isolation valve'],
        }),
        fixture.customer.id,
      ]
    );
    await db.query(
      `UPDATE bookings
          SET current_scope_version = 2,
              scope_items = $2::jsonb
        WHERE id = $1`,
      [fixture.booking.id, JSON.stringify([{ label: 'Repair' }, 'Replace isolation valve'])]
    );
    const before = (await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count;
    const created = await command(
      'post',
      `/api/bookings/${fixture.booking.id}/rebook-drafts`,
      fixture.customer,
      'rebook-create-key',
      {}
    );
    expect(created.status).toBe(201);
    expect(created.body.rebookDraft).toMatchObject({
      status: 'draft',
      preferredWorker: { id: fixture.worker.id },
      confirmationsRequired: {
        currentPrice: true,
        location: true,
        schedule: true,
        workerAvailability: true,
      },
      substitution: {
        policy: 'none',
        alternativeRequiresExplicitSelection: true,
      },
      submission: {
        submitted: false,
        bookingCreated: false,
        supportedByThisEndpoint: false,
      },
    });
    expect(created.body.rebookDraft.editableScope.items).toEqual(['Repair', 'Replace isolation valve']);
    expect(created.body.rebookDraft.editableScope.materialsResponsibility)
      .toBe('Materials responsibility was not separately recorded in this accepted agreement.');
    expect(created.body.rebookDraft).not.toHaveProperty('price');
    expect(created.body.rebookDraft).not.toHaveProperty('address');
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count)
      .toBe(before);

    const draft = created.body.rebookDraft;
    const updated = await command(
      'patch',
      `/api/rebook-drafts/${draft.id}`,
      fixture.customer,
      'rebook-update-key',
      {
        editableScope: { items: [{ label: 'Repair two taps' }] },
        broadAreaLabel: 'Rondebosch, Cape Town',
        requestedStartsAt: future(10),
      },
      draft.revision
    );
    expect(updated.status).toBe(200);
    expect(updated.body.rebookDraft.revision).toBe(2);
    expect(updated.body.rebookDraft.editableScope.items[0].label).toBe('Repair two taps');
    const stale = await command(
      'patch',
      `/api/rebook-drafts/${draft.id}`,
      fixture.customer,
      'rebook-stale-key',
      { broadAreaLabel: 'Claremont' },
      1
    );
    expect(stale.status).toBe(412);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count)
      .toBe(before);
  });
});

describe('mutually controlled recurring series', () => {
  test('creates all proposed occurrences atomically and activates only after counterpart acceptance', async () => {
    const fixture = await createFixture({ withAgreement: true });
    const beforeBookings = (await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count;
    const created = await createRecurringSeries(fixture);
    expect(created.status).toBe(201);
    expect(created.body.recurringSeries.status).toBe('awaiting_acceptance');
    expect(created.body.recurringSeries.acceptances).toHaveLength(1);
    expect(created.body.recurringSeries.occurrences).toHaveLength(3);
    expect(created.body.recurringSeries.occurrences.every((item) => item.status === 'proposed')).toBe(true);
    expect(created.body.recurringSeries.controls).toMatchObject({
      bookingCreationIsAutomatic: false,
      eachOccurrenceRequiresBookingConfirmation: true,
      substitutionIsAutomatic: false,
      mutualAcceptanceRequired: true,
    });
    expect(JSON.stringify(created.body)).not.toContain('must-not-leak');
    expect(JSON.stringify(created.body)).not.toContain('workerNet');
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count)
      .toBe(beforeBookings);

    const selfAccept = await command(
      'patch',
      `/api/recurring-series/${created.body.recurringSeries.id}`,
      fixture.customer,
      'series-self-accept',
      { action: 'accept_terms' },
      1
    );
    expect(selfAccept.status).toBe(403);

    const accepted = await command(
      'patch',
      `/api/recurring-series/${created.body.recurringSeries.id}`,
      fixture.worker,
      'series-worker-accept',
      { action: 'accept_terms' },
      1
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.recurringSeries.status).toBe('active');
    expect(accepted.body.recurringSeries.revision).toBe(2);
    expect(accepted.body.recurringSeries.acceptances).toHaveLength(2);
    expect(accepted.body.recurringSeries.occurrences.every((item) => item.status === 'planned')).toBe(true);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count)
      .toBe(beforeBookings);
  });

  test('same-key acceptance race replays once while different-key stale race has one winner', async () => {
    const fixture = await createFixture({ withAgreement: true });
    const created = await createRecurringSeries(fixture, 'series-race-create');
    const seriesId = created.body.recurringSeries.id;
    const sameKeyResponses = await Promise.all([
      command('patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'same-accept-key', { action: 'accept_terms' }, 1),
      command('patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'same-accept-key', { action: 'accept_terms' }, 1),
    ]);
    expect(sameKeyResponses.map((result) => result.status)).toEqual([200, 200]);
    expect(sameKeyResponses.filter((result) => result.headers['idempotent-replay'] === 'true'))
      .toHaveLength(1);

    await resetDatabase();
    const secondFixture = await createFixture({ withAgreement: true });
    const secondCreated = await createRecurringSeries(secondFixture, 'series-race-two-create');
    const secondId = secondCreated.body.recurringSeries.id;
    const distinct = await Promise.all([
      command('patch', `/api/recurring-series/${secondId}`, secondFixture.worker, 'race-key-one', { action: 'accept_terms' }, 1),
      command('patch', `/api/recurring-series/${secondId}`, secondFixture.worker, 'race-key-two', { action: 'accept_terms' }, 1),
    ]);
    expect(distinct.map((result) => result.status).sort()).toEqual([200, 412]);
    const eventCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM grounded_trust_events
        WHERE aggregate_id = $1 AND event_type = 'recurring_series.terms_accepted'`,
      [secondId]
    );
    expect(eventCount.rows[0].count).toBe(1);
  });

  test('terms changes, pause/resume, one-occurrence edits and whole-series cancellation preserve mutual control', async () => {
    const fixture = await createFixture({ withAgreement: true });
    const created = await createRecurringSeries(fixture, 'series-control-create');
    const seriesId = created.body.recurringSeries.id;
    let state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-control-accept',
      { action: 'accept_terms' }, 1
    )).body.recurringSeries;

    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.customer, 'series-new-terms',
      {
        action: 'propose_terms',
        schedule: {
          timezone: 'Africa/Johannesburg',
          occurrences: [future(35), future(42)],
        },
        substitutionPolicy: 'no_substitution',
      },
      state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('terms_change_pending');
    expect(state.currentTerms.revision).toBe(1);
    expect(state.proposedTerms.revision).toBe(2);
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-new-terms-accept',
      { action: 'accept_terms' }, state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('active');
    expect(state.currentTerms.revision).toBe(2);
    expect(state.occurrences.filter((item) => item.termsRevision === 1)
      .every((item) => item.status === 'superseded')).toBe(true);

    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-pause',
      { action: 'pause' }, state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('paused');
    expect(state.occurrences.filter((item) => item.termsRevision === 2)
      .every((item) => item.status === 'held')).toBe(true);
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-resume-request',
      { action: 'request_resume' }, state.revision
    )).body.recurringSeries;
    expect(state.pendingRequests).toEqual({
      resumeRequestedByRole: 'worker',
      cancellationRequestedByRole: null,
    });
    const customerResumeView = await request
      .get(`/api/recurring-series/${seriesId}`)
      .set(auth(fixture.customer));
    expect(customerResumeView.status).toBe(200);
    expect(customerResumeView.body.recurringSeries.pendingRequests.resumeRequestedByRole)
      .toBe('worker');
    const requesterCannotAccept = await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-resume-self',
      { action: 'accept_resume' }, state.revision
    );
    expect(requesterCannotAccept.status).toBe(403);
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.customer, 'series-resume-accept',
      { action: 'accept_resume' }, state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('active');
    expect(state.pendingRequests).toEqual({
      resumeRequestedByRole: null,
      cancellationRequestedByRole: null,
    });

    const occurrence = state.occurrences.find(
      (item) => item.termsRevision === 2 && item.status === 'planned'
    );
    const proposedOccurrenceTime = future(50);
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.customer, 'occ-change-request',
      {
        action: 'request_occurrence_change',
        occurrenceId: occurrence.id,
        changeKind: 'reschedule',
        proposedScheduledAt: proposedOccurrenceTime,
      },
      state.revision
    )).body.recurringSeries;
    const pendingChange = state.pendingOccurrenceChanges[0];
    const selfDecision = await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.customer, 'occ-change-self',
      { action: 'accept_occurrence_change', changeRequestId: pendingChange.id }, state.revision
    );
    expect(selfDecision.status).toBe(403);
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'occ-change-accept',
      { action: 'accept_occurrence_change', changeRequestId: pendingChange.id }, state.revision
    )).body.recurringSeries;
    const rescheduled = state.occurrences.find((item) => item.id === occurrence.id);
    expect(rescheduled.scheduledAt).toBe(new Date(proposedOccurrenceTime).toISOString());
    expect(state.occurrences.filter((item) => item.termsRevision === 2 && item.id !== occurrence.id))
      .toHaveLength(1);

    const bookingCount = (await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count;
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.customer, 'series-cancel-request',
      { action: 'request_cancel_series' }, state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('cancellation_requested');
    expect(state.pendingRequests).toEqual({
      resumeRequestedByRole: null,
      cancellationRequestedByRole: 'customer',
    });
    const workerCancellationView = await request
      .get(`/api/recurring-series/${seriesId}`)
      .set(auth(fixture.worker));
    expect(workerCancellationView.status).toBe(200);
    expect(workerCancellationView.body.recurringSeries.pendingRequests.cancellationRequestedByRole)
      .toBe('customer');
    state = (await command(
      'patch', `/api/recurring-series/${seriesId}`, fixture.worker, 'series-cancel-accept',
      { action: 'accept_cancel_series' }, state.revision
    )).body.recurringSeries;
    expect(state.status).toBe('cancelled');
    expect((await db.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count)
      .toBe(bookingCount);
    const cancelledEvent = await db.query(
      `SELECT payload FROM grounded_trust_events
        WHERE aggregate_id = $1 AND event_type = 'recurring_series.cancelled'`,
      [seriesId]
    );
    expect(cancelledEvent.rows[0].payload).toMatchObject({
      wholeSeries: true,
      linkedBookingsMutated: false,
    });
  });
});
