const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const paymentsRouter = require('../src/routes/payments');
const { problemHandler } = require('../src/lib/problemJson');

const app = express();
app.use(express.json());
app.use('/api/payments', paymentsRouter);
app.use(problemHandler);
const request = supertest(app);

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken({ id: user.id, role: user.role })}` };
}

async function user(role, suffix) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, 'test-hash', $4)
     RETURNING id, role`,
    [`Payment ${role}`, `${role}-${suffix}@payment-privacy.example.test`, `084${suffix}`, role]
  );
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (user_id, skills, hourly_rate, is_available)
       VALUES ($1, ARRAY['Plumbing'], 350, true)`,
      [result.rows[0].id]
    );
  }
  return result.rows[0];
}

beforeEach(async () => {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

test('payment status is participant-only and omits provider reconciliation identifiers', async () => {
  const suffix = String(Math.floor(Math.random() * 8_000_000) + 1_000_000);
  const customer = await user('customer', suffix);
  const worker = await user('labourer', String(Number(suffix) + 1));
  const outsider = await user('customer', String(Number(suffix) + 2));
  const booking = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, skill_needed, address,
       location_lat, location_lng, scheduled_at, total_amount
     ) VALUES ($1, $2, 'completed', 'Plumbing', 'Private address',
               -33.9, 18.4, NOW() + INTERVAL '1 day', 550)
     RETURNING id`,
    [customer.id, worker.id]
  );
  await db.query(
    `INSERT INTO payments (
       booking_id, amount, currency, status, peach_checkout_id, peach_result_code
     ) VALUES ($1, 550, 'ZAR', 'paid', 'provider-private-checkout', 'provider-private-result')`,
    [booking.rows[0].id]
  );

  const participant = await request
    .get(`/api/payments/status/${booking.rows[0].id}`)
    .set(auth(worker));
  expect(participant.status).toBe(200);
  expect(participant.headers['cache-control']).toBe('private, no-store');
  expect(participant.body.payment).toMatchObject({
    booking_id: booking.rows[0].id,
    status: 'paid',
    currency: 'ZAR',
  });
  expect(participant.body.payment).not.toHaveProperty('peach_checkout_id');
  expect(participant.body.payment).not.toHaveProperty('peach_result_code');
  expect(JSON.stringify(participant.body)).not.toContain('provider-private');

  const denied = await request
    .get(`/api/payments/status/${booking.rows[0].id}`)
    .set(auth(outsider));
  expect(denied.status).toBe(404);
});
