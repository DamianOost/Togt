const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const { decryptSecret } = require('../src/lib/webhookSecretCrypto');

describe('webhooks schema (migration 014)', () => {
  test('webhook_subscriptions table exists with expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'webhook_subscriptions' ORDER BY ordinal_position
    `);
    const cols = Object.fromEntries(rows.map(r => [r.column_name, r.data_type]));
    expect(cols.id).toBe('uuid');
    expect(cols.owner_user_id).toBe('uuid');
    expect(cols.url).toBe('text');
    expect(cols.secret_encrypted).toBe('text');
    expect(cols.secret_previous_encrypted).toBe('text');
    expect(cols.secret_previous_expires_at).toBe('timestamp with time zone');
    expect(cols.event_types).toBe('ARRAY');
    expect(cols.enabled).toBe('boolean');
    expect(cols.consecutive_failures).toBe('integer');
  });

  test('webhook_deliveries table exists with expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'webhook_deliveries' ORDER BY ordinal_position
    `);
    const cols = Object.fromEntries(rows.map(r => [r.column_name, r.data_type]));
    expect(cols.id).toBe('uuid');
    expect(cols.subscription_id).toBe('uuid');
    expect(cols.event_id).toBe('uuid');
    expect(cols.event_type).toBe('text');
    expect(cols.payload).toBe('jsonb');
    expect(cols.attempt_count).toBe('integer');
    expect(cols.status).toBe('text');
    expect(cols.next_retry_at).toBe('timestamp with time zone');
  });
});

describe('webhook-subscriptions REST', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    if (db.end) await db.end();
  });

  test('POST creates subscription, returns secret once, stores it encrypted', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/hook', event_types: ['booking.created', 'booking.completed'], description: 'test' });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    expect(res.body.url).toBe('https://example.test/hook');
    expect(res.body.event_types).toEqual(['booking.created', 'booking.completed']);

    const { rows } = await db.query("SELECT secret_encrypted FROM webhook_subscriptions WHERE id = $1", [res.body.id]);
    expect(rows[0].secret_encrypted).not.toContain(res.body.secret.slice(6));
    expect(decryptSecret(rows[0].secret_encrypted)).toBe(res.body.secret);
  });

  test('POST rejects unknown event_types with RFC 9457 problem', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/h', event_types: ['something.invented'] });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.type).toMatch(/errors\/unknown-event-type/);
    expect(res.body.extensions.unknown).toEqual(['something.invented']);
  });

  test('POST rejects empty event_types', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/h', event_types: [] });
    expect(res.status).toBe(400);
    expect(res.body.type).toMatch(/errors\/invalid-event-types/);
  });

  test('POST rejects malformed url', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'not-a-url', event_types: ['booking.created'] });
    expect(res.status).toBe(400);
    expect(res.body.type).toMatch(/errors\/invalid-webhook-url/);
  });

  test('GET lists my subscriptions without secret field', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/h', event_types: ['booking.created'] });
    const res = await request(app)
      .get('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.subscriptions)).toBe(true);
    expect(res.body.subscriptions.length).toBe(1);
    for (const s of res.body.subscriptions) {
      expect(s.secret).toBeUndefined();
      expect(s.secret_encrypted).toBeUndefined();
      expect(s.secret_previous_encrypted).toBeUndefined();
    }
  });

  test('DELETE removes subscription owned by caller', async () => {
    const u = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/del', event_types: ['booking.created'] });
    const id = create.body.id;
    const del = await request(app)
      .delete(`/api/webhook-subscriptions/${id}`)
      .set(authHeader(u.accessToken));
    expect(del.status).toBe(204);

    const { rows } = await db.query("SELECT id FROM webhook_subscriptions WHERE id = $1", [id]);
    expect(rows).toHaveLength(0);
  });

  test('DELETE another user subscription returns 404 (no info leak)', async () => {
    const owner = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(owner.accessToken))
      .send({ url: 'https://example.test/private', event_types: ['booking.created'] });

    const intruder = await registerUser({ role: 'customer' });
    const res = await request(app)
      .delete(`/api/webhook-subscriptions/${create.body.id}`)
      .set(authHeader(intruder.accessToken));
    expect(res.status).toBe(404);

    const { rows } = await db.query("SELECT id FROM webhook_subscriptions WHERE id = $1", [create.body.id]);
    expect(rows).toHaveLength(1);
  });

  test('POST /:id/rotate-secret moves current to previous (24h grace) and returns new secret once', async () => {
    const u = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/rotate', event_types: ['booking.created'] });
    const id = create.body.id;
    const originalSecret = create.body.secret;

    const rot = await request(app)
      .post(`/api/webhook-subscriptions/${id}/rotate-secret`)
      .set(authHeader(u.accessToken))
      .send({});
    expect(rot.status).toBe(200);
    expect(rot.body.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    expect(rot.body.secret).not.toBe(originalSecret);
    expect(rot.body.previous_secret_expires_at).toMatch(/Z$/);

    const { rows } = await db.query(
      `SELECT secret_encrypted, secret_previous_encrypted, secret_previous_expires_at FROM webhook_subscriptions WHERE id = $1`,
      [id]
    );
    expect(decryptSecret(rows[0].secret_encrypted)).toBe(rot.body.secret);
    expect(decryptSecret(rows[0].secret_previous_encrypted)).toBe(originalSecret);
    const expiry = new Date(rows[0].secret_previous_expires_at).getTime();
    const expected = Date.now() + 24 * 3600 * 1000;
    expect(Math.abs(expiry - expected)).toBeLessThan(60_000);
  });

  test('rotate-secret on another user subscription returns 404', async () => {
    const owner = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(owner.accessToken))
      .send({ url: 'https://example.test/rot2', event_types: ['booking.created'] });
    const intruder = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post(`/api/webhook-subscriptions/${create.body.id}/rotate-secret`)
      .set(authHeader(intruder.accessToken))
      .send({});
    expect(res.status).toBe(404);

    const { rows } = await db.query(
      `SELECT secret_previous_encrypted FROM webhook_subscriptions WHERE id = $1`,
      [create.body.id]
    );
    expect(rows[0].secret_previous_encrypted).toBeNull();
  });

  test('GET /:id/deliveries returns a paginated list (caller-owned only)', async () => {
    const u = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/d', event_types: ['booking.created'] });

    await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload)
       VALUES ($1, gen_random_uuid(), 'booking.created', '{"event_id":"x"}'::jsonb)`,
      [create.body.id]
    );
    const res = await request(app)
      .get(`/api/webhook-subscriptions/${create.body.id}/deliveries`)
      .set(authHeader(u.accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.deliveries)).toBe(true);
    expect(res.body.deliveries.length).toBe(1);
    expect(res.body.deliveries[0].event_type).toBe('booking.created');
  });

  test('replay a dead delivery resets it to pending', async () => {
    const u = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/r', event_types: ['booking.completed'] });

    const ins = await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload, status, attempt_count, dead_at, last_error)
       VALUES ($1, gen_random_uuid(), 'booking.completed', '{"event_id":"x"}'::jsonb, 'dead', 5, NOW(), 'gave up')
       RETURNING id`,
      [create.body.id]
    );
    const res = await request(app)
      .post(`/api/webhook-subscriptions/${create.body.id}/deliveries/${ins.rows[0].id}/replay`)
      .set(authHeader(u.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');

    const { rows } = await db.query(`SELECT status, attempt_count, dead_at, last_error FROM webhook_deliveries WHERE id = $1`, [ins.rows[0].id]);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempt_count).toBe(0);
    expect(rows[0].dead_at).toBeNull();
    expect(rows[0].last_error).toBeNull();
  });

  test('replay a pending delivery returns 404 (not replayable)', async () => {
    const u = await registerUser({ role: 'customer' });
    const create = await request(app)
      .post('/api/webhook-subscriptions')
      .set(authHeader(u.accessToken))
      .send({ url: 'https://example.test/r2', event_types: ['booking.created'] });

    const ins = await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload)
       VALUES ($1, gen_random_uuid(), 'booking.created', '{"event_id":"x"}'::jsonb)
       RETURNING id`,
      [create.body.id]
    );
    const res = await request(app)
      .post(`/api/webhook-subscriptions/${create.body.id}/deliveries/${ins.rows[0].id}/replay`)
      .set(authHeader(u.accessToken));
    expect(res.status).toBe(404);
    expect(res.body.type).toMatch(/errors\/webhook-delivery-not-replayable/);
  });
});
