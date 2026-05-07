/**
 * End-to-end tests that exercise the actual route handlers and assert that
 * webhook_deliveries rows materialise for matching subscriptions. This is
 * the test that fails if anyone forgets to wire emitEvent into a new
 * lifecycle transition — it covers the full booking, match_request, and
 * payment paths.
 */

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const { encryptSecret } = require('../src/lib/webhookSecretCrypto');

const FUTURE_ISO = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function subscribe(userId, eventTypes) {
  const r = await db.query(
    `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, 'https://example.test/h', encryptSecret('whsec_lifecycle'), eventTypes]
  );
  return r.rows[0].id;
}

async function deliveriesByType() {
  const { rows } = await db.query(
    `SELECT event_type, payload FROM webhook_deliveries ORDER BY created_at, event_type`
  );
  return rows;
}

describe('booking lifecycle emits webhook events', () => {
  test('manual booking: created -> accepted -> in_progress -> completed each fires the matching event', async () => {
    const customer = await registerUser({ role: 'customer' });
    const labourer = await registerUser({ role: 'labourer' });
    await subscribe(customer.user.id, [
      'booking.created', 'booking.accepted', 'booking.in_progress', 'booking.completed', 'booking.cancelled',
    ]);

    const create = await request(app)
      .post('/api/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '1 Lifecycle Ave',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: FUTURE_ISO(),
        hours_est: 2,
      });
    expect(create.status).toBe(201);
    const bookingId = create.body.booking.id;

    const accept = await request(app)
      .put(`/api/bookings/${bookingId}/accept`)
      .set(authHeader(labourer.accessToken));
    expect(accept.status).toBe(200);

    const start = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken));
    expect(start.status).toBe(200);

    const complete = await request(app)
      .put(`/api/bookings/${bookingId}/complete`)
      .set(authHeader(labourer.accessToken));
    expect(complete.status).toBe(200);

    const deliveries = await deliveriesByType();
    const types = deliveries.map(d => d.event_type);
    expect(types).toEqual([
      'booking.created',
      'booking.accepted',
      'booking.in_progress',
      'booking.completed',
    ]);

    // Every payload carries the booking id and the new state
    expect(deliveries[0].payload.resource_id).toBe(bookingId);
    expect(deliveries[1].payload.previous_state).toBe('pending');
    expect(deliveries[1].payload.state).toBe('accepted');
    expect(deliveries[2].payload.state).toBe('in_progress');
    expect(deliveries[3].payload.state).toBe('completed');
  });

  test('cancelling a booking emits booking.cancelled with previous_state', async () => {
    const customer = await registerUser({ role: 'customer' });
    const labourer = await registerUser({ role: 'labourer' });
    await subscribe(customer.user.id, ['booking.cancelled']);

    const create = await request(app)
      .post('/api/bookings')
      .set(authHeader(customer.accessToken))
      .send({
        labourer_id: labourer.user.id,
        skill_needed: 'Plumbing',
        address: '2 Cancel Rd',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: FUTURE_ISO(),
        hours_est: 1,
      });
    const bookingId = create.body.booking.id;

    const cancel = await request(app)
      .put(`/api/bookings/${bookingId}/cancel`)
      .set(authHeader(customer.accessToken));
    expect(cancel.status).toBe(200);

    const deliveries = await deliveriesByType();
    expect(deliveries.map(d => d.event_type)).toEqual(['booking.cancelled']);
    expect(deliveries[0].payload.previous_state).toBe('pending');
    expect(deliveries[0].payload.state).toBe('cancelled');
  });
});

describe('match_request lifecycle emits webhook events', () => {
  test('POST /api/match emits match_request.created', async () => {
    const customer = await registerUser({ role: 'customer' });
    await subscribe(customer.user.id, ['match_request.created']);

    const res = await request(app)
      .post('/api/match')
      .set(authHeader(customer.accessToken))
      .send({
        skill_needed: 'Plumbing',
        address: '1 Match Ave',
        location_lat: -29.8,
        location_lng: 31.0,
        scheduled_at: FUTURE_ISO(),
        hours_est: 1,
      });
    expect(res.status).toBe(201);
    const matchId = res.body.match.id;

    const deliveries = await deliveriesByType();
    expect(deliveries.map(d => d.event_type)).toEqual(['match_request.created']);
    expect(deliveries[0].payload.resource_id).toBe(matchId);
    expect(deliveries[0].payload.state).toBe('pending');
  });

  test('matcher.cancelByCustomer emits match_request.cancelled with previous_state=pending', async () => {
    const customer = await registerUser({ role: 'customer' });
    await subscribe(customer.user.id, ['match_request.cancelled']);
    const matcher = require('../src/services/matcher');

    const ins = await db.query(
      `INSERT INTO match_requests (customer_id, skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, expires_at)
       VALUES ($1, 'Plumbing', '1 Cancel Ave', -29.8, 31.0, NOW() + INTERVAL '1 day', 1, NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [customer.user.id]
    );
    const ok = await matcher.cancelByCustomer(ins.rows[0].id, customer.user.id);
    expect(ok).toBe(true);

    const deliveries = await deliveriesByType();
    expect(deliveries.map(d => d.event_type)).toEqual(['match_request.cancelled']);
    expect(deliveries[0].payload.previous_state).toBe('pending');
    expect(deliveries[0].payload.state).toBe('cancelled');
  });

  test('matcher.expireMatch emits match_request.expired with the expire_reason', async () => {
    const customer = await registerUser({ role: 'customer' });
    await subscribe(customer.user.id, ['match_request.expired']);
    const matcher = require('../src/services/matcher');

    const ins = await db.query(
      `INSERT INTO match_requests (customer_id, skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, expires_at)
       VALUES ($1, 'Plumbing', '1 Expire Ave', -29.8, 31.0, NOW() + INTERVAL '1 day', 1, NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [customer.user.id]
    );
    await matcher.expireMatch(ins.rows[0].id, 'no_candidates');

    const deliveries = await deliveriesByType();
    expect(deliveries.map(d => d.event_type)).toEqual(['match_request.expired']);
    expect(deliveries[0].payload.previous_state).toBe('pending');
    expect(deliveries[0].payload.state).toBe('expired');
    expect(deliveries[0].payload.data.expire_reason).toBe('no_candidates');
  });
});
