const crypto = require('crypto');
const { request, app, db, truncateAll, registerUser } = require('./helpers');
const { __sent: sentEmails } = require('resend');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM password_resets');
  sentEmails.length = 0;
});

afterAll(async () => {
  if (db.end) await db.end();
});

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

describe('POST /auth/forgot-password', () => {
  test('known email: inserts code row + sends one email + returns 200', async () => {
    const u = await registerUser({ role: 'customer' });
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: u.email });
    expect(res.status).toBe(200);

    const rows = await db.query(
      'SELECT user_id, expires_at FROM password_resets WHERE user_id = $1',
      [u.user.id]
    );
    expect(rows.rows).toHaveLength(1);
    expect(new Date(rows.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(u.email);
    expect(sentEmails[0].subject).toMatch(/password reset/i);
    expect(sentEmails[0].text).toMatch(/\d{6}/);
  });

  test('unknown email: 200 (no account leak) and does NOT send', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'noone@example.com' });
    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(0);
    const rows = await db.query('SELECT * FROM password_resets');
    expect(rows.rows).toHaveLength(0);
  });

  test('missing email field: 400', async () => {
    const res = await request(app).post('/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  test('re-requesting invalidates the previous code', async () => {
    const u = await registerUser({ role: 'customer' });
    await request(app).post('/auth/forgot-password').send({ email: u.email });
    const firstCode = sentEmails[0].text.match(/(\d{6})/)[1];

    await request(app).post('/auth/forgot-password').send({ email: u.email });
    const secondCode = sentEmails[1].text.match(/(\d{6})/)[1];
    expect(secondCode).not.toBe(firstCode);

    // Try to reset using the FIRST (now superseded) code — should 400
    const res = await request(app).post('/auth/reset-password').send({
      email: u.email, code: firstCode, new_password: 'newpassword456',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/reset-password', () => {
  async function requestReset(email) {
    await request(app).post('/auth/forgot-password').send({ email });
    return sentEmails[sentEmails.length - 1].text.match(/(\d{6})/)[1];
  }

  test('valid code + new password: updates password, marks used, revokes refresh tokens, returns 200', async () => {
    const u = await registerUser({ role: 'customer' });
    const code = await requestReset(u.email);

    const preLogin = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
    expect(preLogin.status).toBe(200);

    const res = await request(app).post('/auth/reset-password').send({
      email: u.email,
      code,
      new_password: 'newpassword456',
    });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/auth/login').send({ email: u.email, password: 'newpassword456' });
    expect(newLogin.status).toBe(200);

    const origRefresh = await request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(origRefresh.status).toBe(401);

    const rows = await db.query('SELECT used_at FROM password_resets WHERE user_id = $1', [u.user.id]);
    expect(rows.rows[0].used_at).not.toBeNull();
  });

  test('wrong code: 400, password unchanged', async () => {
    const u = await registerUser({ role: 'customer' });
    await requestReset(u.email);

    const res = await request(app).post('/auth/reset-password').send({
      email: u.email,
      code: '000000',
      new_password: 'whatever12',
    });
    expect(res.status).toBe(400);

    const login = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
    expect(login.status).toBe(200);
  });

  test('reusing a used code: 400', async () => {
    const u = await registerUser({ role: 'customer' });
    const code = await requestReset(u.email);

    const first = await request(app).post('/auth/reset-password').send({
      email: u.email, code, new_password: 'newpassword456',
    });
    expect(first.status).toBe(200);

    const second = await request(app).post('/auth/reset-password').send({
      email: u.email, code, new_password: 'anotherpass789',
    });
    expect(second.status).toBe(400);
  });

  test('expired code: 400', async () => {
    const u = await registerUser({ role: 'customer' });
    const code = await requestReset(u.email);
    await db.query(
      `UPDATE password_resets SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1`,
      [u.user.id]
    );
    const res = await request(app).post('/auth/reset-password').send({
      email: u.email, code, new_password: 'newpassword456',
    });
    expect(res.status).toBe(400);
  });

  test('short password: 400 (min 8 chars)', async () => {
    const u = await registerUser({ role: 'customer' });
    const code = await requestReset(u.email);
    const res = await request(app).post('/auth/reset-password').send({
      email: u.email, code, new_password: 'short',
    });
    expect(res.status).toBe(400);
  });

  test('missing fields: 400', async () => {
    const res = await request(app).post('/auth/reset-password').send({});
    expect(res.status).toBe(400);
  });
});
