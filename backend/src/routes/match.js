const express = require('express');
const db = require('../config/db');
const { withTx } = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { matchCreateLimiter } = require('../middleware/rateLimit');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const matcher = require('../services/matcher');
const { emitEvent } = require('../services/events');

const router = express.Router();

const REQUEST_TTL_MS = 10 * 60 * 1000;

// POST /api/match — customer creates an auto-match request
router.post('/', matchCreateLimiter, authMiddleware, idempotencyMiddleware(), requireRole('customer'), async (req, res, next) => {
  try {
    const { skill_needed, address, location_lat, location_lng,
            scheduled_at, hours_est, notes } = req.body || {};

    if (!skill_needed || !address || location_lat == null || location_lng == null || !scheduled_at) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const sched = new Date(scheduled_at);
    if (Number.isNaN(sched.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled_at' });
    }
    if (sched.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'scheduled_at must be in the future' });
    }

    const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
    const match = await withTx(async (client) => {
      const ins = await client.query(
        `INSERT INTO match_requests
           (customer_id, skill_needed, address, location_lat, location_lng,
            scheduled_at, hours_est, notes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.id, skill_needed, address, location_lat, location_lng,
         sched, hours_est || null, notes || null, expiresAt]
      );
      const row = ins.rows[0];
      await emitEvent(client, {
        eventType: 'match_request.created',
        resourceType: 'match_request',
        resourceId: row.id,
        state: row.status,
        data: row,
      });
      return row;
    });

    matcher.dispatchMatch(match.id);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
});

// GET /api/match/:id — customer or pinged labourer can read
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const m = await matcher.loadMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });

    // Authorisation: customer who owns it, OR a labourer who has been pinged
    let allowed = m.customer_id === req.user.id;
    if (!allowed) {
      const a = await db.query(
        `SELECT 1 FROM match_attempts WHERE match_request_id = $1 AND labourer_id = $2 LIMIT 1`,
        [m.id, req.user.id]
      );
      allowed = a.rows.length > 0;
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const attempts = await db.query(
      `SELECT id, labourer_id, status, pinged_at, responded_at
         FROM match_attempts WHERE match_request_id = $1
         ORDER BY pinged_at ASC`,
      [m.id]
    );
    res.json({ match: m, attempts: attempts.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/match/:id/accept — labourer accepts a ping
router.post('/:id/accept', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const matchId = req.params.id;
    const attempt = await matcher.getActiveAttemptForLabourer(matchId, req.user.id);
    if (!attempt) {
      return res.status(403).json({ error: 'No active ping for this labourer on this match' });
    }
    const result = await matcher.commitAttemptToBooking(matchId, attempt.id, req.user.id);
    if (!result.ok) {
      return res.status(409).json({ error: result.error });
    }
    matcher.recordResponse(attempt.id, 'accepted');
    res.json({ booking: result.booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/match/:id/decline — labourer declines a ping
router.post('/:id/decline', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const attempt = await matcher.getActiveAttemptForLabourer(req.params.id, req.user.id);
    if (!attempt) {
      return res.status(404).json({ error: 'No active ping' });
    }
    await matcher.recordResponse(attempt.id, 'declined');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/match/:id/cancel — customer cancels a pending match.
// 200 if cancelled. 409 if already matched (so the client knows to cancel
// the booking instead of just the match). 404 if not found / not theirs.
router.post('/:id/cancel', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    const m = await matcher.loadMatch(req.params.id);
    if (!m || m.customer_id !== req.user.id) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (m.status === 'matched') {
      return res.status(409).json({
        error: 'already_matched',
        booking_id: m.matched_booking_id,
      });
    }
    const ok = await matcher.cancelByCustomer(req.params.id, req.user.id);
    if (!ok) {
      return res.status(409).json({ error: 'Already resolved', status: m.status });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
