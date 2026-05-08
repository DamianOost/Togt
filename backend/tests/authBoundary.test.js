/**
 * Auth-boundary contract: middleware/auth.js now emits RFC 9457
 * problem+json instead of plain application/json. The mobile app v1
 * still works because problemResponse populates body.error with the
 * human title, but agents and OpenAPI consumers can pattern-match on
 * body.type for the new auth_missing_token / auth_invalid_token /
 * auth_forbidden_role types.
 */

const { request, app, db } = require('./helpers');

afterAll(async () => {
  if (db.end) await db.end();
});

describe('auth boundary returns RFC 9457 problem+json', () => {
  test('missing Authorization header => 401 auth_missing_token', async () => {
    const res = await request(app).get('/api/webhook-subscriptions');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.type).toMatch(/errors\/auth_missing_token/);
    expect(res.body.title).toBe('No token provided');
    expect(res.body.error).toBe('No token provided'); // legacy mobile-app v1 field preserved
    expect(res.body.status).toBe(401);
    expect(res.body.instance).toBe('/api/webhook-subscriptions');
  });

  test('garbage Bearer token => 401 auth_invalid_token', async () => {
    const res = await request(app)
      .get('/api/webhook-subscriptions')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.type).toMatch(/errors\/auth_invalid_token/);
    expect(res.body.title).toBe('Invalid or expired token');
    expect(res.body.error).toBe('Invalid or expired token'); // legacy
  });

  test('non-Bearer auth scheme => 401 auth_missing_token (treats as missing)', async () => {
    const res = await request(app)
      .get('/api/webhook-subscriptions')
      .set('Authorization', 'Basic Zm9vOmJhcg==');
    expect(res.status).toBe(401);
    expect(res.body.type).toMatch(/errors\/auth_missing_token/);
  });
});
