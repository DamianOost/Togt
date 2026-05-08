/**
 * Auto-match dispatcher.
 *
 * Single-process in-memory implementation. A customer's match_request is
 * dispatched: candidate labourers are pinged in priority order
 * (rating desc, distance asc), each with a PING_TIMEOUT_MS window. The
 * first to accept wins; the rest get attempt status timeout/cancelled.
 *
 * Trade-offs (POC):
 *   - In-memory promise table (`pending`) means a server restart drops any
 *     in-flight match. Acceptable while we run a single backend process.
 *   - For multi-instance / production rollout, swap `pending` for
 *     Redis pub/sub keyed on attempt id, and run the dispatcher loop in a
 *     dedicated worker.
 *
 * Race conditions guarded:
 *   - Accept uses SELECT ... FOR UPDATE inside a transaction so two
 *     simultaneous accepts on the same match cannot both succeed.
 *   - Decline / cancel set the corresponding pending promise's resolution
 *     so the dispatcher loop can move on without polling.
 */

const db = require('../config/db');
const { withTx } = require('../config/db');
const { emitEvent } = require('./events');
const { notifyUser } = require('./notifications');

let PING_TIMEOUT_MS = 30 * 1000;
const RADIUS_KM = 50;
const MAX_CANDIDATES = 5;
const REQUEST_TTL_MS = 10 * 60 * 1000; // a customer waits at most 10 min for a match

// attemptId -> { resolve, timer }
const pending = new Map();

function setPingTimeoutForTesting(ms) { PING_TIMEOUT_MS = ms; }
function resetPingTimeoutForTesting() { PING_TIMEOUT_MS = 30 * 1000; }

// ─── Candidate selection ─────────────────────────────────────────────────────

async function selectCandidates({ skill, lat, lng, radiusKm = RADIUS_KM, limit = MAX_CANDIDATES }) {
  // Haversine in SQL + decision-context fields the agentic-introspection
  // sub-agents flagged as load-bearing for confident booking:
  //   - rating_avg + rating_count (reviews) — single rating without count is misleading
  //   - acceptance_rate over last 30 days from match_attempts
  //   - completion_rate over last 30 days from bookings
  //   - last_active_at — most recent booking touched
  // 6371 = Earth radius km.
  const sql = `
    WITH attempt_stats AS (
      SELECT labourer_id,
             COUNT(*) FILTER (WHERE pinged_at > NOW() - INTERVAL '30 days') AS pinged_30d,
             COUNT(*) FILTER (WHERE status = 'accepted' AND pinged_at > NOW() - INTERVAL '30 days') AS accepted_30d
        FROM match_attempts
       GROUP BY labourer_id
    ),
    booking_stats AS (
      SELECT labourer_id,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS bookings_30d,
             COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '30 days') AS completed_30d,
             MAX(created_at) AS last_booking_at
        FROM bookings
       GROUP BY labourer_id
    )
    SELECT lp.user_id, u.name, lp.hourly_rate, lp.rating_avg, lp.rating_count,
           lp.current_lat, lp.current_lng,
           (6371 * acos(
             LEAST(1.0,
               cos(radians($1)) * cos(radians(lp.current_lat)) *
               cos(radians(lp.current_lng) - radians($2)) +
               sin(radians($1)) * sin(radians(lp.current_lat))
             )
           )) AS distance_km,
           COALESCE(a.pinged_30d, 0)::int AS pinged_30d,
           COALESCE(a.accepted_30d, 0)::int AS accepted_30d,
           CASE WHEN COALESCE(a.pinged_30d, 0) > 0
                THEN ROUND((a.accepted_30d::numeric / a.pinged_30d) * 100, 1)
                ELSE NULL END AS acceptance_rate_pct,
           COALESCE(b.bookings_30d, 0)::int AS bookings_30d,
           COALESCE(b.completed_30d, 0)::int AS completed_30d,
           CASE WHEN COALESCE(b.bookings_30d, 0) > 0
                THEN ROUND((b.completed_30d::numeric / b.bookings_30d) * 100, 1)
                ELSE NULL END AS completion_rate_pct,
           b.last_booking_at,
           CASE WHEN b.last_booking_at IS NOT NULL
                THEN EXTRACT(DAY FROM (NOW() - b.last_booking_at))::int
                ELSE NULL END AS days_since_last_booking
      FROM labourer_profiles lp
      JOIN users u ON u.id = lp.user_id
      LEFT JOIN attempt_stats a ON a.labourer_id = lp.user_id
      LEFT JOIN booking_stats b ON b.labourer_id = lp.user_id
     WHERE lp.is_available = true
       AND $3 = ANY(lp.skills)
       AND u.kyc_status = 'verified'
       AND lp.current_lat IS NOT NULL
       AND lp.current_lng IS NOT NULL
       AND (6371 * acos(
             LEAST(1.0,
               cos(radians($1)) * cos(radians(lp.current_lat)) *
               cos(radians(lp.current_lng) - radians($2)) +
               sin(radians($1)) * sin(radians(lp.current_lat))
             )
           )) <= $4
     ORDER BY lp.rating_avg DESC, distance_km ASC
     LIMIT $5
  `;
  const r = await db.query(sql, [lat, lng, skill, radiusKm, limit]);
  return r.rows;
}

// ─── Lifecycle helpers ──────────────────────────────────────────────────────

async function loadMatch(matchId) {
  const r = await db.query('SELECT * FROM match_requests WHERE id = $1', [matchId]);
  return r.rows[0] || null;
}

async function expireMatch(matchId, reason) {
  const m = await withTx(async (client) => {
    const upd = await client.query(
      `UPDATE match_requests
          SET status = 'expired', expire_reason = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [matchId, reason]
    );
    const row = upd.rows[0];
    if (row) {
      await emitEvent(client, {
        eventType: 'match_request.expired',
        resourceType: 'match_request',
        resourceId: row.id,
        actorUserIds: [row.customer_id],
        previousState: 'pending',
        state: 'expired',
        data: { ...row, expire_reason: reason },
      });
    }
    return row;
  });
  // Notify the customer (best-effort) — same row we just transitioned
  if (m) {
    notifyUser(m.customer_id, 'No labourer available',
      'Sorry, no one is available right now. Please try again or schedule for later.',
      { matchId, reason }).catch(() => {});
  }
}

async function commitAttemptToBooking(matchId, attemptId, labourerId) {
  // Use a transaction to atomically: lock match row, mark attempt accepted,
  // create booking, link booking on match.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT id, status, customer_id, skill_needed, address,
              location_lat, location_lng, scheduled_at, hours_est, notes
         FROM match_requests
        WHERE id = $1
        FOR UPDATE`,
      [matchId]
    );
    if (lock.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'match_not_found' };
    }
    const m = lock.rows[0];
    if (m.status !== 'pending') {
      await client.query('ROLLBACK');
      return { ok: false, error: 'match_not_pending' };
    }

    // Compute total amount from labourer's hourly rate
    const rateRow = await client.query(
      `SELECT hourly_rate FROM labourer_profiles WHERE user_id = $1`,
      [labourerId]
    );
    const hourly = rateRow.rows[0]?.hourly_rate || 0;
    const total = m.hours_est ? (Number(hourly) * Number(m.hours_est)).toFixed(2) : null;

    const bookingRes = await client.query(
      `INSERT INTO bookings
         (customer_id, labourer_id, status, skill_needed, address,
          location_lat, location_lng, scheduled_at, hours_est, total_amount, notes)
       VALUES ($1, $2, 'accepted', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [m.customer_id, labourerId, m.skill_needed, m.address,
       m.location_lat, m.location_lng, m.scheduled_at,
       m.hours_est || null, total, m.notes || null]
    );
    const booking = bookingRes.rows[0];

    // Guarded update: only succeed if attempt was still pinged. Closes the
    // window where the attempt timed out / was cancelled between
    // getActiveAttemptForLabourer and this transaction.
    const claim = await client.query(
      `UPDATE match_attempts
          SET status = 'accepted', responded_at = NOW()
        WHERE id = $1 AND status = 'pinged'
        RETURNING id`,
      [attemptId]
    );
    if (claim.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'attempt_not_active' };
    }

    await client.query(
      `UPDATE match_attempts
          SET status = 'cancelled', responded_at = NOW()
        WHERE match_request_id = $1
          AND id != $2
          AND status = 'pinged'`,
      [matchId, attemptId]
    );

    const matchUpd = await client.query(
      `UPDATE match_requests
          SET status = 'matched',
              matched_booking_id = $2,
              matched_labourer_id = $3,
              matched_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [matchId, booking.id, labourerId]
    );

    // Emit lifecycle events INSIDE the tx so they commit/rollback with the
    // resource mutation (transactional outbox). Two events fire here because
    // two resources changed state: the match_request matched, and a new
    // booking exists.
    await emitEvent(client, {
      eventType: 'match_request.matched',
      resourceType: 'match_request',
      resourceId: matchId,
      actorUserIds: [m.customer_id, labourerId],
      previousState: 'pending',
      state: 'matched',
      data: matchUpd.rows[0],
    });
    await emitEvent(client, {
      eventType: 'booking.created',
      resourceType: 'booking',
      resourceId: booking.id,
      actorUserIds: [m.customer_id, labourerId],
      state: booking.status,
      data: booking,
    });

    await client.query('COMMIT');
    // Push notification #1 of the 3-push chain (matched / en-route / arrived).
    // Customer learns who their labourer is the moment a match commits.
    const labourerName = (await db.query('SELECT name FROM users WHERE id = $1', [labourerId])).rows[0]?.name || 'Your labourer';
    notifyUser(
      m.customer_id,
      'Match found!',
      `${labourerName} accepted your job — they'll be in touch soon.`,
      { type: 'match_accepted', booking_id: booking.id, labourer_id: labourerId }
    ).catch(() => {});
    return { ok: true, booking };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Dispatcher loop ─────────────────────────────────────────────────────────

function notifyResponse(attemptId, status) {
  const p = pending.get(attemptId);
  if (p) p.resolve(status);
}

async function pingAndWait(matchRequest, labourer) {
  const ins = await db.query(
    `INSERT INTO match_attempts (match_request_id, labourer_id)
     VALUES ($1, $2)
     RETURNING id`,
    [matchRequest.id, labourer.user_id]
  );
  const attemptId = ins.rows[0].id;

  // Push notification (best-effort) + Socket.io event
  notifyUser(
    labourer.user_id,
    'New job request',
    `${matchRequest.skill_needed} • R${matchRequest.hours_est ? Number(labourer.hourly_rate) * Number(matchRequest.hours_est) : '?'} • ${matchRequest.address}`,
    {
      type: 'match_incoming',
      matchId: matchRequest.id,
      attemptId,
      skill: matchRequest.skill_needed,
      address: matchRequest.address,
      scheduled_at: matchRequest.scheduled_at,
      hours_est: matchRequest.hours_est,
    }
  ).catch(() => {});
  if (global.__togt_io) {
    try {
      global.__togt_io.to(`user:${labourer.user_id}`).emit('match:incoming', {
        matchId: matchRequest.id,
        attemptId,
        skill_needed: matchRequest.skill_needed,
        address: matchRequest.address,
        scheduled_at: matchRequest.scheduled_at,
        hours_est: matchRequest.hours_est,
        hourly_rate: labourer.hourly_rate,
        timeout_ms: PING_TIMEOUT_MS,
      });
    } catch {}
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pending.delete(attemptId);
      try {
        await db.query(
          `UPDATE match_attempts SET status = 'timeout', responded_at = NOW()
            WHERE id = $1 AND status = 'pinged'`,
          [attemptId]
        );
      } catch {}
      resolve('timeout');
    }, PING_TIMEOUT_MS);
    pending.set(attemptId, {
      resolve: (status) => {
        clearTimeout(timer);
        pending.delete(attemptId);
        resolve(status);
      },
      timer,
      matchId: matchRequest.id,
    });
  });
}

async function dispatchMatch(matchId) {
  // Fire-and-forget; caller doesn't await
  setImmediate(async () => {
    try {
      const match = await loadMatch(matchId);
      if (!match || match.status !== 'pending') return;

      const candidates = await selectCandidates({
        skill: match.skill_needed,
        lat: match.location_lat,
        lng: match.location_lng,
      });

      if (candidates.length === 0) {
        await expireMatch(matchId, 'no_candidates');
        return;
      }

      for (const cand of candidates) {
        // Check if match was cancelled mid-loop
        const fresh = await loadMatch(matchId);
        if (!fresh || fresh.status !== 'pending') return;

        const result = await pingAndWait(fresh, cand);
        if (result === 'accepted') return; // commit handled by accept endpoint
        // 'declined' or 'timeout' or 'cancelled' — try next candidate
      }

      // All candidates exhausted — figure out reason from attempts
      const attempts = await db.query(
        `SELECT status FROM match_attempts WHERE match_request_id = $1`,
        [matchId]
      );
      const declined = attempts.rows.filter((a) => a.status === 'declined').length;
      const timedOut = attempts.rows.filter((a) => a.status === 'timeout').length;
      const reason =
        declined === attempts.rows.length ? 'all_declined' :
        timedOut === attempts.rows.length ? 'all_timeout' :
        'all_unavailable';
      await expireMatch(matchId, reason);
    } catch (err) {
      console.error('[matcher] dispatchMatch failed:', err.message);
      try { await expireMatch(matchId, 'error'); } catch {}
    }
  });
}

// ─── External API used by routes ────────────────────────────────────────────

async function recordResponse(attemptId, status) {
  // status: 'accepted' | 'declined' | 'cancelled'
  await db.query(
    `UPDATE match_attempts SET status = $2, responded_at = NOW()
      WHERE id = $1 AND status = 'pinged'`,
    [attemptId, status]
  );
  notifyResponse(attemptId, status);
}

async function getActiveAttemptForLabourer(matchId, labourerId) {
  const r = await db.query(
    `SELECT id, status FROM match_attempts
      WHERE match_request_id = $1 AND labourer_id = $2 AND status = 'pinged'
      ORDER BY pinged_at DESC LIMIT 1`,
    [matchId, labourerId]
  );
  return r.rows[0] || null;
}

async function cancelByCustomer(matchId, customerId) {
  // Wrap the cancel in a transaction so we cannot leave stranded
  // 'cancelled' attempts attached to a still-'pending' match if the
  // process dies mid-way. Lock the match row first so a concurrent
  // accept either commits before us (we then return false and the
  // route layer surfaces 409 already_matched) or blocks until we commit.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT id, status FROM match_requests
         WHERE id = $1 AND customer_id = $2
         FOR UPDATE`,
      [matchId, customerId]
    );
    if (lock.rows.length === 0 || lock.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return false;
    }
    const attempts = await client.query(
      `SELECT id FROM match_attempts
         WHERE match_request_id = $1 AND status = 'pinged'`,
      [matchId]
    );
    await client.query(
      `UPDATE match_attempts
          SET status = 'cancelled', responded_at = NOW()
        WHERE match_request_id = $1 AND status = 'pinged'`,
      [matchId]
    );
    const cancelled = await client.query(
      `UPDATE match_requests SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [matchId]
    );
    await emitEvent(client, {
      eventType: 'match_request.cancelled',
      resourceType: 'match_request',
      resourceId: matchId,
      actorUserIds: [customerId],
      previousState: 'pending',
      state: 'cancelled',
      data: cancelled.rows[0],
    });
    await client.query('COMMIT');
    // Drain in-memory waiters AFTER commit so the dispatcher sees a
    // consistent DB state when its loop's next loadMatch fires.
    for (const a of attempts.rows) notifyResponse(a.id, 'cancelled');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


// S2: boot-time recovery. Stale 'pending' rows from before a process restart
// have no in-memory dispatcher tied to them. Expire them so customers don't
// see ghost rows. The customer is notified via expireMatch's notifyUser.
async function sweepStalePending() {
  return withTx(async (client) => {
    const r = await client.query(
      `UPDATE match_requests
          SET status = 'expired', expire_reason = 'server_restart'
        WHERE status = 'pending'
        RETURNING *`
    );
    for (const row of r.rows) {
      await emitEvent(client, {
        eventType: 'match_request.expired',
        resourceType: 'match_request',
        resourceId: row.id,
        actorUserIds: [row.customer_id],
        previousState: 'pending',
        state: 'expired',
        data: row,
      });
    }
    return r.rowCount;
  });
}

module.exports = {
  selectCandidates,
  dispatchMatch,
  commitAttemptToBooking,
  recordResponse,
  getActiveAttemptForLabourer,
  cancelByCustomer,
  loadMatch,
  expireMatch,
  sweepStalePending,
  // For tests:
  __setPingTimeoutForTesting: setPingTimeoutForTesting,
  __resetPingTimeoutForTesting: resetPingTimeoutForTesting,
  __pendingSize: () => pending.size,
};
