/**
 * Self-service webhook subscription management for authenticated users.
 *
 * Endpoints:
 *   POST   /api/webhook-subscriptions
 *   GET    /api/webhook-subscriptions
 *   GET    /api/webhook-subscriptions/:id
 *   DELETE /api/webhook-subscriptions/:id
 *   POST   /api/webhook-subscriptions/:id/rotate-secret
 *   GET    /api/webhook-subscriptions/:id/deliveries
 *   POST   /api/webhook-subscriptions/:id/deliveries/:deliveryId/replay
 *
 * Auth: JWT (mirrors /api/api-keys). The signing secret is returned ONCE at
 * create-time and after rotate-secret; it is never readable afterwards.
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { rotateSecretLimiter } = require('../middleware/rateLimit');
const { ProblemError } = require('../lib/problemJson');
const { encryptSecret } = require('../lib/webhookSecretCrypto');
const { assertPublicHost } = require('../lib/safeFetch');
const { EVENT_TYPES } = require('../services/events');

const router = express.Router();

const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
// Per-user subscription cap. Bounds the bulk-emit fan-out — without this
// a single hostile user could create 16k+ enabled subscriptions and DOS
// the per-event INSERT (events.js chunks at 5000 placeholders/4 columns,
// so the cap also keeps emit cost predictable).
const MAX_SUBSCRIPTIONS_PER_USER = 50;

function generateSecret() {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

function validateUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new ProblemError({
      type: 'invalid-webhook-url',
      title: 'url is required',
      status: 400,
      detail: 'Provide an http(s) URL where lifecycle events should be POSTed.',
    });
  }
  if (!/^https?:\/\//.test(url)) {
    throw new ProblemError({
      type: 'invalid-webhook-url',
      title: 'Invalid url',
      status: 400,
      detail: 'url must start with http:// or https://',
    });
  }
  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw new ProblemError({
      type: 'invalid-webhook-url',
      title: 'Insecure url',
      status: 400,
      detail: 'https is required in production.',
    });
  }
}

function validateEventTypes(eventTypes) {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new ProblemError({
      type: 'invalid-event-types',
      title: 'event_types is required',
      status: 400,
      detail: 'Provide a non-empty array of event types.',
      extensions: { known_types: EVENT_TYPES },
    });
  }
  const unknown = eventTypes.filter(e => !EVENT_TYPES.includes(e));
  if (unknown.length) {
    throw new ProblemError({
      type: 'unknown-event-type',
      title: 'Unknown event_type(s)',
      status: 400,
      detail: `Unknown: ${unknown.join(', ')}.`,
      extensions: { unknown, known_types: EVENT_TYPES },
    });
  }
}

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { url, event_types, description } = req.body || {};
    validateUrl(url);
    validateEventTypes(event_types);
    // SSRF: in production refuse private/loopback resolutions early so we
    // don't accept the subscription in the first place.
    await assertPublicHost(url);

    // Enforce per-user cap so emit fan-out cost stays bounded.
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS n FROM webhook_subscriptions WHERE owner_user_id = $1`,
      [req.user.id]
    );
    if (countRes.rows[0].n >= MAX_SUBSCRIPTIONS_PER_USER) {
      throw new ProblemError({
        type: 'webhook-subscription-limit-reached',
        title: 'Webhook subscription limit reached',
        status: 409,
        detail: `Each account is capped at ${MAX_SUBSCRIPTIONS_PER_USER} webhook subscriptions. Delete an existing subscription to free a slot.`,
        extensions: { limit: MAX_SUBSCRIPTIONS_PER_USER, current: countRes.rows[0].n },
      });
    }

    const plainSecret = generateSecret();
    const { rows } = await db.query(
      `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, url, event_types, description, enabled, created_at`,
      [req.user.id, url, encryptSecret(plainSecret), event_types, description || null]
    );
    res.status(201).json({
      ...rows[0],
      secret: plainSecret,
      warning: 'Store this secret now — it will not be shown again. Verify incoming X-Togt-Signature with it.',
    });
  } catch (err) { next(err); }
});

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, url, event_types, description, enabled, created_at, updated_at,
              last_success_at, last_failure_at, consecutive_failures, secret_previous_expires_at
         FROM webhook_subscriptions
        WHERE owner_user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ subscriptions: rows });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, url, event_types, description, enabled, created_at, updated_at,
              last_success_at, last_failure_at, consecutive_failures, secret_previous_expires_at
         FROM webhook_subscriptions
        WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      throw new ProblemError({ type: 'webhook-not-found', title: 'Webhook subscription not found', status: 404 });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) {
      throw new ProblemError({ type: 'webhook-not-found', title: 'Webhook subscription not found', status: 404 });
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/:id/rotate-secret', rotateSecretLimiter, authMiddleware, async (req, res, next) => {
  try {
    const owns = await db.query(
      `SELECT id, secret_previous_expires_at FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!owns.rows.length) {
      throw new ProblemError({ type: 'webhook-not-found', title: 'Webhook subscription not found', status: 404 });
    }
    // Refuse to rotate if a prior rotation's 24h grace window is still
    // active — clobbering the in-flight previous secret would dark out
    // any consumer that hasn't finished migrating yet.
    const priorExpiry = owns.rows[0].secret_previous_expires_at;
    if (priorExpiry && new Date(priorExpiry) > new Date()) {
      throw new ProblemError({
        type: 'webhook-rotation-grace-active',
        title: 'Previous rotation grace window is still active',
        status: 409,
        detail: 'A prior rotate-secret call is still in its 24h grace period. Wait for it to expire before rotating again, otherwise the in-flight previous secret would be lost.',
        extensions: { previous_secret_expires_at: priorExpiry },
      });
    }
    const plainSecret = generateSecret();
    const expiresAt = new Date(Date.now() + ROTATION_GRACE_MS);
    const { rows } = await db.query(
      `UPDATE webhook_subscriptions
          SET secret_previous_encrypted = secret_encrypted,
              secret_previous_expires_at = $2,
              secret_encrypted = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, url, event_types, enabled, secret_previous_expires_at`,
      [req.params.id, expiresAt, encryptSecret(plainSecret)]
    );
    res.json({
      ...rows[0],
      secret: plainSecret,
      previous_secret_expires_at: rows[0].secret_previous_expires_at,
      warning: 'Store this secret now — it will not be shown again. The old secret remains valid for 24h; during the grace window the dispatcher signs deliveries with both secrets, so roll your endpoint when convenient.',
    });
  } catch (err) { next(err); }
});

router.get('/:id/deliveries', authMiddleware, async (req, res, next) => {
  try {
    const owns = await db.query(
      `SELECT id FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!owns.rows.length) {
      throw new ProblemError({ type: 'webhook-not-found', title: 'Webhook subscription not found', status: 404 });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await db.query(
      `SELECT id, event_id, event_type, attempt_count, status, next_retry_at,
              last_http_status, last_error, created_at, succeeded_at, dead_at
         FROM webhook_deliveries
        WHERE subscription_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.params.id, limit]
    );
    res.json({ deliveries: rows });
  } catch (err) { next(err); }
});

router.post('/:id/deliveries/:deliveryId/replay', authMiddleware, async (req, res, next) => {
  try {
    const owns = await db.query(
      `SELECT id FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!owns.rows.length) {
      throw new ProblemError({ type: 'webhook-not-found', title: 'Webhook subscription not found', status: 404 });
    }
    const { rows } = await db.query(
      `UPDATE webhook_deliveries
          SET status = 'pending',
              next_retry_at = NOW(),
              attempt_count = 0,
              dead_at = NULL,
              last_error = NULL,
              last_http_status = NULL
        WHERE id = $1 AND subscription_id = $2 AND status IN ('dead', 'succeeded')
        RETURNING id, status, next_retry_at`,
      [req.params.deliveryId, req.params.id]
    );
    if (!rows.length) {
      throw new ProblemError({
        type: 'webhook-delivery-not-replayable',
        title: 'Delivery not found or not replayable',
        status: 404,
        detail: 'Replay only works on dead or succeeded deliveries.',
      });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
