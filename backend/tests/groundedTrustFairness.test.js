const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const groundedTrustRouter = require('../src/routes/groundedTrust');
const { groundedTrustErrorHandler } = require('../src/middleware/groundedTrustErrors');
const { problemHandler } = require('../src/lib/problemJson');

const app = express();
app.use(express.json());
app.use('/api', groundedTrustRouter);
app.use(groundedTrustErrorHandler);
app.use(problemHandler);
const request = supertest(app);

function auth(user) {
  const token = signAccessToken({ id: user.id, role: user.role });
  return { Authorization: `Bearer ${token}` };
}

async function user(role, suffix) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, 'test-hash', $4)
     RETURNING id, role`,
    [`Fairness ${role}`, `${role}-${suffix}@fairness.example.test`, `084${suffix}`, role]
  );
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (user_id, skills, hourly_rate, is_available)
       VALUES ($1, ARRAY['Painting'], 300, true)`,
      [result.rows[0].id]
    );
  }
  return result.rows[0];
}

async function fixture() {
  const suffix = String(Math.floor(Math.random() * 8_000_000) + 1_000_000);
  const customer = await user('customer', suffix);
  const worker = await user('labourer', String(Number(suffix) + 1));
  const completed = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, completed_at
     ) VALUES ($1, $2, 'completed', 'closed', 'Painting',
               'PRIVATE ADDRESS MUST NOT LEAK', -33.9, 18.4, NOW() + INTERVAL '1 day', NOW())
     RETURNING id`,
    [customer.id, worker.id]
  );
  await db.query(
    `INSERT INTO ratings (
       booking_id, reviewer_id, reviewee_id, score, comment,
       publication_status, publish_after, published_at
     ) VALUES (
       $1, $2, $3, 4, 'PRIVATE RATING COMMENT MUST NOT LEAK',
       'published', NOW(), NOW()
     )`,
    [completed.rows[0].id, worker.id, customer.id]
  );
  const cancelled = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, cancelled_by
     ) VALUES ($1, $2, 'cancelled', 'closed', 'Painting',
               'SECOND PRIVATE ADDRESS', -33.9, 18.4, NOW() + INTERVAL '1 day', $1)
     RETURNING id`,
    [customer.id, worker.id]
  );
  await db.query(
    `INSERT INTO grounded_no_show_reports (
       booking_id, reported_by, absent_role, status, attestation
     ) VALUES ($1, $2, 'customer', 'received', 'PRIVATE ATTESTATION MUST NOT LEAK')`,
    [cancelled.rows[0].id, worker.id]
  );
  return { customer, worker };
}

beforeEach(async () => {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

describe('two-sided Trust & fairness evidence', () => {
  test('requires an authenticated participant', async () => {
    const response = await request.get('/api/trust/fairness');
    expect(response.status).toBe(401);
  });

  test('separates ratings and reliability facts without leaking source narratives', async () => {
    const { customer } = await fixture();
    const response = await request.get('/api/trust/fairness').set(auth(customer));

    expect(response.status).toBe(200);
    expect(response.body.schema).toBe('togt.trust.v1');
    expect(response.body.fairness.summary).toMatch(/does not collapse/i);
    expect(response.body.fairness.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'completed-projects', valueLabel: '1', sampleSize: 2 }),
      expect.objectContaining({ id: 'participant-ratings', valueLabel: '4.00 / 5', sampleSize: 1 }),
      expect.objectContaining({ id: 'actor-cancellations', valueLabel: '1', sampleSize: 2 }),
      expect.objectContaining({ id: 'no-show-records', valueLabel: '1', sampleSize: 1 }),
    ]));
    expect(response.body.fairness.restriction).toMatchObject({
      status: 'none',
      reasonCode: null,
      humanReview: { available: true, channel: 'in_app_record' },
    });
    const wire = JSON.stringify(response.body);
    expect(wire).not.toMatch(/PRIVATE|ADDRESS|ATTESTATION|RATING COMMENT/);
    expect(wire).not.toContain(customer.id);
  });

  test('uses the same evidence contract for a Worker without inventing an average', async () => {
    const { worker } = await fixture();
    const response = await request.get('/api/trust/fairness').set(auth(worker));

    expect(response.status).toBe(200);
    expect(response.body.fairness.title).toBe('Your Worker evidence');
    expect(response.body.fairness.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'participant-ratings', valueLabel: 'No ratings received', sampleSize: 0 }),
      expect.objectContaining({ id: 'actor-cancellations', valueLabel: '0', sampleSize: 2 }),
      expect.objectContaining({ id: 'no-show-records', valueLabel: '0', sampleSize: 0 }),
    ]));
  });
});
