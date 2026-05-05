/**
 * Idempotency-Key middleware (Stripe / Linear / Anthropic style).
 *
 * Apply to mutating endpoints that an agent might retry after a timeout
 * (POST /api/match, POST /bookings, POST /payments/initiate, etc).
 *
 * Behaviour:
 *  - No header: pass through (preserves backwards compat with mobile app v1).
 *  - Header present, never seen for this user: capture the response body +
 *    status, stash it under (user_id, key), return as normal.
 *  - Header present, already seen, same request body: return the stashed
 *    response. Same status code, same body.
 *  - Header present, already seen, DIFFERENT request body: 422 problem+json
 *    `idempotency_key_reused` — protects against accidental key collisions.
 *
 * 24-hour TTL — old rows are swept on first hit (cheap, no cron needed).
 *
 * Requires authMiddleware to have populated req.user before this fires.
 */

const crypto = require('crypto');
const db = require('../config/db');
const { problemResponse } = require('../lib/problemJson');

const TTL_HOURS = 24;
const HEADER = 'idempotency-key';

function hashRequest(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body || {}))
    .digest('hex');
}

async function sweepStale() {
  // Cheap: only sweep when called. Better to do this here than as a cron
  // because we can keep it co-located with the read.
  await db.query(
    `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '${TTL_HOURS} hours'`
  );
}

function idempotencyMiddleware() {
  return async (req, res, next) => {
    const key = req.header(HEADER);
    if (!key) return next();
    if (!req.user || !req.user.id) {
      // Idempotency keys require an authenticated principal so we can scope them.
      return problemResponse(res, {
        type: 'idempotency_requires_auth',
        title: 'Idempotency-Key requires an authenticated request',
        status: 401,
        detail: 'Send an Authorization: Bearer <token> header alongside Idempotency-Key.',
        instance: req.originalUrl,
      });
    }

    // Validate key format — must be a non-trivial string (UUIDs preferred).
    if (typeof key !== 'string' || key.length < 8 || key.length > 255) {
      return problemResponse(res, {
        type: 'idempotency_key_invalid',
        title: 'Idempotency-Key is invalid',
        status: 400,
        detail: 'Idempotency-Key must be 8-255 characters (UUID v4 recommended).',
        instance: req.originalUrl,
      });
    }

    const requestHash = hashRequest(req.body);

    // Best-effort sweep (don't block on errors)
    sweepStale().catch(() => {});

    const existing = await db.query(
      `SELECT request_hash, response_status, response_body
         FROM idempotency_keys
        WHERE user_id = $1 AND key = $2`,
      [req.user.id, key]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) {
        return problemResponse(res, {
          type: 'idempotency_key_reused',
          title: 'Idempotency-Key reused with a different request body',
          status: 422,
          detail: 'The same Idempotency-Key was previously used for a different payload. Use a fresh UUID.',
          instance: req.originalUrl,
        });
      }
      return res
        .status(row.response_status)
        .set('Idempotent-Replay', 'true')
        .json(row.response_body);
    }

    // First time we've seen this key. Hook res.json so we can stash the response.
    const originalJson = res.json.bind(res);
    let captured = null;
    res.json = function (body) {
      captured = { status: this.statusCode || 200, body };
      return originalJson(body);
    };

    res.on('finish', async () => {
      if (!captured) return;
      // Store on 2xx OR 4xx (validation errors are also idempotent — same input
      // yields the same error). Skip 5xx so a transient server error doesn't
      // poison the key for 24 hours.
      if (captured.status >= 500) return;
      try {
        await db.query(
          `INSERT INTO idempotency_keys
             (key, user_id, method, path, request_hash, response_status, response_body)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, key) DO NOTHING`,
          [key, req.user.id, req.method, req.originalUrl, requestHash,
           captured.status, captured.body]
        );
      } catch (err) {
        console.warn('[idempotency] persist failed:', err.message);
      }
    });

    next();
  };
}

module.exports = { idempotencyMiddleware, hashRequest };
