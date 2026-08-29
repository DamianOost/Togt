process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = 'true';

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function acceptedBooking() {
  const customer = await registerUser({ role: 'customer', name: 'Calm Customer' });
  const labourer = await registerUser({ role: 'labourer', name: 'Steady Worker' });
  const create = await request(app)
    .post('/api/bookings')
    .set(authHeader(customer.accessToken))
    .send({
      labourer_id: labourer.user.id,
      skill_needed: 'Plumbing',
      address: '17 Private Place',
      location_lat: -29.8,
      location_lng: 31.0,
      scheduled_at: future(),
      hours_est: 2,
    });
  expect(create.status).toBe(201);
  const bookingId = create.body.booking.id;
  const accept = await request(app)
    .put(`/api/bookings/${bookingId}/accept`)
    .set(authHeader(labourer.accessToken));
  expect(accept.status).toBe(200);
  return { customer, labourer, bookingId };
}

describe('P0 start integrity', () => {
  test('requires bilateral scope and the customer-held PIN before start', async () => {
    const { customer, labourer, bookingId } = await acceptedBooking();

    const premature = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken))
      .send({ start_pin: '000000' });
    expect(premature.status).toBe(409);
    expect(premature.body.error).toBe('scope_confirmation_required');

    const customerConfirm = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm-scope`)
      .set(authHeader(customer.accessToken));
    expect(customerConfirm.status).toBe(200);
    expect(customerConfirm.body.booking.status).toBe('accepted');

    const workerConfirm = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm-scope`)
      .set(authHeader(labourer.accessToken));
    expect(workerConfirm.status).toBe(200);
    expect(workerConfirm.body.booking.status).toBe('accepted');
    expect(workerConfirm.body.booking.start_pin).toBeUndefined();

    const customerView = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(customer.accessToken));
    expect(customerView.body.booking.ready_to_start).toBe(true);
    expect(customerView.body.booking.start_pin).toMatch(/^\d{6}$/);

    const missing = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken));
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('start_pin_required');

    let wrongPin = customerView.body.booking.start_pin === '000000' ? '000001' : '000000';
    const wrong = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken))
      .send({ start_pin: wrongPin });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toBe('start_pin_invalid');

    const started = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken))
      .send({ start_pin: customerView.body.booking.start_pin });
    expect(started.status).toBe(200);
    expect(started.body.booking.status).toBe('in_progress');
  });
});

describe('P0 payment and sharing truth', () => {
  test('does not create checkout or unary cash-paid records', async () => {
    const { customer, bookingId } = await acceptedBooking();

    const online = await request(app)
      .post('/api/payments/initiate')
      .set(authHeader(customer.accessToken))
      .send({ booking_id: bookingId });
    expect(online.status).toBe(503);
    expect(online.body.error).toBe('capability_unavailable');

    const cash = await request(app)
      .post('/api/payments/cash')
      .set(authHeader(customer.accessToken))
      .send({ booking_id: bookingId });
    expect(cash.status).toBe(503);
    expect(cash.body.error).toBe('capability_unavailable');

    const rows = await db.query('SELECT id FROM payments WHERE booking_id = $1', [bookingId]);
    expect(rows.rows).toHaveLength(0);
  });

  test('shares a participant-only, non-live preview without private location, contact or identifiers', async () => {
    const { customer, labourer, bookingId } = await acceptedBooking();
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/share-trip`)
      .set(authHeader(customer.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.bookingDetailsShare).toEqual({
      available: true,
      mode: 'non_live_no_address',
    });
    expect(res.body.preview).toEqual({
      projectReference: 'TOGT Project',
      serviceLabel: 'Plumbing',
      broadAreaLabel: 'Area not shared',
      scheduleLabel: expect.any(String),
      statusLabel: 'Worker confirmed',
    });
    expect(res.body.live_tracking).toBe(false);
    expect(res.body.public_link).toBeNull();
    expect(res.body.shareText).toMatch(/not a live tracking link/i);
    const serialized = JSON.stringify(res.body);
    for (const privateValue of [
      '17 Private Place',
      bookingId,
      customer.user.id,
      labourer.user.id,
      customer.user.name,
      labourer.user.name,
      '-29.8',
      '31.0',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }

    const workerView = await request(app)
      .post(`/api/bookings/${bookingId}/share-trip`)
      .set(authHeader(labourer.accessToken));
    expect(workerView.status).toBe(200);
    expect(workerView.body.preview).toEqual(res.body.preview);

    const outsider = await registerUser({ role: 'customer', name: 'Outside Viewer' });
    const denied = await request(app)
      .post(`/api/bookings/${bookingId}/share-trip`)
      .set(authHeader(outsider.accessToken));
    expect(denied.status).toBe(403);
  });
});

describe('P0 safety truth', () => {
  test('records an event without claiming an operated dispatch', async () => {
    const user = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/safety/sos')
      .set(authHeader(user.accessToken))
      .send({ lat: -29.8, lng: 31.0 });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.operations_alerted).toBe(false);
    expect(res.body.emergency_services_dispatched).toBe(false);
    expect(res.body.message).toMatch(/did not dispatch/i);
  });
});

describe('P0 identity truth', () => {
  test('rejects unsupported identity intake without changing KYC state', async () => {
    const user = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/kyc/verify-id')
      .set(authHeader(user.accessToken))
      .send({
        idNumber: '9001049818080',
        firstName: 'Test',
        lastName: 'User',
      });

    expect(res.status).toBe(503);
    expect(res.body.verified).toBe(false);
    expect(res.body.error).toBe('capability_unavailable');
    const userRow = await db.query('SELECT kyc_status FROM users WHERE id = $1', [user.user.id]);
    expect(userRow.rows[0].kyc_status).toBe('unverified');
    const rows = await db.query('SELECT id FROM kyc_verifications WHERE user_id = $1', [user.user.id]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe('P0 remote-push truth', () => {
  test('rejects token registration while remote push is disabled', async () => {
    const user = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/auth/push-token')
      .set(authHeader(user.accessToken))
      .send({ token: 'ExponentPushToken[must-not-be-stored]' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('capability_unavailable');
    expect(res.body.capability).toBe('remote_push');

    const row = await db.query('SELECT push_token FROM users WHERE id = $1', [user.user.id]);
    expect(row.rows[0].push_token).toBeNull();
  });
});
