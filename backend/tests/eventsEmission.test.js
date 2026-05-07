const { db, truncateAll, registerUser } = require('./helpers');
const { emitEvent, EVENT_TYPES } = require('../src/services/events');
const { withTx } = require('../src/config/db');
const { encryptSecret } = require('../src/lib/webhookSecretCrypto');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('EVENT_TYPES', () => {
  test('exports the expected booking + match_request + payment lifecycle events', () => {
    expect(EVENT_TYPES).toEqual(expect.arrayContaining([
      'booking.created', 'booking.accepted', 'booking.in_progress', 'booking.completed', 'booking.cancelled',
      'match_request.created', 'match_request.matched', 'match_request.expired', 'match_request.cancelled',
      'payment.succeeded', 'payment.failed',
    ]));
  });
});

describe('emitEvent', () => {
  test('throws if client argument missing (footgun guard)', async () => {
    await expect(emitEvent(undefined, { eventType: 'booking.created', resourceType: 'booking', resourceId: 'x', data: {} }))
      .rejects.toThrow(/client is required/);
  });

  test('rejects unknown event types', async () => {
    await expect(emitEvent(db, { eventType: 'fake.event', resourceType: 'booking', resourceId: 'x', data: {} }))
      .rejects.toThrow(/Unknown event type/);
  });

  test('inserts a delivery row per matching enabled subscription only', async () => {
    const u = await registerUser({ role: 'customer' });
    const sub1 = await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, 'https://a.test/h', $2, $3) RETURNING id`,
      [u.user.id, encryptSecret('whsec_a'), ['booking.created']]
    );
    await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, 'https://b.test/h', $2, $3)`,
      [u.user.id, encryptSecret('whsec_b'), ['booking.completed']]
    );
    await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types, enabled)
       VALUES ($1, 'https://c.test/h', $2, $3, false)`,
      [u.user.id, encryptSecret('whsec_c'), ['booking.created']]
    );

    const result = await emitEvent(db, {
      eventType: 'booking.created',
      resourceType: 'booking',
      resourceId: '00000000-0000-0000-0000-000000000001',
      previousState: null,
      state: 'matched',
      data: { id: '00000000-0000-0000-0000-000000000001', total_cents: 48000, currency: 'ZAR' },
    });

    expect(result.deliveryCount).toBe(1);
    expect(result.eventId).toMatch(/^[0-9a-f-]{36}$/);

    const { rows } = await db.query(
      `SELECT subscription_id, event_type, payload FROM webhook_deliveries WHERE event_id = $1`,
      [result.eventId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].subscription_id).toBe(sub1.rows[0].id);
    expect(rows[0].event_type).toBe('booking.created');
    expect(rows[0].payload.event_id).toBe(result.eventId);
    expect(rows[0].payload.previous_state).toBeNull();
    expect(rows[0].payload.state).toBe('matched');
    expect(rows[0].payload.occurred_at).toMatch(/Z$/);
    expect(rows[0].payload.data.total_cents).toBe(48000);
  });

  test('rollback in caller tx prevents the delivery from landing (transactional outbox)', async () => {
    const u = await registerUser({ role: 'customer' });
    await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
       VALUES ($1, 'https://tx.test/h', $2, $3)`,
      [u.user.id, encryptSecret('whsec_tx'), ['booking.cancelled']]
    );
    let caught = null;
    try {
      await withTx(async client => {
        await emitEvent(client, {
          eventType: 'booking.cancelled',
          resourceType: 'booking',
          resourceId: '00000000-0000-0000-0000-000000000002',
          data: {},
        });
        throw new Error('caller failure after emit');
      });
    } catch (e) { caught = e; }
    expect(caught.message).toMatch(/caller failure/);
    const { rows } = await db.query(`SELECT id FROM webhook_deliveries WHERE event_type = 'booking.cancelled'`);
    expect(rows).toHaveLength(0);
  });
});

describe('withTx', () => {
  test('commits on success', async () => {
    const result = await withTx(async client => {
      const { rows } = await client.query("SELECT 1::int AS one");
      return rows[0].one;
    });
    expect(result).toBe(1);
  });

  test('rolls back on throw and re-throws original error', async () => {
    await expect(withTx(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});
