const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function activeBooking(customerId, labourerId) {
  const result = await db.query(
    `INSERT INTO bookings
       (customer_id, labourer_id, status, skill_needed, address,
        location_lat, location_lng, scheduled_at, total_amount)
     VALUES ($1, $2, 'in_progress', 'Testing', '1 Change Lane',
             -29.8, 31.0, NOW() + INTERVAL '1 day', 100)
     RETURNING id`,
    [customerId, labourerId]
  );
  return result.rows[0].id;
}

describe('change-order response single effect', () => {
  test('rejects ambiguous non-boolean responses before changing state', async () => {
    const customer = await registerUser({ role: 'customer' });
    const labourer = await registerUser({ role: 'labourer' });
    const bookingId = await activeBooking(customer.user.id, labourer.user.id);
    const order = await db.query(
      `INSERT INTO change_orders
         (booking_id, requested_by, description, extra_amount)
       VALUES ($1, $2, 'Additional work', 25)
       RETURNING id`,
      [bookingId, labourer.user.id]
    );

    const response = await request(app)
      .patch(`/api/bookings/${bookingId}/change-order/${order.rows[0].id}/accept`)
      .set(authHeader(customer.accessToken))
      .send({ accept: 'false' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_change_order_response');

    const stored = await db.query(
      `SELECT b.total_amount, c.status
         FROM bookings b
         JOIN change_orders c ON c.booking_id = b.id
        WHERE b.id = $1`,
      [bookingId]
    );
    expect(Number(stored.rows[0].total_amount)).toBe(100);
    expect(stored.rows[0].status).toBe('pending');
  });

  test('concurrent and repeated acceptance adds extra_amount exactly once', async () => {
    const customer = await registerUser({ role: 'customer' });
    const labourer = await registerUser({ role: 'labourer' });
    const bookingId = await activeBooking(customer.user.id, labourer.user.id);
    const order = await db.query(
      `INSERT INTO change_orders
         (booking_id, requested_by, description, extra_amount)
       VALUES ($1, $2, 'Additional work', 25)
       RETURNING id`,
      [bookingId, labourer.user.id]
    );
    const path = `/api/bookings/${bookingId}/change-order/${order.rows[0].id}/accept`;
    const accept = () => request(app)
      .patch(path)
      .set(authHeader(customer.accessToken))
      .send({ accept: true });

    const responses = await Promise.all([accept(), accept()]);

    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(responses.map((res) => res.body.idempotent_replay).sort()).toEqual([false, true]);
    for (const response of responses) {
      expect(response.body.changeOrder.status).toBe('accepted');
      expect(Number(response.body.booking.total_amount)).toBe(125);
    }

    const replay = await accept();
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent_replay).toBe(true);

    const stored = await db.query(
      `SELECT b.total_amount, c.status
         FROM bookings b
         JOIN change_orders c ON c.booking_id = b.id
        WHERE b.id = $1`,
      [bookingId]
    );
    expect(Number(stored.rows[0].total_amount)).toBe(125);
    expect(stored.rows[0].status).toBe('accepted');
  });

  test('a contradictory replay cannot overwrite the first response', async () => {
    const customer = await registerUser({ role: 'customer' });
    const labourer = await registerUser({ role: 'labourer' });
    const bookingId = await activeBooking(customer.user.id, labourer.user.id);
    const order = await db.query(
      `INSERT INTO change_orders
         (booking_id, requested_by, description, extra_amount)
       VALUES ($1, $2, 'Additional work', 25)
       RETURNING id`,
      [bookingId, labourer.user.id]
    );
    const path = `/api/bookings/${bookingId}/change-order/${order.rows[0].id}/accept`;

    const first = await request(app)
      .patch(path)
      .set(authHeader(customer.accessToken))
      .send({ accept: false });
    expect(first.status).toBe(200);
    expect(first.body.changeOrder.status).toBe('declined');

    const contradiction = await request(app)
      .patch(path)
      .set(authHeader(customer.accessToken))
      .send({ accept: true });
    expect(contradiction.status).toBe(409);
    expect(contradiction.body.status).toBe('declined');

    const stored = await db.query(
      'SELECT total_amount FROM bookings WHERE id = $1',
      [bookingId]
    );
    expect(Number(stored.rows[0].total_amount)).toBe(100);
  });
});
