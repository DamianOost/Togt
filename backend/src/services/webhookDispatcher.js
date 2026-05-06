/**
 * webhookDispatcher — background loop that delivers queued webhook_deliveries
 * over HTTP to subscriber URLs.
 *
 * Retry schedule after first failure: 30s, 2m, 10m, 1h. After attempt 5+,
 * the index clamps to the last entry (1h), so retries continue every ~1h
 * until the delivery is older than DEAD_AT_SECONDS (24h), at which point
 * the row is marked 'dead'. Net: ~25 attempts spread across 24h. Mirrors
 * Stripe semantics for receiver outages.
 *
 * Concurrency: multiple processes can run the dispatcher safely thanks to
 * `FOR UPDATE SKIP LOCKED` on the claim query — each tick claims a batch
 * of due deliveries that no other tick has locked.
 *
 * Grace-window dual-signing: if a subscription has a non-null
 * secret_previous_encrypted with secret_previous_expires_at in the future,
 * the dispatcher signs with BOTH secrets and emits a Stripe-shape multi-v1
 * header (t=<ts>,v1=<new>,v1=<old>). Receivers may verify with either
 * during the 24h rotation grace window.
 */

const axios = require('axios');
const db = require('../config/db');
const { signPayload } = require('../lib/webhookSignature');
const { decryptSecret } = require('../lib/webhookSecretCrypto');

const RETRY_SCHEDULE_SECONDS = [30, 120, 600, 3600];
const DEAD_AT_SECONDS = 86400;
const HTTP_TIMEOUT_MS = 10000;
const TICK_BATCH = 50;

let timer = null;
let stopped = false;

async function tick() {
  if (stopped) return;
  const { rows } = await db.query(
    `WITH claimed AS (
       SELECT id FROM webhook_deliveries
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY next_retry_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE webhook_deliveries SET attempt_count = attempt_count + 1
       WHERE id IN (SELECT id FROM claimed)
       RETURNING *`,
    [TICK_BATCH]
  );
  if (rows.length === 0) return;
  await Promise.allSettled(rows.map(deliverOne));
}

async function deliverOne(delivery) {
  const subRes = await db.query(`SELECT * FROM webhook_subscriptions WHERE id = $1`, [delivery.subscription_id]);
  const sub = subRes.rows[0];
  if (!sub || !sub.enabled) {
    await db.query(
      `UPDATE webhook_deliveries SET status = 'dead', dead_at = NOW(), last_error = $2 WHERE id = $1`,
      [delivery.id, 'subscription disabled or deleted']
    );
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const secret = decryptSecret(sub.secret_encrypted);
  let previousSecret = null;
  if (sub.secret_previous_encrypted && sub.secret_previous_expires_at && new Date(sub.secret_previous_expires_at) > new Date()) {
    previousSecret = decryptSecret(sub.secret_previous_encrypted);
  }
  const { header } = signPayload(secret, body, undefined, previousSecret);

  try {
    const resp = await axios.post(sub.url, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Togt-Webhook/1.0',
        'X-Togt-Signature': header,
        'X-Togt-Event-Id': delivery.event_id,
        'X-Togt-Event-Type': delivery.event_type,
        'X-Togt-Delivery-Attempt': String(delivery.attempt_count),
      },
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: s => s >= 200 && s < 300,
      transformRequest: [d => d],
    });
    await db.query(
      `UPDATE webhook_deliveries
          SET status = 'succeeded',
              succeeded_at = NOW(),
              last_http_status = $2,
              last_response_body = $3,
              last_error = NULL
        WHERE id = $1`,
      [delivery.id, resp.status, String(resp.data ?? '').slice(0, 4096)]
    );
    await db.query(
      `UPDATE webhook_subscriptions SET last_success_at = NOW(), consecutive_failures = 0 WHERE id = $1`,
      [sub.id]
    );
  } catch (err) {
    const httpStatus = err.response?.status || null;
    const errMsg = String(err.message || err).slice(0, 1024);
    const ageSeconds = Math.floor((Date.now() - new Date(delivery.created_at).getTime()) / 1000);
    if (ageSeconds >= DEAD_AT_SECONDS) {
      await db.query(
        `UPDATE webhook_deliveries
            SET status = 'dead',
                dead_at = NOW(),
                last_http_status = $2,
                last_error = $3
          WHERE id = $1`,
        [delivery.id, httpStatus, errMsg]
      );
    } else {
      const idx = Math.min(Math.max(delivery.attempt_count - 1, 0), RETRY_SCHEDULE_SECONDS.length - 1);
      const nextDelay = RETRY_SCHEDULE_SECONDS[idx];
      await db.query(
        `UPDATE webhook_deliveries
            SET next_retry_at = NOW() + (INTERVAL '1 second' * $2),
                last_http_status = $3,
                last_error = $4
          WHERE id = $1`,
        [delivery.id, nextDelay, httpStatus, errMsg]
      );
    }
    await db.query(
      `UPDATE webhook_subscriptions
          SET last_failure_at = NOW(),
              consecutive_failures = consecutive_failures + 1
        WHERE id = $1`,
      [sub.id]
    );
  }
}

function start({ intervalMs = 5000 } = {}) {
  stopped = false;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    tick().catch(e => console.error('[webhookDispatcher] tick error:', e));
  }, intervalMs);
  if (timer.unref) timer.unref();
}

function stop() {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop,
  tick,
  deliverOne,
  RETRY_SCHEDULE_SECONDS,
  DEAD_AT_SECONDS,
};
