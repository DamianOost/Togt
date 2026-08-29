const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('legacy worker availability gate', () => {
  test.each(['put', 'patch'])('%s cannot turn a Worker online before canonical activation', async (method) => {
    const worker = await registerUser({ role: 'labourer', name: `Readiness ${method}` });

    const response = await request(app)[method]('/labourers/availability')
      .set(authHeader(worker.accessToken))
      .send({ is_available: true });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'worker_activation_incomplete',
      reason_code: 'worker_online_prerequisites_incomplete',
      activation_path: '/api/worker/activation',
    });
    const stored = await db.query(
      'SELECT is_available FROM labourer_profiles WHERE user_id = $1',
      [worker.user.id]
    );
    expect(stored.rows[0].is_available).toBe(false);
  });

  test('turning availability off remains an unconditional safe escape', async () => {
    const worker = await registerUser({ role: 'labourer', name: 'Safe offline Worker' });
    await db.query(
      'UPDATE labourer_profiles SET is_available = true WHERE user_id = $1',
      [worker.user.id]
    );

    const response = await request(app)
      .patch('/labourers/availability')
      .set(authHeader(worker.accessToken))
      .send({ is_available: false });

    expect(response.status).toBe(200);
    expect(response.body.profile.is_available).toBe(false);
  });
});
