const http = require('http');
const { db, truncateAll, registerUser } = require('./helpers');
const { emitEvent } = require('../src/services/events');
const { tick } = require('../src/services/webhookDispatcher');
const { verifySignature } = require('../src/lib/webhookSignature');
const { encryptSecret } = require('../src/lib/webhookSecretCrypto');

function makeReceiver(handler) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => handler(req, body, res));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeReceiver(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('webhookDispatcher', () => {
  test('delivers a pending row to a 200 receiver, marks succeeded, signature verifies', async () => {
    const u = await registerUser({ role: 'customer' });
    let captured;
    const server = await makeReceiver((req, body, res) => {
      captured = { headers: req.headers, body };
      res.statusCode = 200;
      res.end('ok');
    });
    const port = server.address().port;
    const plain = 'whsec_disp1';
    const sub = await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [u.user.id, `http://127.0.0.1:${port}/h`, encryptSecret(plain), ['booking.created']]
    );
    await emitEvent(db, { eventType: 'booking.created', resourceType: 'booking', resourceId: 'r1', data: { id: 'r1' } });

    await tick();
    await closeReceiver(server);

    expect(captured.headers['x-togt-event-type']).toBe('booking.created');
    expect(captured.headers['x-togt-event-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(captured.headers['x-togt-delivery-attempt']).toBe('1');
    expect(verifySignature(plain, captured.body, captured.headers['x-togt-signature'])).toBe(true);

    const { rows } = await db.query(`SELECT status, attempt_count, last_http_status FROM webhook_deliveries WHERE subscription_id = $1`, [sub.rows[0].id]);
    expect(rows[0].status).toBe('succeeded');
    expect(rows[0].attempt_count).toBe(1);
    expect(rows[0].last_http_status).toBe(200);

    const subRow = await db.query(`SELECT consecutive_failures, last_success_at FROM webhook_subscriptions WHERE id = $1`, [sub.rows[0].id]);
    expect(subRow.rows[0].consecutive_failures).toBe(0);
    expect(subRow.rows[0].last_success_at).not.toBeNull();
  });

  test('on 500, schedules next_retry_at ~30s out and increments attempt', async () => {
    const u = await registerUser({ role: 'customer' });
    const server = await makeReceiver((req, body, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    const port = server.address().port;
    await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, $2, $3, $4)`,
      [u.user.id, `http://127.0.0.1:${port}/h`, encryptSecret('whsec_disp2'), ['booking.cancelled']]
    );
    await emitEvent(db, { eventType: 'booking.cancelled', resourceType: 'booking', resourceId: 'r2', data: {} });

    await tick();
    await closeReceiver(server);

    const { rows } = await db.query(`SELECT status, attempt_count, next_retry_at, last_http_status FROM webhook_deliveries`);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempt_count).toBe(1);
    expect(rows[0].last_http_status).toBe(500);
    const delaySeconds = (new Date(rows[0].next_retry_at).getTime() - Date.now()) / 1000;
    expect(delaySeconds).toBeGreaterThan(20);
    expect(delaySeconds).toBeLessThan(60);
  });

  test('signs with both current AND previous secret during grace window', async () => {
    const u = await registerUser({ role: 'customer' });
    let captured;
    const server = await makeReceiver((req, body, res) => {
      captured = { headers: req.headers, body };
      res.statusCode = 200;
      res.end('ok');
    });
    const port = server.address().port;
    const oldSecret = 'whsec_old_grace';
    const newSecret = 'whsec_new_grace';
    await db.query(
      `INSERT INTO webhook_subscriptions
         (owner_user_id, url, secret_encrypted, secret_previous_encrypted, secret_previous_expires_at, event_types)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '6 hours', $5)`,
      [u.user.id, `http://127.0.0.1:${port}/h`, encryptSecret(newSecret), encryptSecret(oldSecret), ['booking.accepted']]
    );
    await emitEvent(db, { eventType: 'booking.accepted', resourceType: 'booking', resourceId: 'rg', data: {} });

    await tick();
    await closeReceiver(server);

    const sigHeader = captured.headers['x-togt-signature'];
    expect(sigHeader.match(/v1=/g)).toHaveLength(2);
    expect(verifySignature(newSecret, captured.body, sigHeader)).toBe(true);
    expect(verifySignature(oldSecret, captured.body, sigHeader)).toBe(true);
  });

  test('skips previous secret once it has expired', async () => {
    const u = await registerUser({ role: 'customer' });
    let captured;
    const server = await makeReceiver((req, body, res) => {
      captured = { headers: req.headers, body };
      res.statusCode = 200;
      res.end('ok');
    });
    const port = server.address().port;
    const oldSecret = 'whsec_old_expired';
    const newSecret = 'whsec_new_only';
    await db.query(
      `INSERT INTO webhook_subscriptions
         (owner_user_id, url, secret_encrypted, secret_previous_encrypted, secret_previous_expires_at, event_types)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour', $5)`,
      [u.user.id, `http://127.0.0.1:${port}/h`, encryptSecret(newSecret), encryptSecret(oldSecret), ['booking.completed']]
    );
    await emitEvent(db, { eventType: 'booking.completed', resourceType: 'booking', resourceId: 're', data: {} });

    await tick();
    await closeReceiver(server);

    const sigHeader = captured.headers['x-togt-signature'];
    expect(sigHeader.match(/v1=/g)).toHaveLength(1);
    expect(verifySignature(newSecret, captured.body, sigHeader)).toBe(true);
    expect(verifySignature(oldSecret, captured.body, sigHeader)).toBe(false);
  });

  test('marks dead after age > 24h', async () => {
    const u = await registerUser({ role: 'customer' });
    const server = await makeReceiver((req, body, res) => {
      res.statusCode = 500;
      res.end('still down');
    });
    const port = server.address().port;
    const sub = await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [u.user.id, `http://127.0.0.1:${port}/h`, encryptSecret('whsec_disp3'), ['booking.completed']]
    );
    const inserted = await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload, created_at, attempt_count)
       VALUES ($1, gen_random_uuid(), 'booking.completed', '{"event_id":"x"}'::jsonb, NOW() - INTERVAL '25 hours', 4)
       RETURNING id`,
      [sub.rows[0].id]
    );

    await tick();
    await closeReceiver(server);

    const { rows } = await db.query(`SELECT status, dead_at FROM webhook_deliveries WHERE id = $1`, [inserted.rows[0].id]);
    expect(rows[0].status).toBe('dead');
    expect(rows[0].dead_at).not.toBeNull();
  });

  test('disabled subscription marks delivery dead with explanatory error', async () => {
    const u = await registerUser({ role: 'customer' });
    const sub = await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types, enabled)
       VALUES ($1, 'https://nope.test/h', $2, $3, false) RETURNING id`,
      [u.user.id, encryptSecret('whsec_disabled'), ['booking.created']]
    );
    const inserted = await db.query(
      `INSERT INTO webhook_deliveries (subscription_id, event_id, event_type, payload)
       VALUES ($1, gen_random_uuid(), 'booking.created', '{"event_id":"x"}'::jsonb)
       RETURNING id`,
      [sub.rows[0].id]
    );

    await tick();

    const { rows } = await db.query(`SELECT status, last_error FROM webhook_deliveries WHERE id = $1`, [inserted.rows[0].id]);
    expect(rows[0].status).toBe('dead');
    expect(rows[0].last_error).toMatch(/disabled|deleted/);
  });
});
