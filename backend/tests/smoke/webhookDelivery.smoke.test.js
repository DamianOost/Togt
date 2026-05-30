/**
 * Outbound webhook delivery smoke.
 *
 * End-to-end: subscribe a local sink → emit a booking event via
 * withTx + emitEvent → drive dispatcher.tick() → assert the sink
 * received a signed POST whose signature verifies under the
 * subscription secret. Also asserts webhook_deliveries flipped to
 * 'succeeded' and the sink saw the right payload.
 */

const crypto = require('crypto');
const { app, request, db, dispatcher, truncateAll, closeDb,
        registerUser, startWebhookSink, createSubscription, drainDispatcher } = require('./harness');
const { withTx } = require('../../src/config/db');
const { emitEvent } = require('../../src/services/events');

let sink;

beforeAll(async () => {
  sink = await startWebhookSink();
});

afterAll(async () => {
  if (sink) await sink.close();
  await closeDb();
});

beforeEach(async () => {
  await truncateAll();
  sink.received.length = 0;
});

test('booking event → signed delivery → sink receives + signature verifies', async () => {
  const u = await registerUser({ role: 'customer' });
  const { id: subId, secret } = await createSubscription({
    userId: u.user.id,
    url: sink.url,
    eventTypes: ['booking.created'],
  });

  // Emit the event inside a transaction (transactional-outbox pattern)
  const { eventId, deliveryCount } = await withTx(async (client) => emitEvent(client, {
    eventType: 'booking.created',
    resourceType: 'booking',
    resourceId: '00000000-0000-0000-0000-000000000aaa',
    actorUserIds: [u.user.id],
    data: { total_cents: 48000, currency: 'ZAR' },
  }));
  expect(deliveryCount).toBe(1);

  // Pre-tick state: one pending delivery.
  const { rows: pendingBefore } = await db.query(
    `SELECT status FROM webhook_deliveries WHERE event_id = $1`,
    [eventId]
  );
  expect(pendingBefore[0].status).toBe('pending');

  // Drive dispatcher manually (NODE_ENV=smoke means setInterval wasn't started)
  await drainDispatcher();

  // Sink should have received exactly one POST.
  expect(sink.received).toHaveLength(1);
  const hit = sink.received[0];
  expect(hit.method).toBe('POST');
  expect(hit.headers['content-type']).toMatch(/application\/json/);
  expect(hit.headers['x-togt-signature']).toBeTruthy();

  // Verify the signature
  const sig = hit.headers['x-togt-signature'];
  // Stripe-shape: t=<ts>,v1=<hex>[,v1=<hex>]
  const parts = sig.split(',').map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith('t=')).slice(2);
  const v1Parts = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  expect(tPart).toMatch(/^\d+$/);
  expect(v1Parts.length).toBeGreaterThanOrEqual(1);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${tPart}.${hit.rawBody}`)
    .digest('hex');
  expect(v1Parts).toContain(expected);

  // Payload sanity
  expect(hit.body).toMatchObject({
    event_type: 'booking.created',
    resource_type: 'booking',
    data: { total_cents: 48000, currency: 'ZAR' },
  });

  // DB row flipped to succeeded
  const { rows: doneRows } = await db.query(
    `SELECT status, last_http_status FROM webhook_deliveries WHERE event_id = $1`,
    [eventId]
  );
  expect(doneRows[0].status).toBe('succeeded');
  expect(doneRows[0].last_http_status).toBe(200);
});

test('subscriptions only get events they are subscribed to (per-tenant + per-type)', async () => {
  // Two users, one each subscribed to a different event_type.
  const uA = await registerUser({ role: 'customer' });
  const uB = await registerUser({ role: 'customer' });
  await createSubscription({
    userId: uA.user.id,
    url: sink.url,
    eventTypes: ['booking.created'],
  });
  await createSubscription({
    userId: uB.user.id,
    url: sink.url,
    eventTypes: ['booking.completed'],
  });

  // Emit booking.completed for uB only (per-tenant scoping by actorUserIds).
  const { deliveryCount } = await withTx(async (client) => emitEvent(client, {
    eventType: 'booking.completed',
    resourceType: 'booking',
    resourceId: '00000000-0000-0000-0000-000000000bbb',
    actorUserIds: [uB.user.id],
    data: {},
  }));
  // Exactly one — uA's subscription doesn't match the event_type AND uA
  // is not in actorUserIds anyway.
  expect(deliveryCount).toBe(1);

  await drainDispatcher();
  expect(sink.received).toHaveLength(1);
  expect(sink.received[0].body.event_type).toBe('booking.completed');
});
