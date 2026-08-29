process.env.LEGACY_DIRECT_BOOKING_CREATION_ENABLED = 'true';

const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');
const { startPinForBooking } = require('../src/lib/startPin');

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function acceptedBooking() {
  const customer = await registerUser({
    role: 'customer',
    name: 'Privacy Customer',
    phone: '0820000001',
  });
  const labourer = await registerUser({
    role: 'labourer',
    name: 'Privacy Worker',
    phone: '0830000002',
  });
  const create = await request(app)
    .post('/api/bookings')
    .set(authHeader(customer.accessToken))
    .send({
      labourer_id: labourer.user.id,
      skill_needed: 'Plumbing',
      address: '17 Private Place',
      location_lat: -29.81234,
      location_lng: 31.01234,
      scheduled_at: future(),
      hours_est: 2,
      notes: 'Gate four',
    });
  expect(create.status).toBe(201);

  const bookingId = create.body.booking.id;
  const accepted = await request(app)
    .put(`/api/bookings/${bookingId}/accept`)
    .set(authHeader(labourer.accessToken));
  expect(accepted.status).toBe(200);

  await db.query(
    `INSERT INTO grounded_fulfilment_policy_snapshots (
       booking_id, policy_version, source, route_reveal_lead_minutes,
       arrival_evidence_mode, no_show_grace_minutes, start_pin_ttl_minutes,
       start_pin_max_attempts, reschedule_expiry_minutes, change_order_expiry_minutes
     ) VALUES ($1, 'legacy-gate-test-v1', 'operations_override', 60,
       'worker_attestation', 15, 60, 3, 120, 120)`,
    [bookingId]
  );
  return { customer, labourer, bookingId };
}

async function seedLegacyScopeState({ bookingId }) {
  // Model an already-confirmed legacy booking that later received a canonical
  // policy snapshot. Canonical bookings can no longer reach this state through
  // the retired legacy confirmation route.
  await db.query(
    `UPDATE bookings
        SET scope_confirmed_by_customer = true,
            scope_confirmed_by_labourer = true,
            scope_confirmed_at = NOW()
      WHERE id = $1`,
    [bookingId]
  );
}

describe('legacy booking canonical fulfilment gate', () => {
  test('legacy reads reveal only after route grant, then revoke immediately', async () => {
    const { customer, labourer, bookingId } = await acceptedBooking();

    const scheduledWorker = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(labourer.accessToken));
    expect(scheduledWorker.status).toBe(200);
    expect(scheduledWorker.body.booking.address).toBeUndefined();
    expect(scheduledWorker.body.booking.location_lat).toBeUndefined();
    expect(scheduledWorker.body.booking.notes).toBeUndefined();
    expect(scheduledWorker.body.booking.customer_phone).toBeUndefined();

    const listWorker = await request(app)
      .get('/api/bookings')
      .set(authHeader(labourer.accessToken));
    expect(listWorker.status).toBe(200);
    expect(listWorker.body.bookings[0].address).toBeUndefined();
    expect(listWorker.body.bookings[0].customer_phone).toBeUndefined();

    const myWorker = await request(app)
      .get('/api/bookings/my')
      .set(authHeader(labourer.accessToken));
    expect(myWorker.status).toBe(200);
    expect(myWorker.body.bookings[0].address).toBeUndefined();
    expect(myWorker.body.bookings[0].customer_phone).toBeUndefined();

    const scheduledCustomer = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(customer.accessToken));
    expect(scheduledCustomer.body.booking.address).toBe('17 Private Place');
    expect(scheduledCustomer.body.booking.labourer_phone).toBeUndefined();

    await db.query(
      `UPDATE bookings
          SET route_access_granted_at = NOW(), operational_phase = 'en_route'
        WHERE id = $1`,
      [bookingId]
    );
    const activeWorker = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(labourer.accessToken));
    expect(activeWorker.body.booking.address).toBe('17 Private Place');
    expect(activeWorker.body.booking.customer_phone).toBe('0820000001');

    const activeCustomer = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(customer.accessToken));
    expect(activeCustomer.body.booking.labourer_phone).toBe('0830000002');

    await db.query(
      `UPDATE bookings
          SET fulfilment_access_revoked_at = NOW(),
              fulfilment_access_revoked_reason = 'safety_hold'
        WHERE id = $1`,
      [bookingId]
    );
    const revokedWorker = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(labourer.accessToken));
    expect(revokedWorker.body.booking.address).toBeUndefined();
    expect(revokedWorker.body.booking.customer_phone).toBeUndefined();

    const revokedCustomer = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(customer.accessToken));
    expect(revokedCustomer.body.booking.labourer_phone).toBeUndefined();
  });

  test('suppresses deterministic legacy PIN and rejects both legacy start routes', async () => {
    const fixture = await acceptedBooking();
    const { customer, labourer, bookingId } = fixture;
    await seedLegacyScopeState(fixture);

    const customerView = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set(authHeader(customer.accessToken));
    expect(customerView.status).toBe(200);
    expect(customerView.body.booking.start_pin).toBeUndefined();
    expect(customerView.body.booking.start_pin_required).toBe(false);
    expect(customerView.body.booking.ready_to_start).toBe(false);
    expect(customerView.body.booking.canonical_start_required).toBe(true);
    expect(customerView.body.booking.start_path).toBe(`/api/projects/${bookingId}/start`);

    const pin = startPinForBooking(bookingId);
    const direct = await request(app)
      .put(`/api/bookings/${bookingId}/start`)
      .set(authHeader(labourer.accessToken))
      .send({ start_pin: pin });
    expect(direct.status).toBe(409);
    expect(direct.body.error).toBe('canonical_fulfilment_required');
    expect(direct.body.start_path).toBe(`/api/projects/${bookingId}/start`);

    const generic = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set(authHeader(labourer.accessToken))
      .send({ status: 'in_progress', start_pin: pin });
    expect(generic.status).toBe(409);
    expect(generic.body.error).toBe('canonical_fulfilment_required');

    const stored = await db.query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    expect(stored.rows[0].status).toBe('accepted');
  });

  test('retired legacy recurrence cannot create or mutate bookings', async () => {
    const { customer, bookingId } = await acceptedBooking();
    const before = await db.query(
      'SELECT id, is_recurring, recurrence_pattern, parent_booking_id FROM bookings ORDER BY id'
    );

    const response = await request(app)
      .post(`/api/bookings/${bookingId}/make-recurring`)
      .set(authHeader(customer.accessToken))
      .send({ pattern: 'weekly' });

    expect(response.status).toBe(410);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.body.type).toMatch(/\/errors\/legacy_recurring_booking_retired$/);
    expect(response.body.extensions).toEqual({
      canonicalPath: '/api/recurring-series',
      createdBookings: 0,
    });

    const after = await db.query(
      'SELECT id, is_recurring, recurrence_pattern, parent_booking_id FROM bookings ORDER BY id'
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]).toMatchObject({
      id: bookingId,
      is_recurring: false,
      recurrence_pattern: null,
      parent_booking_id: null,
    });
  });

  test('canonical policy blocks every legacy scope and change-order mutation', async () => {
    const { customer, labourer, bookingId } = await acceptedBooking();
    const before = await db.query(
      `SELECT total_amount, lifecycle_revision,
              scope_confirmed_by_customer, scope_confirmed_by_labourer,
              scope_confirmed_at
         FROM bookings WHERE id = $1`,
      [bookingId]
    );

    const confirm = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm-scope`)
      .set(authHeader(customer.accessToken));
    expect(confirm.status).toBe(409);
    expect(confirm.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(confirm.body.type).toMatch(/\/errors\/canonical_fulfilment_required$/);

    const create = await request(app)
      .post(`/api/bookings/${bookingId}/change-order`)
      .set(authHeader(labourer.accessToken))
      .send({
        description: 'Bypass the canonical commercial contract',
        extra_hours: 1,
        extra_amount: 99999999.99,
      });
    expect(create.status).toBe(409);
    expect(create.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(create.body.type).toMatch(/\/errors\/canonical_fulfilment_required$/);
    const noCreatedOrder = await db.query(
      'SELECT COUNT(*)::int AS count FROM change_orders WHERE booking_id = $1',
      [bookingId]
    );
    expect(noCreatedOrder.rows[0].count).toBe(0);

    const seeded = await db.query(
      `INSERT INTO change_orders (booking_id, requested_by, description, extra_amount)
       VALUES ($1, $2, 'Pre-existing legacy order', 250) RETURNING id`,
      [bookingId, labourer.user.id]
    );
    const accept = await request(app)
      .patch(`/api/bookings/${bookingId}/change-order/${seeded.rows[0].id}/accept`)
      .set(authHeader(customer.accessToken))
      .send({ accept: true });
    expect(accept.status).toBe(409);
    expect(accept.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(accept.body.type).toMatch(/\/errors\/canonical_fulfilment_required$/);

    const after = await db.query(
      `SELECT b.total_amount, b.lifecycle_revision,
              b.scope_confirmed_by_customer, b.scope_confirmed_by_labourer,
              b.scope_confirmed_at, c.status AS change_order_status
         FROM bookings b
         JOIN change_orders c ON c.booking_id = b.id
        WHERE b.id = $1`,
      [bookingId]
    );
    expect(after.rows[0]).toMatchObject({
      total_amount: before.rows[0].total_amount,
      lifecycle_revision: before.rows[0].lifecycle_revision,
      scope_confirmed_by_customer: before.rows[0].scope_confirmed_by_customer,
      scope_confirmed_by_labourer: before.rows[0].scope_confirmed_by_labourer,
      scope_confirmed_at: before.rows[0].scope_confirmed_at,
      change_order_status: 'pending',
    });
  });
});
