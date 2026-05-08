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
const { assertPublicHost } = require('../lib/safeFetch');

// Index calc below is `min(max(attempt_count - 1, 0), len - 1)`. It RELIES
// on attempt_count being the JUST-INCREMENTED value (the claim query does
// `attempt_count = attempt_count + 1 RETURNING *`). On the first failure
// attempt_count is 1 -> idx 0 -> 30s. If you ever switch to reading the
// pre-increment value, this calc has to change.
const RETRY_SCHEDULE_SECONDS = [30, 120, 600, 3600];
const DEAD_AT_SECONDS = 86400;
const HTTP_TIMEOUT_MS = 10000;
const TICK_BATCH = 50;
// Visibility timeout: when a tick claims a row, it pushes next_retry_at
// out by this many seconds so a process crash mid-deliverOne does NOT
// cause the very next tick to immediately re-claim the same row. The
// success/failure UPDATEs reset next_retry_at to its real value before
// the visibility timeout matters; the timeout is the safety net for
// crashes only. Receivers will see at most one duplicate delivery per
// crash spaced ~CLAIM_VISIBILITY_TIMEOUT_SECONDS apart instead of two
// rapid-fire deliveries 5s apart.
const CLAIM_VISIBILITY_TIMEOUT_SECONDS = 60;
// Cap how much error message / response we persist. Receivers can return
// arbitrarily large bodies (we DON'T persist response body — see the
// success path below — but errMsg can also be receiver-controlled via
// e.g. socket-hangup messages with embedded bytes).
const ERROR_MSG_MAX_CHARS = 1024;
// Outbound HTTP body cap. axios buffers the full response in memory before
// we discard it; an actively malicious receiver streaming a giant body
// would otherwise pressure the dispatcher's heap.
const HTTP_RESPONSE_MAX_BYTES = 65536;

let timer = null;
let stopped = false;

async function tick() {
  if (stopped) return;
  // Claim batch: increment attempt_count AND push next_retry_at out by the
  // visibility timeout. The success/failure UPDATE will reset next_retry_at
  // to its real value before this matters. If the process crashes between
  // claim and the result UPDATE, the row stays 'pending' but the visibility
  // timeout means the next tick won't re-claim immediately — at-least-once
  // semantics survive but rapid double-firing on crash does not.
  const { rows } = await db.query(
    `WITH claimed AS (
       SELECT id FROM webhook_deliveries
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY next_retry_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE webhook_deliveries
        SET attempt_count = attempt_count + 1,
            next_retry_at = NOW() + (INTERVAL '1 second' * $2)
       WHERE id IN (SELECT id FROM claimed)
       RETURNING *`,
    [TICK_BATCH, CLAIM_VISIBILITY_TIMEOUT_SECONDS]
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

  // SSRF defence: in production (or when WEBHOOK_SSRF_FORCE=1) refuse to
  // post to private/loopback/link-local addresses. Dev/test default-allows
  // 127.0.0.1 so the local receiver tests can run.
  try {
    await assertPublicHost(sub.url);
  } catch (ssrfErr) {
    await db.query(
      `UPDATE webhook_deliveries SET status = 'dead', dead_at = NOW(), last_error = $2 WHERE id = $1`,
      [delivery.id, String(ssrfErr.message || ssrfErr).slice(0, ERROR_MSG_MAX_CHARS)]
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
      // Receiver-controlled redirects are an SSRF amplifier — a public URL
      // could 302 to an internal target. Always disable.
      maxRedirects: 0,
      // Cap the body axios will buffer from the receiver before discarding
      // it. Without this a malicious receiver streaming gigabytes pressures
      // the dispatcher heap.
      maxContentLength: HTTP_RESPONSE_MAX_BYTES,
      maxBodyLength: HTTP_RESPONSE_MAX_BYTES,
    });
    // Do NOT persist response body: a hostile receiver could return PII or
    // secret-shaped strings and we'd leak them via the deliveries endpoint
    // to the caller (or to ops querying the table). Status code is enough.
    await db.query(
      `UPDATE webhook_deliveries
          SET status = 'succeeded',
              succeeded_at = NOW(),
              last_http_status = $2,
              last_response_body = NULL,
              last_error = NULL
        WHERE id = $1`,
      [delivery.id, resp.status]
    );
    await db.query(
      `UPDATE webhook_subscriptions SET last_success_at = NOW(), consecutive_failures = 0 WHERE id = $1`,
      [sub.id]
    );
  } catch (err) {
    const httpStatus = err.response?.status || null;
    const errMsg = String(err.message || err).slice(0, ERROR_MSG_MAX_CHARS);
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
