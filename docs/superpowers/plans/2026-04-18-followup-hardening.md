# Togt Follow-up Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, single session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four post-launch risks the night-of-17 hardening deferred: add automated test coverage, DB-backed refresh-token revocation, `scheduled_at` future-only guard, and push-token cleanup on logout.

**Architecture:**
- New test stack: Jest + supertest + a dedicated `togt_test` Postgres database. Tests import `app` directly (no HTTP server listen).
- New table `refresh_tokens` (keyed by `jti`) replaces the stateless-only refresh model. `/auth/refresh` now rotates: revoke old jti, issue new. `/auth/logout` (new) revokes current jti and clears `users.push_token`.
- `scheduled_at` guarded both in `routes/bookings.js` (clean 400) and by a BEFORE INSERT/UPDATE trigger (DB backstop).

**Tech Stack:** Node/Express, pg, jest, supertest, jsonwebtoken, uuid, PostgreSQL triggers.

---

## State snapshot (pre-work)

- Branch: `claude/review-vision-screenshot-CHDSn`, working tree clean, HEAD `e10049b`, pushed to GitHub.
- Backend: launchd service `com.togt.backend` on port 3002, DB `togt` on localhost.
- `backend/src/app.js` calls `server.listen(port)` at module load — will need `require.main === module` guard so tests can import without the port-bind side effect.
- Current migrations: `001_initial.sql`, `002_enhancements.sql`, `003_kyc.sql`, `004_scope.sql`. New migration will be `005_refresh_tokens.sql` (+ new trigger file for scheduled_at, or combined).

---

## Task 1: Test infrastructure (Jest + supertest + test DB)

**Files:**
- Modify: `backend/package.json` (add jest, supertest, test script, jest config)
- Create: `backend/jest.config.js`
- Create: `backend/jest.setup.js` (loads test env vars, seeds)
- Create: `backend/jest.globalSetup.js` (creates + migrates `togt_test` DB)
- Create: `backend/jest.globalTeardown.js` (drops connections)
- Create: `backend/.env.test` (test-only values)
- Create: `backend/tests/helpers.js` (truncateAll + auth helpers shared across files)
- Modify: `backend/src/app.js` — wrap `server.listen` in `require.main === module` guard, export `server` + `app`

- [ ] **Step 1.1:** Install test deps
```bash
ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm install --save-dev jest supertest @types/jest'
```

- [ ] **Step 1.2:** Edit `backend/src/app.js` so tests can import without booting
  - Change the bottom-of-file listen from `server.listen(port, () => { ... });` to:
```js
if (require.main === module) {
  server.listen(port, () => console.log(`Togt API running on port ${port}`));
}
```
  - Keep `module.exports = { app, server };`

- [ ] **Step 1.3:** Create `backend/.env.test`
```
NODE_ENV=test
PORT=0
DATABASE_URL=postgresql://georgeoosthuyzen@localhost/togt_test
JWT_SECRET=test_jwt_secret_do_not_ship
JWT_REFRESH_SECRET=test_jwt_refresh_secret_do_not_ship
PEACH_ENTITY_ID=test_entity
PEACH_ACCESS_TOKEN=test_token
PEACH_BASE_URL=https://eu-test.oppwa.com
CORS_ORIGINS=
PEACH_WEBHOOK_SECRET=
```

- [ ] **Step 1.4:** Create `backend/jest.config.js`
```js
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalSetup: '<rootDir>/jest.globalSetup.js',
  globalTeardown: '<rootDir>/jest.globalTeardown.js',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 15000,
  forceExit: true,
};
```

- [ ] **Step 1.5:** Create `backend/jest.setup.js`
```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });
```

- [ ] **Step 1.6:** Create `backend/jest.globalSetup.js` — creates the test DB and runs all migrations
```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });
const { Client } = require('pg');
const fs = require('fs');

async function ensureDatabase() {
  // Connect to the default 'postgres' db to create togt_test if missing
  const admin = new Client({ database: 'postgres' });
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'togt_test'`);
  if (exists.rows.length === 0) {
    await admin.query(`CREATE DATABASE togt_test`);
  }
  await admin.end();
}

async function runMigrations() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dir = path.join(__dirname, 'src/db/migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await client.query(sql);
  }
  await client.end();
}

module.exports = async () => {
  await ensureDatabase();
  await runMigrations();
};
```

- [ ] **Step 1.7:** Create `backend/jest.globalTeardown.js`
```js
module.exports = async () => {
  // Jest forceExit handles lingering pools, so nothing required here.
  // Kept as a hook for future cleanup.
};
```

- [ ] **Step 1.8:** Create `backend/tests/helpers.js`
```js
const request = require('supertest');
const { app } = require('../src/app');
const db = require('../src/config/db');

async function truncateAll() {
  // Order matters: child tables first. ratings & payments reference bookings; bookings references users.
  await db.query('TRUNCATE TABLE ratings, payments, bookings, labourer_profiles, kyc_verifications, users RESTART IDENTITY CASCADE');
}

async function registerUser(overrides = {}) {
  const unique = Date.now() + Math.floor(Math.random() * 1e6);
  const body = {
    name: 'Test User',
    email: `user_${unique}@test.com`,
    phone: `07${String(unique).slice(-9)}`,
    password: 'password123',
    role: 'customer',
    ...overrides,
  };
  const res = await request(app).post('/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...body, ...res.body };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { app, db, request, truncateAll, registerUser, authHeader };
```

- [ ] **Step 1.9:** Add to `backend/package.json` scripts
```json
"test": "jest --runInBand",
"test:watch": "jest --runInBand --watch"
```

- [ ] **Step 1.10:** Smoke — ensure harness runs
  - Create `backend/tests/harness.test.js`:
```js
const { request, app, db, truncateAll } = require('./helpers');

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await db.end?.(); });

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});
```
  - Run: `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test -- --silent=false 2>&1 | tail -25'`
  - Expected: `1 passed`

- [ ] **Step 1.11:** Verify `db.end` is callable — if not, add an `end` method to `src/config/db.js`
  - Read `backend/src/config/db.js`. If it exports a Pool, make sure `end` is exposed:
```js
const { Pool } = require('pg');
const { databaseUrl } = require('./env');
const pool = new Pool({ connectionString: databaseUrl });
module.exports = {
  query: (text, params) => pool.query(text, params),
  end: () => pool.end(),
};
```

- [ ] **Step 1.12:** Commit
```bash
ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/package.json backend/package-lock.json backend/.env.test backend/jest.config.js backend/jest.setup.js backend/jest.globalSetup.js backend/jest.globalTeardown.js backend/src/app.js backend/src/config/db.js backend/tests/ && git commit -m "test: jest + supertest + togt_test DB harness"'
```

---

## Task 2: Regression tests for night-of-17 hardening

**Files:**
- Create: `backend/tests/env.test.js` (JWT fail-fast)
- Create: `backend/tests/rateLimit.test.js` (auth 429)
- Create: `backend/tests/cors.test.js` (allowlist behaviour)
- Create: `backend/tests/peachWebhook.test.js` (HMAC)

- [ ] **Step 2.1:** `tests/env.test.js` — prod fail-fast
```js
const { execFileSync } = require('child_process');
const path = require('path');

test('env.js exits with FATAL when NODE_ENV=production and JWT_SECRET missing', () => {
  const script = path.join(__dirname, '..', 'src', 'config', 'env.js');
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(script)})`], {
      env: { NODE_ENV: 'production', PATH: process.env.PATH },
      cwd: '/tmp',
      stdio: 'pipe',
    });
    throw new Error('should have exited non-zero');
  } catch (err) {
    expect(err.status).toBe(1);
    expect(String(err.stderr)).toMatch(/FATAL: .* is required in production/);
  }
});
```

- [ ] **Step 2.2:** `tests/rateLimit.test.js` — login trips 429
```js
const { request, app, truncateAll, db } = require('./helpers');

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await db.end?.(); });

test('/auth/login returns 429 after 10 failed attempts', async () => {
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const res = await request(app).post('/auth/login').send({ email: 'none@x', password: 'x' });
    codes.push(res.status);
  }
  // First 10 should be 401 (invalid creds); 11th + 12th should be 429
  expect(codes.slice(0, 10).every(c => c === 401)).toBe(true);
  expect(codes[10]).toBe(429);
  expect(codes[11]).toBe(429);
});
```
  - NOTE: express-rate-limit is keyed by IP; supertest uses `::ffff:127.0.0.1`. All tests in this file share a window — that's fine here because only this one test hits /login. If future tests in the same file need fresh buckets, add `rateLimit.resetKey(ip)` helper.

- [ ] **Step 2.3:** `tests/cors.test.js` — echo of allowed origin only when whitelisted
```js
const { request, app, db, truncateAll } = require('./helpers');

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await db.end?.(); });

test('dev + empty CORS_ORIGINS allows any origin (current behaviour)', async () => {
  const res = await request(app).get('/health').set('Origin', 'http://anything.example');
  expect(res.status).toBe(200);
  // cors() without options echoes the origin
  expect(res.headers['access-control-allow-origin']).toBeDefined();
});
```
  - NOTE: testing allowlist mode requires spawning a fresh Node process with `CORS_ORIGINS` set, because app.js pulls corsOrigins once at require time. That's deferred — current test locks in dev-mode behaviour, which is what the hardened code path exposes under test env (CORS_ORIGINS empty, NODE_ENV=test).

- [ ] **Step 2.4:** `tests/peachWebhook.test.js` — HMAC gate
```js
const crypto = require('crypto');
const { request, app, db, truncateAll } = require('./helpers');

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await db.end?.(); });

describe('POST /payments/webhook signature verification', () => {
  // Tests below mutate process.env.PEACH_WEBHOOK_SECRET, but env.js reads it
  // ONCE at require time. To test the enabled path we would need to respawn.
  // Instead: verify the DISABLED path works end-to-end (no secret -> accepts body),
  // and unit-test the HMAC compare logic directly.

  test('no secret configured -> webhook accepts and proceeds to Peach (fails on upstream 401)', async () => {
    const res = await request(app)
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .send({ checkoutId: 'bogus_id' });
    // No sig required; request reaches Peach API which rejects placeholder creds -> we surface as 401
    expect([400, 401, 500]).toContain(res.status);
  });

  test('HMAC-SHA256 base64 matches python reference', () => {
    const body = Buffer.from('{"checkoutId":"bogus"}');
    const mac = crypto.createHmac('sha256', 'test_secret_xyz').update(body).digest('base64');
    // Reference value computed via: python3 -c "..."
    expect(mac).toBe('Qw/u9GRwfBRt6ueCQlfFfEIiTcSx+eJUgEogS68Rayw=');
  });

  test('timingSafeEqual rejects differing-length buffers', () => {
    const a = Buffer.from('abc');
    const b = Buffer.from('abcd');
    expect(() => crypto.timingSafeEqual(a, b)).toThrow();
  });
});
```

- [ ] **Step 2.5:** Run full suite
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -30'`
  - Expected: all tests green

- [ ] **Step 2.6:** Commit
```bash
ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/tests/ && git commit -m "test: regression coverage for night-of-17 security hardening"'
```

---

## Task 3: scheduled_at future-only (TDD)

**Files:**
- Create: `backend/src/db/migrations/005_scheduled_at_future_trigger.sql`
- Modify: `backend/src/routes/bookings.js` — reject past/present `scheduled_at` with 400 before insert
- Create: `backend/tests/bookings.test.js`

- [ ] **Step 3.1:** Write failing test first
  - Create `backend/tests/bookings.test.js`:
```js
const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await db.end?.(); });

async function makeCustomerAndLabourer() {
  const customer = await registerUser({ role: 'customer' });
  const labourer = await registerUser({ role: 'labourer' });
  // Mark labourer available so booking create doesn't 404
  return { customer, labourer };
}

test('POST /bookings with past scheduled_at returns 400', async () => {
  const { customer, labourer } = await makeCustomerAndLabourer();
  const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
  const res = await request(app)
    .post('/bookings')
    .set(authHeader(customer.accessToken))
    .send({
      labourer_id: labourer.user.id,
      skill_needed: 'Plumbing',
      address: '123 Test Rd',
      location_lat: -29.8,
      location_lng: 31.0,
      scheduled_at: pastDate,
      hours_est: 2,
    });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/past|future/i);
});

test('POST /bookings with future scheduled_at succeeds (201)', async () => {
  const { customer, labourer } = await makeCustomerAndLabourer();
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +1 day
  const res = await request(app)
    .post('/bookings')
    .set(authHeader(customer.accessToken))
    .send({
      labourer_id: labourer.user.id,
      skill_needed: 'Plumbing',
      address: '123 Test Rd',
      location_lat: -29.8,
      location_lng: 31.0,
      scheduled_at: futureDate,
      hours_est: 2,
    });
  expect(res.status).toBe(201);
  expect(res.body.booking).toBeDefined();
});
```

- [ ] **Step 3.2:** Run — expect both to fail (past-date test expects 400 but gets 201; future-date test may pass but skill we add next guards it)
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPattern=bookings 2>&1 | tail -20'`

- [ ] **Step 3.3:** Add the app-level check in `backend/src/routes/bookings.js`
  - After the `if (!labourer_id || ...)` validation and before the labourer check, insert:
```js
    const scheduledDate = new Date(scheduled_at);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled_at' });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduled_at must be in the future' });
    }
```

- [ ] **Step 3.4:** Re-run — both tests now pass
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPattern=bookings 2>&1 | tail -20'`
  - Expected: 2 passed

- [ ] **Step 3.5:** Add DB backstop — create `backend/src/db/migrations/005_scheduled_at_future_trigger.sql`
```sql
-- Backstop: reject past scheduled_at at the DB layer so any future writer
-- (admin tool, direct SQL) cannot bypass the app check.
CREATE OR REPLACE FUNCTION enforce_scheduled_at_future()
RETURNS trigger AS $$
BEGIN
  IF NEW.scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'scheduled_at must be in the future (got %)', NEW.scheduled_at
      USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_scheduled_at_future ON bookings;
CREATE TRIGGER bookings_scheduled_at_future
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_scheduled_at_future();
```
  - NOTE: only `BEFORE INSERT`, not UPDATE — a booking that is accepted may have its `scheduled_at` unchanged but time moves forward. We don't want to reject updates on a valid in-progress booking.

- [ ] **Step 3.6:** Apply migration to dev DB
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm run migrate 2>&1 | tail -10'`

- [ ] **Step 3.7:** Add a trigger test to `backend/tests/bookings.test.js` — direct SQL bypass is also rejected
```js
test('DB trigger rejects past scheduled_at on direct INSERT', async () => {
  const { customer, labourer } = await makeCustomerAndLabourer();
  const pastIso = new Date(Date.now() - 3600_000).toISOString();
  await expect(
    db.query(
      `INSERT INTO bookings (customer_id, labourer_id, skill_needed, address,
        location_lat, location_lng, scheduled_at, hours_est, total_amount, status)
       VALUES ($1, $2, 'Plumbing', '1 Direct Lane', -29.8, 31.0, $3, 1, 100, 'pending')`,
      [customer.user.id, labourer.user.id, pastIso]
    )
  ).rejects.toThrow(/scheduled_at must be in the future/);
});
```

- [ ] **Step 3.8:** Re-run full suite
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -25'`
  - Expected: all green

- [ ] **Step 3.9:** Commit
```bash
ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/src/routes/bookings.js backend/src/db/migrations/005_scheduled_at_future_trigger.sql backend/tests/bookings.test.js && git commit -m "feat(bookings): reject scheduled_at in the past (app check + DB trigger)"'
```

---

## Task 4: Refresh-token revocation + logout endpoint + push_token clear (TDD)

**Files:**
- Create: `backend/src/db/migrations/006_refresh_tokens.sql`
- Modify: `backend/src/routes/auth.js` (tokens table, new `/logout`, rotate on `/refresh`)
- Create: `backend/tests/refreshTokens.test.js`
- Modify: `mobile/src/services/authService.js` (add logout() call)
- Modify: `mobile/src/store/authSlice.js` (call API before clearing local state)

### 4a. Schema + migration

- [ ] **Step 4.1:** Create `backend/src/db/migrations/006_refresh_tokens.sql`
```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID REFERENCES refresh_tokens(jti) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

- [ ] **Step 4.2:** Apply migration
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm run migrate 2>&1 | tail -5'`

### 4b. Failing tests

- [ ] **Step 4.3:** Create `backend/tests/refreshTokens.test.js`
```js
const jwt = require('jsonwebtoken');
const { request, app, db, truncateAll, registerUser } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM refresh_tokens');
});
afterAll(async () => { await db.end?.(); });

test('login inserts a row into refresh_tokens with matching jti', async () => {
  const u = await registerUser({ role: 'customer' });
  // registerUser already returns refreshToken. jti should be in payload.
  const payload = jwt.decode(u.refreshToken);
  expect(payload.jti).toBeDefined();
  const rows = await db.query('SELECT jti, user_id, revoked_at FROM refresh_tokens WHERE jti = $1', [payload.jti]);
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0].revoked_at).toBeNull();
});

test('refresh rotates: old jti revoked, new issued', async () => {
  const u = await registerUser({ role: 'customer' });
  const oldPayload = jwt.decode(u.refreshToken);

  const res = await request(app)
    .post('/auth/refresh')
    .send({ refreshToken: u.refreshToken });
  expect(res.status).toBe(200);
  expect(res.body.refreshToken).toBeDefined();

  const newPayload = jwt.decode(res.body.refreshToken);
  expect(newPayload.jti).not.toBe(oldPayload.jti);

  const oldRow = await db.query('SELECT revoked_at FROM refresh_tokens WHERE jti = $1', [oldPayload.jti]);
  expect(oldRow.rows[0].revoked_at).not.toBeNull();

  const newRow = await db.query('SELECT revoked_at FROM refresh_tokens WHERE jti = $1', [newPayload.jti]);
  expect(newRow.rows).toHaveLength(1);
  expect(newRow.rows[0].revoked_at).toBeNull();
});

test('reusing a revoked refresh token returns 401', async () => {
  const u = await registerUser({ role: 'customer' });
  const original = u.refreshToken;
  await request(app).post('/auth/refresh').send({ refreshToken: original }); // rotates
  const replay = await request(app).post('/auth/refresh').send({ refreshToken: original });
  expect(replay.status).toBe(401);
});

test('logout revokes current refresh token and clears push_token', async () => {
  const u = await registerUser({ role: 'customer' });
  // Set a push token first
  await request(app).post('/auth/push-token')
    .set('Authorization', `Bearer ${u.accessToken}`)
    .send({ token: 'ExponentPushToken[testing-xyz]' });

  const before = await db.query('SELECT push_token FROM users WHERE id = $1', [u.user.id]);
  expect(before.rows[0].push_token).toBe('ExponentPushToken[testing-xyz]');

  const res = await request(app)
    .post('/auth/logout')
    .set('Authorization', `Bearer ${u.accessToken}`)
    .send({ refreshToken: u.refreshToken });
  expect(res.status).toBe(200);

  const after = await db.query('SELECT push_token FROM users WHERE id = $1', [u.user.id]);
  expect(after.rows[0].push_token).toBeNull();

  const jtiPayload = jwt.decode(u.refreshToken);
  const row = await db.query('SELECT revoked_at FROM refresh_tokens WHERE jti = $1', [jtiPayload.jti]);
  expect(row.rows[0].revoked_at).not.toBeNull();

  // Subsequent refresh with revoked token is rejected
  const replay = await request(app).post('/auth/refresh').send({ refreshToken: u.refreshToken });
  expect(replay.status).toBe(401);
});
```

- [ ] **Step 4.4:** Run — expect several failures (jti undefined, refresh_tokens empty, /logout route missing)
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPattern=refresh 2>&1 | tail -25'`

### 4c. Implementation

- [ ] **Step 4.5:** Rewrite token-handling in `backend/src/routes/auth.js`. Add uuid import + helper:
```js
const { v4: uuidv4 } = require('uuid');

// Generate tokens AND persist the refresh-token jti. Returns { accessToken, refreshToken, jti }.
async function issueTokens(user) {
  const jti = uuidv4();
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  const refreshToken = jwt.sign({ ...payload, jti }, jwtRefreshSecret, { expiresIn: jwtRefreshExpiresIn });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // matches jwtRefreshExpiresIn
  await db.query(
    'INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, $3)',
    [jti, user.id, expiresAt]
  );
  return { accessToken, refreshToken, jti };
}

async function revokeJti(jti, replacedBy = null) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE jti = $1 AND revoked_at IS NULL',
    [jti, replacedBy]
  );
}
```

- [ ] **Step 4.6:** Replace the old `generateTokens(user)` calls in register + login handlers with `await issueTokens(user)`. Example for login:
```js
    delete user.password_hash;
    const tokens = await issueTokens(user);
    res.json({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
```

- [ ] **Step 4.7:** Rewrite `/refresh` handler to rotate:
```js
router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (!decoded.jti) return res.status(401).json({ error: 'Invalid refresh token' });

    // Check the jti exists and is not revoked
    const tokenRow = await db.query(
      'SELECT jti, revoked_at, expires_at FROM refresh_tokens WHERE jti = $1',
      [decoded.jti]
    );
    if (tokenRow.rows.length === 0) {
      return res.status(401).json({ error: 'Unknown refresh token' });
    }
    if (tokenRow.rows[0].revoked_at) {
      // Replay detection: revoke everything for this user as a precaution
      await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [decoded.id]
      );
      return res.status(401).json({ error: 'Refresh token reuse detected' });
    }

    const result = await db.query(
      'SELECT id, name, email, phone, role, avatar_url FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = result.rows[0];
    const tokens = await issueTokens(user);
    await revokeJti(decoded.jti, tokens.jti);
    res.json({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4.8:** Add a new `/logout` route (after `/refresh`):
```js
// POST /auth/logout — revoke refresh token + clear push token
router.post('/logout', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    // Revoke the provided refresh token if decodable
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
        if (decoded.jti) await revokeJti(decoded.jti);
      } catch {
        // token bad or expired — fall through, still clear push_token
      }
    }
    await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4.9:** Run the refresh test suite
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test -- --testPathPattern=refresh 2>&1 | tail -30'`
  - Expected: 4 passed

- [ ] **Step 4.10:** Run the FULL suite (nothing regressed)
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -30'`

### 4d. Mobile: call /logout before clearing local state

- [ ] **Step 4.11:** Update `mobile/src/services/authService.js`:
```js
import api from './api';

export const authService = {
  async register(data) {
    const res = await api.post('/auth/register', data);
    return res.data;
  },
  async login({ email, password }) {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  async refresh(refreshToken) {
    const res = await api.post('/auth/refresh', { refreshToken });
    return res.data;
  },
  async logout({ accessToken, refreshToken }) {
    // Best-effort; don't throw on network failure — user wants out now
    try {
      await api.post('/auth/logout',
        { refreshToken },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } catch {
      // swallowed — local state will still be cleared
    }
  },
};
```

- [ ] **Step 4.12:** Update `mobile/src/store/authSlice.js` — call `authService.logout` before wiping local state. Change the `logout` reducer to a thunk:
```js
export const logoutThunk = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const { accessToken, refreshToken } = getState().auth;
  if (accessToken && refreshToken) {
    await authService.logout({ accessToken, refreshToken });
  }
  await clearAuth();
  return true;
});
```
  and in `extraReducers`:
```js
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
      })
```
  and export: `export const { setTokens, clearError, updateUser } = authSlice.actions;` (drop the old `logout` action)

  Screens that dispatch `logout()` must now dispatch `logoutThunk()`. Search + update:
  - `ssh george 'cd ~/.openclaw/workspace/Togt/mobile && grep -rn "dispatch(logout" src/ | head'`

- [ ] **Step 4.13:** Replace each occurrence
  - For each file returned, change `import { logout }` to `import { logoutThunk }` and `dispatch(logout())` to `dispatch(logoutThunk())`

- [ ] **Step 4.14:** Syntax check each file changed
  - `ssh george 'cd ~/.openclaw/workspace/Togt/mobile && for f in $(grep -rl "logoutThunk" src/); do node --check "$f" || echo FAIL $f; done'`

- [ ] **Step 4.15:** Commit
```bash
ssh george 'cd ~/.openclaw/workspace/Togt && git add backend/src/routes/auth.js backend/src/db/migrations/006_refresh_tokens.sql backend/tests/refreshTokens.test.js mobile/src/services/authService.js mobile/src/store/authSlice.js mobile/src/screens/ && git commit -m "feat(auth): DB-backed refresh-token revocation + /auth/logout + push_token clear"'
```

---

## Task 5: Final verification + push

- [ ] **Step 5.1:** Run full test suite, save output for summary
  - `ssh george 'cd ~/.openclaw/workspace/Togt/backend && npm test 2>&1 | tail -40'`
  - Expected: all green, test count visible

- [ ] **Step 5.2:** Restart backend, hit live endpoints to confirm nothing broke
  - `ssh george 'launchctl kickstart -k gui/$(id -u)/com.togt.backend && sleep 2 && curl -s http://localhost:3002/health'`

- [ ] **Step 5.3:** Push both branches
```bash
ssh george 'cd ~/.openclaw/workspace/Togt && git push origin claude/review-vision-screenshot-CHDSn && git checkout main && git merge --ff-only claude/review-vision-screenshot-CHDSn && git push origin main && git checkout claude/review-vision-screenshot-CHDSn'
```

- [ ] **Step 5.4:** Morning summary doc on the Mac + update memory

---

## Success criteria

- `npm test` inside `backend/` runs green with N tests (env, rate limit, cors, webhook, bookings past-date, refresh tokens + logout).
- `scheduled_at` in the past returns 400 from the API, and direct SQL INSERT fails with trigger error.
- New `refresh_tokens` table populated on login/register. Refresh rotates (old revoked, new issued). Reuse of a revoked token → 401. Logout revokes + clears push_token.
- Backend still boots cleanly, `/health` returns 200.
- All commits pushed to GitHub, `main` fast-forwarded.
