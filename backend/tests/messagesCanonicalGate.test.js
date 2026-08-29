const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

async function createFixture({ status = 'accepted', phase = 'scheduled', canonical = true } = {}) {
  const customer = await registerUser({ role: 'customer' });
  const worker = await registerUser({ role: 'labourer' });
  const inserted = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at
     ) VALUES ($1, $2, $3, $4, 'Plumbing', '1 Private Test Road',
               -33.9249, 18.4241, NOW() + INTERVAL '1 hour')
     RETURNING *`,
    [customer.user.id, worker.user.id, status, phase]
  );
  const booking = inserted.rows[0];
  if (canonical) {
    await db.query(
      `INSERT INTO grounded_fulfilment_policy_snapshots (
         booking_id, policy_version, source, route_reveal_lead_minutes,
         arrival_evidence_mode, no_show_grace_minutes, start_pin_ttl_minutes,
         start_pin_max_attempts, reschedule_expiry_minutes,
         change_order_expiry_minutes
       ) VALUES ($1, 'message-test-v1', 'operations_override', 60,
                 'worker_attestation', 15, 60, 3, 120, 120)`,
      [booking.id]
    );
  }
  return { booking, customer, worker };
}

beforeEach(async () => {
  await truncateAll();
  app.set('io', undefined);
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('canonical Project chat retention gate', () => {
  test.each([
    ['completed', 'closed'],
    ['cancelled', 'scheduled'],
  ])('%s canonical Projects reject writes without storage or broadcast', async (status, phase) => {
    const fixture = await createFixture({ status, phase });
    const emit = jest.fn();
    app.set('io', { of: jest.fn(() => ({ to: jest.fn(() => ({ emit })) })) });

    const response = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.customer.accessToken))
      .send({ body: 'This must remain unsent' });

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.type).toMatch(/\/errors\/canonical_chat_read_only$/);
    expect(response.body.extensions.projectId).toBe(fixture.booking.id);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  test('active canonical chat still writes and broadcasts for a participant', async () => {
    const fixture = await createFixture();
    const emit = jest.fn();
    app.set('io', { of: jest.fn(() => ({ to: jest.fn(() => ({ emit })) })) });

    const response = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.worker.accessToken))
      .set('Idempotency-Key', 'active-message-send-001')
      .send({ body: '  On my way  ' });

    expect(response.status).toBe(201);
    expect(response.body.message.body).toBe('On my way');
    expect(emit).toHaveBeenCalledWith('new_message', expect.objectContaining({
      booking_id: fixture.booking.id,
      sender_id: fixture.worker.user.id,
    }));

    const replay = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.worker.accessToken))
      .set('Idempotency-Key', 'active-message-send-001')
      .send({ body: 'On my way' });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(response.body);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);

    const conflict = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.worker.accessToken))
      .set('Idempotency-Key', 'active-message-send-001')
      .send({ body: 'A different message' });
    expect(conflict.status).toBe(422);
    expect(conflict.body.type).toMatch(/\/errors\/idempotency_key_reused$/);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM grounded_message_command_receipts WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);

    await db.query(
      `UPDATE bookings SET status = 'completed', operational_phase = 'closed'
        WHERE id = $1`,
      [fixture.booking.id]
    );
    const replayAfterClosure = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.worker.accessToken))
      .set('Idempotency-Key', 'active-message-send-001')
      .send({ body: 'On my way' });
    expect(replayAfterClosure.status).toBe(201);
    expect(replayAfterClosure.headers['idempotent-replay']).toBe('true');
    expect(replayAfterClosure.body).toEqual(response.body);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('active canonical chat requires a durable command key', async () => {
    const fixture = await createFixture();
    const response = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.customer.accessToken))
      .send({ body: 'Ambiguous retry risk' });

    expect(response.status).toBe(400);
    expect(response.body.type).toMatch(/\/errors\/idempotency_key_required$/);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(0);
  });

  test('concurrent ambiguous retries create and broadcast exactly one message', async () => {
    const fixture = await createFixture();
    const emit = jest.fn();
    app.set('io', { of: jest.fn(() => ({ to: jest.fn(() => ({ emit })) })) });
    const send = () => request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.customer.accessToken))
      .set('Idempotency-Key', 'concurrent-message-send-001')
      .send({ body: 'Please bring a wrench' });

    const responses = await Promise.all([send(), send()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses.filter((response) => response.headers['idempotent-replay'] === 'true')).toHaveLength(1);
    expect(responses[0].body).toEqual(responses[1].body);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(1);
    expect((await db.query(
      'SELECT COUNT(*)::int AS count FROM grounded_message_command_receipts WHERE booking_id = $1',
      [fixture.booking.id]
    )).rows[0].count).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('terminal chat remains participant-readable, private and non-cacheable', async () => {
    const fixture = await createFixture({ status: 'completed', phase: 'closed' });
    const outsider = await registerUser({ role: 'customer' });
    await db.query(
      `INSERT INTO messages (booking_id, sender_id, body)
       VALUES ($1, $2, 'Preserved Project history')`,
      [fixture.booking.id, fixture.customer.user.id]
    );

    const participant = await request(app)
      .get(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.worker.accessToken));
    expect(participant.status).toBe(200);
    expect(participant.headers['cache-control']).toContain('private');
    expect(participant.headers['cache-control']).toContain('no-store');
    expect(participant.headers.vary).toContain('Authorization');
    expect(participant.body.messages).toHaveLength(1);
    expect(participant.body.messages[0].body).toBe('Preserved Project history');

    const denied = await request(app)
      .get(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(outsider.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.headers['cache-control']).toContain('no-store');
    expect(denied.body.messages).toBeUndefined();
  });

  test('genuine legacy terminal bookings retain the existing compatibility path', async () => {
    const fixture = await createFixture({ status: 'completed', phase: 'closed', canonical: false });

    const response = await request(app)
      .post(`/api/messages/${fixture.booking.id}`)
      .set(authHeader(fixture.customer.accessToken))
      .send({ body: 'Legacy follow-up' });

    expect(response.status).toBe(201);
    expect(response.body.message.body).toBe('Legacy follow-up');
  });
});
