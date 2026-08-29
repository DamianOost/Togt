/**
 * Smoke-test harness — boots the Express app under NODE_ENV=smoke and
 * exposes helpers for tests to drive it end-to-end.
 *
 * Worker control:
 *   The Express app exports `app` and `server`. When required as a
 *   module (which is what happens here), the `require.main === module`
 *   branch in app.js does NOT execute, so the webhook dispatcher and
 *   maintenance sweepers do not auto-start their setInterval loops.
 *   Smokes drive `dispatcher.tick()` manually for deterministic
 *   delivery semantics.
 *
 * DB cleanup:
 *   We truncate the same set as the unit-test helpers, plus audit_log
 *   and the webhook tables. Smokes use the same togt_test DB as units
 *   — they coexist because every test file truncates before each test.
 */

const http = require('http');
const crypto = require('crypto');
const request = require('supertest');

const { app } = require('../../src/app');
const db = require('../../src/config/db');
const dispatcher = require('../../src/services/webhookDispatcher');
const { encryptSecret } = require('../../src/lib/webhookSecretCrypto');
const apiKeyLib = require('../../src/lib/apiKey');
const { createRegistrationPolicy, registrationConsentFor } = require('../../src/config/registrationPolicy');

// ─── DB lifecycle ──────────────────────────────────────────────────────────

async function truncateAll() {
  // Order matters even with CASCADE — child first so we don't sweep more
  // than necessary. The unit helpers already do this set; we add the
  // audit + webhook tables.
  await db.query(
    `TRUNCATE TABLE
       audit_log,
       webhook_deliveries,
       webhook_subscriptions,
       api_keys,
       idempotency_keys,
       refresh_tokens,
       password_resets,
       ratings, payments, bookings, labourer_profiles, kyc_verifications,
       users
     RESTART IDENTITY CASCADE`
  );
}

async function closeDb() {
  try { await db.end(); } catch (_) { /* ignore double-close */ }
}

// ─── Identity helpers ──────────────────────────────────────────────────────

async function registerUser({ role = 'customer', email, password = 'Smoke!1234' } = {}) {
  const e = email || `smoke-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@togt.test`;
  const res = await request(app)
    .post('/auth/register')
    .send({
      name: 'Smoke User',
      email: e,
      phone: `+27${Math.floor(Math.random() * 1_000_000_000)}`,
      password,
      role,
      policyConsent: registrationConsentFor(createRegistrationPolicy()),
    });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    user: res.body.user,
    accessToken: res.body.accessToken || res.body.token,
    refreshToken: res.body.refreshToken,
    email: e,
    password,
  };
}

async function mintApiKey(userId, scopes = ['mcp:full']) {
  // Use the same crypto path as POST /api/api-keys so the key value is
  // a valid togt_live_<32> shape and the stored hash matches.
  const raw = `togt_live_${crypto.randomBytes(16).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const { rows } = await db.query(
    `INSERT INTO api_keys (user_id, key_hash, prefix, scopes, description)
     VALUES ($1, $2, $3, $4, 'smoke') RETURNING id`,
    [userId, hash, raw.slice(0, 12), scopes]
  );
  return { id: rows[0].id, value: raw, scopes };
}

// ─── Webhook sink ──────────────────────────────────────────────────────────

/**
 * A local HTTP server that records every POST it receives. Smokes
 * subscribe to events and point their webhook at this sink, then assert
 * the delivery landed with the right signature.
 */
function startWebhookSink() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      let body = null;
      try { body = JSON.parse(raw); } catch (_) { body = raw; }
      received.push({
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        rawBody: raw,
        body,
        receivedAt: Date.now(),
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        port,
        received,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ─── Webhook subscription helper ──────────────────────────────────────────

async function createSubscription({ userId, apiKeyId = null, url, eventTypes, secretValue }) {
  const secret = secretValue || `whsec_${crypto.randomBytes(32).toString('hex')}`;
  const { rows } = await db.query(
    `INSERT INTO webhook_subscriptions (owner_user_id, api_key_id, url, secret_encrypted, event_types)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, apiKeyId, url, encryptSecret(secret), eventTypes]
  );
  return { id: rows[0].id, secret };
}

// ─── Webhook delivery drive ───────────────────────────────────────────────

async function drainDispatcher({ maxTicks = 5 } = {}) {
  // Loop tick() until no row claims (a tick may claim, deliver, set status
  // to succeeded/pending depending on response). Capped by maxTicks.
  for (let i = 0; i < maxTicks; i += 1) {
    const before = dispatcher.stats.claimed_total;
    await dispatcher.tick();
    const claimed = dispatcher.stats.claimed_total - before;
    if (claimed === 0) return; // no pending deliveries left
  }
}

module.exports = {
  app,
  request,
  db,
  dispatcher,
  apiKeyLib,
  truncateAll,
  closeDb,
  registerUser,
  mintApiKey,
  startWebhookSink,
  createSubscription,
  drainDispatcher,
};
