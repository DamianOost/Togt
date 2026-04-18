const jwt = require('jsonwebtoken');
const { request, app, db, truncateAll, registerUser } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
  // refresh_tokens is cascade-truncated via users, but be explicit for clarity.
  await db.query('DELETE FROM refresh_tokens');
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('Refresh-token revocation + /auth/logout', () => {
  test('register inserts a row into refresh_tokens with matching jti', async () => {
    const u = await registerUser({ role: 'customer' });
    const payload = jwt.decode(u.refreshToken);
    expect(payload.jti).toBeDefined();

    const rows = await db.query(
      'SELECT jti, user_id, revoked_at FROM refresh_tokens WHERE jti = $1',
      [payload.jti]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].user_id).toBe(u.user.id);
    expect(rows.rows[0].revoked_at).toBeNull();
  });

  test('refresh rotates: old jti revoked, new jti issued + persisted', async () => {
    const u = await registerUser({ role: 'customer' });
    const oldJti = jwt.decode(u.refreshToken).jti;

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: u.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeDefined();

    const newJti = jwt.decode(res.body.refreshToken).jti;
    expect(newJti).not.toBe(oldJti);

    const oldRow = await db.query(
      'SELECT revoked_at, replaced_by FROM refresh_tokens WHERE jti = $1',
      [oldJti]
    );
    expect(oldRow.rows[0].revoked_at).not.toBeNull();
    expect(oldRow.rows[0].replaced_by).toBe(newJti);

    const newRow = await db.query(
      'SELECT revoked_at FROM refresh_tokens WHERE jti = $1',
      [newJti]
    );
    expect(newRow.rows).toHaveLength(1);
    expect(newRow.rows[0].revoked_at).toBeNull();
  });

  test('reusing a revoked refresh token returns 401 and revokes all user sessions', async () => {
    const u = await registerUser({ role: 'customer' });
    const original = u.refreshToken;

    // First refresh rotates successfully
    const first = await request(app).post('/auth/refresh').send({ refreshToken: original });
    expect(first.status).toBe(200);

    // Replay of the original (now revoked) should 401
    const replay = await request(app).post('/auth/refresh').send({ refreshToken: original });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toMatch(/reuse|revoked|invalid/i);

    // Replay detection should also revoke the "live" token issued by the first refresh
    const liveRefresh = first.body.refreshToken;
    const tryLive = await request(app).post('/auth/refresh').send({ refreshToken: liveRefresh });
    expect(tryLive.status).toBe(401);
  });

  test('logout revokes current refresh token and clears push_token', async () => {
    const u = await registerUser({ role: 'customer' });
    // Seed a push token
    await request(app)
      .post('/auth/push-token')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ token: 'ExponentPushToken[testing-xyz]' });

    const before = await db.query('SELECT push_token FROM users WHERE id = $1', [u.user.id]);
    expect(before.rows[0].push_token).toBe('ExponentPushToken[testing-xyz]');

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ refreshToken: u.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const after = await db.query('SELECT push_token FROM users WHERE id = $1', [u.user.id]);
    expect(after.rows[0].push_token).toBeNull();

    const jtiPayload = jwt.decode(u.refreshToken);
    const row = await db.query(
      'SELECT revoked_at FROM refresh_tokens WHERE jti = $1',
      [jtiPayload.jti]
    );
    expect(row.rows[0].revoked_at).not.toBeNull();

    const replay = await request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(replay.status).toBe(401);
  });

  test('logout without a refreshToken still clears push_token (best-effort)', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app)
      .post('/auth/push-token')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ token: 'ExponentPushToken[only-clear]' });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({});
    expect(res.status).toBe(200);

    const after = await db.query('SELECT push_token FROM users WHERE id = $1', [u.user.id]);
    expect(after.rows[0].push_token).toBeNull();
  });

  test('logout without auth header returns 401', async () => {
    const res = await request(app).post('/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});
