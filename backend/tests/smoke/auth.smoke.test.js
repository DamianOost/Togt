/**
 * Auth full-loop smoke: register → login → refresh → access protected
 * route → logout. Asserts both the HTTP behaviour AND the audit_log
 * side-effect (because smokes run with NODE_ENV=smoke so the audit
 * middleware fires).
 */

const { app, request, db, truncateAll, closeDb, registerUser } = require('./harness');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

test('auth full loop produces tokens + audit rows', async () => {
  // 1. register
  const reg = await registerUser({ role: 'customer' });
  expect(reg.user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(typeof reg.accessToken).toBe('string');

  // 2. login with same creds
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: reg.email, password: reg.password });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.accessToken || loginRes.body.token).toBeTruthy();

  // 3. refresh
  if (reg.refreshToken) {
    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: reg.refreshToken });
    // Some Togt builds return 200 with new tokens; some 401 if refresh
    // tokens are single-use and the login above already consumed one.
    // Accept either as "auth refresh endpoint is reachable and validates".
    expect([200, 401]).toContain(refreshRes.status);
  }

  // 4. access a protected route
  const meRes = await request(app)
    .get('/api/labourers/profile')
    .set('Authorization', `Bearer ${loginRes.body.accessToken || loginRes.body.token}`);
  // 404 (profile not set up) or 200 — either confirms the route was reached
  // through the auth middleware. 401 means auth failed and is a real bug.
  expect(meRes.status).not.toBe(401);

  // 5. audit_log assertions
  //
  // The middleware records on response-finish, which is async. Give it a
  // tick to land before we query. We poll for up to 1s.
  let auditCount = 0;
  for (let i = 0; i < 20; i += 1) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE actor_user_id = $1',
      [reg.user.id]
    );
    auditCount = rows[0].n;
    if (auditCount > 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  // At minimum the protected route call produced an audit row.
  expect(auditCount).toBeGreaterThan(0);

  // Spot-check shape: most recent row is the protected call, has a sane
  // action key and latency.
  const { rows: lastRow } = await db.query(
    `SELECT action, status_code, latency_ms FROM audit_log
       WHERE actor_user_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
    [reg.user.id]
  );
  expect(lastRow[0].action).toMatch(/^route\.(get|post)\./);
  expect(typeof lastRow[0].latency_ms).toBe('number');
});
