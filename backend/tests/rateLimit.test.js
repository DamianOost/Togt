const { request, app, truncateAll, db } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

// express-rate-limit uses an in-process memory store keyed by IP. Inside
// supertest all requests come from ::ffff:127.0.0.1, so the window is shared
// across the whole suite. Keep this test isolated to its own file so the
// limit-trip does not interfere with other tests that also hit /auth routes.
test('/auth/login returns 429 after 10 failed attempts', async () => {
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'none@x', password: 'x' });
    codes.push(res.status);
  }
  expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
  expect(codes[10]).toBe(429);
  expect(codes[11]).toBe(429);
});
