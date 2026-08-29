const jwt = require('jsonwebtoken');
const { jwtRefreshSecret } = require('../src/config/env');
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
    expect(jwt.decode(u.accessToken).token_type).toBe('access');
    expect(payload.token_type).toBe('refresh');

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

  test('access-purpose token signed with the refresh key cannot rotate a session', async () => {
    const u = await registerUser({ role: 'customer' });
    const storedRefresh = jwt.decode(u.refreshToken);
    const wrongPurpose = jwt.sign(
      {
        id: u.user.id,
        role: u.user.role,
        jti: storedRefresh.jti,
        token_type: 'access',
      },
      jwtRefreshSecret,
      { algorithm: 'HS256', expiresIn: '5m' }
    );

    const res = await request(app).post('/auth/refresh').send({ refreshToken: wrongPurpose });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);

    const row = await db.query('SELECT revoked_at FROM refresh_tokens WHERE jti = $1', [storedRefresh.jti]);
    expect(row.rows[0].revoked_at).toBeNull();
  });

  test('a minted refresh token cannot be used as HTTP bearer access', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${u.refreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.type).toMatch(/errors\/auth_invalid_token/);
  });

  test('simultaneous refresh claims mint exactly one live child without revoking the winner', async () => {
    const u = await registerUser({ role: 'customer' });
    const originalJti = jwt.decode(u.refreshToken).jti;

    const responses = await Promise.all([
      request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken }),
      request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken }),
    ]);
    const winner = responses.find((response) => response.status === 200);
    const concurrentLoser = responses.find((response) => response.status === 409);

    expect(winner).toBeDefined();
    expect(concurrentLoser).toBeDefined();
    expect(concurrentLoser.body).toMatchObject({
      error: 'refresh_rotation_already_completed',
      retryable: false,
    });

    const winnerJti = jwt.decode(winner.body.refreshToken).jti;
    const rows = await db.query(
      `SELECT jti, revoked_at, replaced_by
         FROM refresh_tokens
        WHERE user_id = $1
        ORDER BY created_at`,
      [u.user.id]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.find((row) => row.jti === originalJti)).toMatchObject({
      replaced_by: winnerJti,
    });
    expect(rows.rows.filter((row) => row.revoked_at === null).map((row) => row.jti)).toEqual([winnerJti]);

    const winnerStillLive = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: winner.body.refreshToken });
    expect(winnerStillLive.status).toBe(200);
  });

  test('reusing a revoked refresh token returns 401 and revokes all user sessions', async () => {
    const u = await registerUser({ role: 'customer' });
    const original = u.refreshToken;

    // First refresh rotates successfully
    const first = await request(app).post('/auth/refresh').send({ refreshToken: original });
    expect(first.status).toBe(200);

    // Move the server-recorded rotation outside the narrow concurrent-request
    // grace. Reuse after this point is distinguishable from an in-flight loser
    // and must revoke the token family.
    await db.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW() - INTERVAL '1 minute'
        WHERE jti = $1`,
      [jwt.decode(original).jti]
    );

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
    // Seed legacy state directly: remote-push registration is deliberately
    // disabled, while logout must still clean up tokens stored by older builds.
    await db.query('UPDATE users SET push_token = $1 WHERE id = $2', [
      'ExponentPushToken[testing-xyz]',
      u.user.id,
    ]);

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
    await db.query('UPDATE users SET push_token = $1 WHERE id = $2', [
      'ExponentPushToken[only-clear]',
      u.user.id,
    ]);

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
