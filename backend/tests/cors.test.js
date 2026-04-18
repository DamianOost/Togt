const { request, app, db, truncateAll } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

// In the test env CORS_ORIGINS is empty and NODE_ENV=test (not "production"),
// so the code path returns `{}` to cors() -> default allow-any behaviour.
// This locks in the dev/test path. Testing the allowlist path requires a
// respawn since app.js resolves corsOrigins at require-time; deferred.
test('dev + empty CORS_ORIGINS allows any origin', async () => {
  const res = await request(app)
    .get('/health')
    .set('Origin', 'http://anything.example');
  expect(res.status).toBe(200);
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});
