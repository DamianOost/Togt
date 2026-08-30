/**
 * Auto-match dispatcher.
 *
 * Database-durable dispatcher. Candidate advancement and offer delivery are
 * independent leased jobs. A process may die at any point: an expired lease
 * makes the work claimable again, while the unique attempt constraint and
 * row locks keep the logical offer and eventual booking single-winner.
 *
 * Delivery is deliberately at-least-once. If a process dies after emitting a
 * notification but before recording `dispatched_at`, another process retries
 * it after the lease. Consumers therefore receive a stable attempt id and
 * must tolerate a duplicate notification for the same offer.
 *
 * Race conditions guarded:
 *   - Accept uses SELECT ... FOR UPDATE inside a transaction so two
 *     simultaneous accepts on the same match cannot both succeed.
 *   - Decline / cancel move `dispatch_next_at` to database-now so any live
 *     dispatcher can advance immediately; the interval loop is the fallback.
 */

const db = require('../config/db');
const { withTx } = require('../config/db');
const { emitEvent } = require('./events');
const { notifyUser } = require('./notifications');
const {
  serializeMatchForLabourerCandidate,
  matchScopeSummary,
} = require('../lib/privacy');
const {
  loadWorkerProfile,
  listWorkerOfferings,
  listAcknowledgements,
} = require('./groundedWorker/store');
const { serializeActivation } = require('./groundedWorker/projections');
const {
  requireApprovedFulfilmentPolicy,
  bootstrapCanonicalFulfilment,
} = require('./groundedFulfilment/bootstrap');

let PING_TIMEOUT_MS = 30 * 1000;
let DISPATCH_LEASE_MS = 5 * 1000;
const RADIUS_KM = 50;
const MAX_CANDIDATES = 5;
const DISPATCH_BATCH = 25;
const DISPATCH_RETRY_MS = 1000;
const ERROR_MAX_CHARS = 1024;

let timer = null;
let stopped = false;
let scheduledTickInFlight = false;
let offerDeliveryOverride = null;
const stats = {
  ticks_total: 0,
  matches_claimed_total: 0,
  attempts_claimed_total: 0,
  failed_ticks_total: 0,
  last_tick_at: null,
  last_success_at: null,
  started_at: null,
  interval_ms: null,
};

function setPingTimeoutForTesting(ms) { PING_TIMEOUT_MS = ms; }
function resetPingTimeoutForTesting() { PING_TIMEOUT_MS = 30 * 1000; }
function getPingTimeoutMs() { return PING_TIMEOUT_MS; }
function setDispatchLeaseForTesting(ms) { DISPATCH_LEASE_MS = ms; }
function resetDispatchLeaseForTesting() { DISPATCH_LEASE_MS = 5 * 1000; }

// ─── Candidate selection ─────────────────────────────────────────────────────

async function selectCandidates({
  skill,
  lat,
  lng,
  radiusKm = RADIUS_KM,
  limit = MAX_CANDIDATES,
  matchRequestId = null,
}, queryable = db) {
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
           lp.current_lat, lp.current_lng, lp.location_updated_at,
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
       AND lp.location_updated_at IS NOT NULL
       AND lp.location_updated_at > NOW() - INTERVAL '15 minutes'
       AND ($6::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM match_attempts previous_attempt
          WHERE previous_attempt.match_request_id = $6
            AND previous_attempt.labourer_id = lp.user_id
       ))
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
  const r = await queryable.query(sql, [lat, lng, skill, radiusKm, limit, matchRequestId]);
  return r.rows;
}

// ─── Lifecycle helpers ──────────────────────────────────────────────────────

async function loadMatch(matchId) {
  const r = await db.query('SELECT * FROM match_requests WHERE id = $1', [matchId]);
  return r.rows[0] || null;
}

async function expireMatch(matchId, reason) {
  const matchRequest = await withTx(async (client) => {
    const upd = await client.query(
      `UPDATE match_requests
          SET status = 'expired', expire_reason = $2,
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_last_error = NULL
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [matchId, reason]
    );
    const row = upd.rows[0];
    if (row) {
      await client.query(
        `UPDATE match_attempts
            SET status = 'timeout', responded_at = clock_timestamp(),
                dispatch_lease_id = NULL,
                dispatch_lease_expires_at = NULL
          WHERE match_request_id = $1 AND status = 'pinged'`,
        [matchId]
      );
      await emitEvent(client, {
        eventType: 'match_request.expired',
        resourceType: 'match_request',
        resourceId: row.id,
        actorUserIds: [row.customer_id],
        previousState: 'pending',
        state: 'expired',
        data: { ...row, expire_reason: reason },
      });
      return row;
    }
    return null;
  });
  // Notify the customer (best-effort) — same row we just transitioned
  if (matchRequest) {
    notifyUser(matchRequest.customer_id, 'No labourer available',
      'Sorry, no one is available right now. Please try again or schedule for later.',
      { matchId, reason }).catch(() => {});
  }
  return matchRequest;
}

async function workerAcceptanceGate(client, labourerId, serverNow) {
  const worker = await loadWorkerProfile(client, labourerId, { lock: true });
  if (!worker) {
    return {
      allowed: false,
      error: 'worker_profile_not_found',
      reasonCode: 'worker_profile_not_found',
      detail: 'The Worker profile required to accept this offer no longer exists.',
    };
  }
  // A transaction client is single-connection. Keep these reads sequential so
  // the matcher remains compatible with pg's stricter concurrent-query rules.
  const offerings = await listWorkerOfferings(client, labourerId, { lock: true });
  const acknowledgements = await listAcknowledgements(client, labourerId);
  const activation = serializeActivation(worker, offerings, acknowledgements, serverNow);
  if (worker.is_available !== true) {
    return {
      allowed: false,
      error: 'worker_offline',
      reasonCode: 'worker_offline',
      detail: 'The server-confirmed Worker availability state is Offline.',
    };
  }
  if (activation.onlinePermission?.status !== 'supported'
      || activation.onlinePermission.value?.allowed !== true) {
    return {
      allowed: false,
      error: 'worker_activation_incomplete',
      reasonCode: activation.onlinePermission?.value?.reasonCode
        || 'worker_online_permission_unavailable',
      detail: activation.onlinePermission?.value?.explanation
        || 'The server could not confirm every Worker prerequisite required for this offer.',
    };
  }
  return { allowed: true, worker };
}

async function expireLockedRequest(client, match) {
  const expired = await client.query(
    `UPDATE match_requests
        SET status = 'expired', expire_reason = 'request_deadline_elapsed',
            dispatch_lease_id = NULL,
            dispatch_lease_expires_at = NULL,
            dispatch_last_error = NULL
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [match.id]
  );
  await client.query(
    `UPDATE match_attempts
        SET status = 'timeout', responded_at = clock_timestamp(),
            dispatch_lease_id = NULL,
            dispatch_lease_expires_at = NULL
      WHERE match_request_id = $1 AND status = 'pinged'
      RETURNING id`,
    [match.id]
  );
  const row = expired.rows[0];
  if (row) {
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
  await client.query('COMMIT');
  if (row) {
    notifyUser(
      row.customer_id,
      'No labourer available',
      'Sorry, this match request expired before an offer was accepted.',
      { matchId: row.id, reason: 'request_deadline_elapsed' }
    ).catch(() => {});
  }
  return {
    ok: false,
    error: 'offer_expired',
    reasonCode: 'match_request_expired',
    detail: 'The server match-request deadline elapsed before acceptance.',
  };
}

async function timeoutLockedAttempt(client, attemptId) {
  await client.query(
    `UPDATE match_attempts
        SET status = 'timeout', responded_at = clock_timestamp(),
            dispatch_lease_id = NULL,
            dispatch_lease_expires_at = NULL
      WHERE id = $1 AND status = 'pinged'
      RETURNING id`,
    [attemptId]
  );
  await client.query('COMMIT');
  return {
    ok: false,
    error: 'offer_expired',
    reasonCode: 'match_attempt_expired',
    detail: 'The server offer-response window elapsed before acceptance.',
  };
}

async function commitAttemptToBooking(matchId, attemptId, labourerId) {
  // No attempt/match state may be claimed unless the accepted booking can be
  // born with a complete, explicitly approved canonical fulfilment contract.
  const fulfilmentPolicy = requireApprovedFulfilmentPolicy();
  // Use a transaction to atomically: lock match row, mark attempt accepted,
  // create booking, link booking on match.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT id, status, customer_id, skill_needed, address,
              location_lat, location_lng, coordinate_source, scheduled_at, hours_est, notes,
              expires_at, expires_at > clock_timestamp() AS request_window_open,
              clock_timestamp() AS server_now
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
    if (m.request_window_open !== true) {
      return expireLockedRequest(client, m);
    }

    const attemptResult = await client.query(
      `SELECT id, status, pinged_at, offer_expires_at,
              offer_expires_at > clock_timestamp() AS attempt_window_open
         FROM match_attempts
        WHERE id = $1 AND match_request_id = $2 AND labourer_id = $3
        FOR UPDATE`,
      [attemptId, matchId, labourerId]
    );
    const attempt = attemptResult.rows[0];
    if (!attempt || attempt.status !== 'pinged') {
      await client.query('ROLLBACK');
      return { ok: false, error: 'attempt_not_active' };
    }
    if (attempt.attempt_window_open !== true) {
      return timeoutLockedAttempt(client, attemptId);
    }

    const acceptanceGate = await workerAcceptanceGate(client, labourerId, new Date(m.server_now));
    if (!acceptanceGate.allowed) {
      await client.query('ROLLBACK');
      return { ok: false, ...acceptanceGate };
    }

    // Claim against DB wall-clock deadlines after the readiness queries. The
    // match and attempt rows are locked, so this remains the single winner;
    // the deadline predicates close the timer/event-loop boundary race.
    const claim = await client.query(
      `UPDATE match_attempts
          SET status = 'accepted', responded_at = clock_timestamp(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL
        WHERE id = $1 AND status = 'pinged'
          AND offer_expires_at > clock_timestamp()
          AND EXISTS (
            SELECT 1 FROM match_requests
             WHERE id = $2 AND status = 'pending'
               AND expires_at > clock_timestamp()
          )
        RETURNING id`,
      [attemptId, matchId]
    );
    if (claim.rowCount === 0) {
      const deadlines = await client.query(
        `SELECT m.expires_at <= clock_timestamp() AS request_expired,
                a.offer_expires_at <= clock_timestamp() AS attempt_expired
           FROM match_requests m
           JOIN match_attempts a ON a.match_request_id = m.id
          WHERE m.id = $1 AND a.id = $2`,
        [matchId, attemptId]
      );
      if (deadlines.rows[0]?.request_expired === true) return expireLockedRequest(client, m);
      if (deadlines.rows[0]?.attempt_expired === true) return timeoutLockedAttempt(client, attemptId);
      await client.query('ROLLBACK');
      return { ok: false, error: 'attempt_not_active' };
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
          (customer_id, labourer_id, status, operational_phase, skill_needed, address,
            location_lat, location_lng, coordinate_source, scheduled_at, hours_est, total_amount, notes)
        VALUES ($1, $2, 'accepted', 'scheduled', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
      [m.customer_id, labourerId, m.skill_needed, m.address,
       m.location_lat, m.location_lng, m.coordinate_source, m.scheduled_at,
       m.hours_est || null, total, m.notes || null]
    );
    const booking = bookingRes.rows[0];
    const acceptedScopeSummary = matchScopeSummary(m);
    const scopeItems = [acceptedScopeSummary];
    const estimatedMinutes = m.hours_est == null
      ? null
      : Math.round(Number(m.hours_est) * 60);
    await bootstrapCanonicalFulfilment(client, {
      bookingId: booking.id,
      policy: fulfilmentPolicy,
      proposedBy: m.customer_id,
      proposedByRole: 'customer',
      customerId: m.customer_id,
      workerId: labourerId,
      scopeSnapshot: {
        schemaVersion: 1,
        agreementSource: 'accepted_match_request',
        matchRequestId: m.id,
        serviceLabel: acceptedScopeSummary,
        description: acceptedScopeSummary,
        items: scopeItems,
        materialsResponsibility: 'Materials responsibility was not separately recorded in this match request.',
        materialsResponsibilityCode: 'not_recorded',
        estimatedMinutes: Number.isSafeInteger(estimatedMinutes) && estimatedMinutes > 0
          ? estimatedMinutes
          : null,
        schedule: {
          startsAt: new Date(m.scheduled_at).toISOString(),
        },
      },
      scopeItems,
    });
    await client.query(
      `INSERT INTO grounded_project_events (
         booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
         booking_status, operational_phase, payload
       ) VALUES ($1, 0, 'project.created', $2, 'labourer', 'accepted', 'scheduled', $3::jsonb)
       ON CONFLICT (booking_id, aggregate_sequence) DO NOTHING`,
      [
        booking.id,
        labourerId,
        JSON.stringify({
          projectId: booking.id,
          source: 'accepted_match_request',
          matchRequestId: m.id,
        }),
      ]
    );

    await client.query(
      `UPDATE match_attempts
          SET status = 'cancelled', responded_at = NOW(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL
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
              matched_at = NOW(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_last_error = NULL
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
    return {
      ok: true,
      booking: {
        ...booking,
        canonical_fulfilment_policy_present: true,
        current_scope_version: 1,
        scope_confirmed_by_customer: true,
        scope_confirmed_by_labourer: true,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Dispatcher loop ─────────────────────────────────────────────────────────

function resultReason(attempts) {
  if (attempts.length === 0) return 'no_candidates';
  const declined = attempts.filter(attempt => attempt.status === 'declined').length;
  const timedOut = attempts.filter(attempt => attempt.status === 'timeout').length;
  if (declined === attempts.length) return 'all_declined';
  if (timedOut === attempts.length) return 'all_timeout';
  return 'all_unavailable';
}

async function defaultOfferDelivery({ matchRequest, attempt, labourer }) {
  const remainingMs = Math.max(0, new Date(attempt.offer_expires_at).getTime() - Date.now());
  const scopeSummary = matchScopeSummary(matchRequest);
  const candidatePayload = serializeMatchForLabourerCandidate({
    ...matchRequest,
    matchId: matchRequest.id,
    attemptId: attempt.id,
    hourly_rate: labourer.hourly_rate,
    timeout_ms: remainingMs,
    offer_expires_at: attempt.offer_expires_at,
  });

  // Provider push and the authenticated socket are best-effort transports.
  // The database attempt is the canonical offer. Marking it dispatched only
  // happens after these calls return; a crash before that point causes a
  // lease-delayed duplicate with the same stable attempt id.
  const push = await notifyUser(
    labourer.user_id,
    'New job request',
    `${scopeSummary} - R${matchRequest.hours_est ? Number(labourer.hourly_rate) * Number(matchRequest.hours_est) : '?'} - nearby job`,
    {
      type: 'match_incoming',
      ...candidatePayload,
      skill: scopeSummary,
    }
  );
  let socketEmitted = false;
  if (global.__togt_io) {
    try {
      // Workers authenticate on the dedicated `/match` namespace. Emitting on
      // the root namespace does not reach rooms with the same name there.
      const matchNamespace = typeof global.__togt_io.of === 'function'
        ? global.__togt_io.of('/match')
        : global.__togt_io;
      matchNamespace.to(`user:${labourer.user_id}`).emit('match:incoming', candidatePayload);
      socketEmitted = true;
    } catch {}
  }
  return { push, socketEmitted };
}

async function claimDueMatches({ matchId = null, batchSize = DISPATCH_BATCH } = {}) {
  const result = await db.query(
    `WITH due AS (
       SELECT id
         FROM match_requests
        WHERE status = 'pending'
          AND dispatch_next_at <= clock_timestamp()
          AND (dispatch_lease_expires_at IS NULL
               OR dispatch_lease_expires_at <= clock_timestamp())
          AND ($1::uuid IS NULL OR id = $1)
        ORDER BY dispatch_next_at, created_at
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE match_requests request
        SET dispatch_lease_id = gen_random_uuid(),
            dispatch_lease_expires_at = clock_timestamp()
              + ($3::double precision * INTERVAL '1 millisecond'),
            dispatch_claim_count = dispatch_claim_count + 1,
            dispatch_last_error = NULL
       FROM due
      WHERE request.id = due.id
      RETURNING request.*`,
    [matchId, batchSize, DISPATCH_LEASE_MS]
  );
  return result.rows;
}

async function expireClaimedMatch(client, matchRequest, reason) {
  await client.query(
    `UPDATE match_attempts
        SET status = 'timeout', responded_at = clock_timestamp(),
            dispatch_lease_id = NULL,
            dispatch_lease_expires_at = NULL
      WHERE match_request_id = $1 AND status = 'pinged'`,
    [matchRequest.id]
  );
  const expired = await client.query(
    `UPDATE match_requests
        SET status = 'expired', expire_reason = $3,
            dispatch_lease_id = NULL,
            dispatch_lease_expires_at = NULL,
            dispatch_last_error = NULL
      WHERE id = $1 AND status = 'pending' AND dispatch_lease_id = $2
      RETURNING *`,
    [matchRequest.id, matchRequest.dispatch_lease_id, reason]
  );
  const row = expired.rows[0];
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
}

async function processMatchClaim(claim) {
  try {
    const outcome = await withTx(async (client) => {
      const locked = await client.query(
        `SELECT *, clock_timestamp() AS server_now
           FROM match_requests
          WHERE id = $1 AND status = 'pending' AND dispatch_lease_id = $2
          FOR UPDATE`,
        [claim.id, claim.dispatch_lease_id]
      );
      const matchRequest = locked.rows[0];
      if (!matchRequest) return { state: 'stale_claim' };
      const serverNow = new Date(matchRequest.server_now);

      if (new Date(matchRequest.expires_at) <= serverNow) {
        const expired = await expireClaimedMatch(
          client,
          matchRequest,
          'request_deadline_elapsed'
        );
        return { state: 'expired', matchRequest: expired };
      }

      const activeResult = await client.query(
        `SELECT * FROM match_attempts
          WHERE match_request_id = $1 AND status = 'pinged'
          ORDER BY pinged_at DESC
          LIMIT 1
          FOR UPDATE`,
        [matchRequest.id]
      );
      const activeAttempt = activeResult.rows[0];
      if (activeAttempt && new Date(activeAttempt.offer_expires_at) > serverNow) {
        await client.query(
          `UPDATE match_requests
              SET dispatch_next_at = LEAST($3::timestamptz, expires_at),
                  dispatch_lease_id = NULL,
                  dispatch_lease_expires_at = NULL,
                  dispatch_last_error = NULL
            WHERE id = $1 AND dispatch_lease_id = $2`,
          [matchRequest.id, matchRequest.dispatch_lease_id, activeAttempt.offer_expires_at]
        );
        return { state: 'waiting', attemptId: activeAttempt.id };
      }
      if (activeAttempt) {
        await client.query(
          `UPDATE match_attempts
              SET status = 'timeout', responded_at = clock_timestamp(),
                  dispatch_lease_id = NULL,
                  dispatch_lease_expires_at = NULL
            WHERE id = $1 AND status = 'pinged'`,
          [activeAttempt.id]
        );
      }

      const attemptsResult = await client.query(
        `SELECT status FROM match_attempts
          WHERE match_request_id = $1
          ORDER BY pinged_at`,
        [matchRequest.id]
      );
      if (attemptsResult.rows.length >= MAX_CANDIDATES) {
        const expired = await expireClaimedMatch(
          client,
          matchRequest,
          resultReason(attemptsResult.rows)
        );
        return { state: 'expired', matchRequest: expired };
      }

      const candidates = await selectCandidates({
        skill: matchRequest.skill_needed,
        lat: matchRequest.location_lat,
        lng: matchRequest.location_lng,
        matchRequestId: matchRequest.id,
        limit: MAX_CANDIDATES - attemptsResult.rows.length,
      }, client);
      if (candidates.length === 0) {
        const expired = await expireClaimedMatch(
          client,
          matchRequest,
          resultReason(attemptsResult.rows)
        );
        return { state: 'expired', matchRequest: expired };
      }

      const labourer = candidates[0];
      const inserted = await client.query(
        `INSERT INTO match_attempts (
           match_request_id, labourer_id, pinged_at, offer_expires_at,
           dispatch_next_at
         )
         VALUES (
           $1, $2, clock_timestamp(),
           clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond'),
           clock_timestamp()
         )
         ON CONFLICT (match_request_id, labourer_id) DO NOTHING
         RETURNING *`,
        [matchRequest.id, labourer.user_id, PING_TIMEOUT_MS]
      );
      const attempt = inserted.rows[0];
      if (!attempt) {
        await client.query(
          `UPDATE match_requests
              SET dispatch_next_at = clock_timestamp(),
                  dispatch_lease_id = NULL,
                  dispatch_lease_expires_at = NULL
            WHERE id = $1 AND dispatch_lease_id = $2`,
          [matchRequest.id, matchRequest.dispatch_lease_id]
        );
        return { state: 'retry' };
      }
      await client.query(
        `UPDATE match_requests
            SET dispatch_next_at = LEAST($3::timestamptz, expires_at),
                dispatch_lease_id = NULL,
                dispatch_lease_expires_at = NULL,
                dispatch_last_error = NULL
          WHERE id = $1 AND dispatch_lease_id = $2`,
        [matchRequest.id, matchRequest.dispatch_lease_id, attempt.offer_expires_at]
      );
      return { state: 'attempt_created', attemptId: attempt.id };
    });

    if (outcome.state === 'expired' && outcome.matchRequest) {
      notifyUser(
        outcome.matchRequest.customer_id,
        'No labourer available',
        'Sorry, no one is available right now. Please try again or schedule for later.',
        { matchId: outcome.matchRequest.id, reason: outcome.matchRequest.expire_reason }
      ).catch(() => {});
    }
    return outcome;
  } catch (err) {
    const message = String(err.message || err).slice(0, ERROR_MAX_CHARS);
    try {
      await db.query(
        `UPDATE match_requests
            SET dispatch_next_at = clock_timestamp()
                + ($3::double precision * INTERVAL '1 millisecond'),
                dispatch_lease_id = NULL,
                dispatch_lease_expires_at = NULL,
                dispatch_last_error = $4
          WHERE id = $1 AND status = 'pending' AND dispatch_lease_id = $2`,
        [claim.id, claim.dispatch_lease_id, DISPATCH_RETRY_MS, message]
      );
    } catch {}
    throw err;
  }
}

async function claimDueAttemptDeliveries({
  matchId = null,
  attemptId = null,
  batchSize = DISPATCH_BATCH,
} = {}) {
  const result = await db.query(
    `WITH due AS (
       SELECT attempt.id
         FROM match_attempts attempt
         JOIN match_requests request ON request.id = attempt.match_request_id
        WHERE request.status = 'pending'
          AND request.expires_at > clock_timestamp()
          AND attempt.status = 'pinged'
          AND attempt.dispatched_at IS NULL
          AND attempt.offer_expires_at > clock_timestamp()
          AND attempt.dispatch_next_at <= clock_timestamp()
          AND (attempt.dispatch_lease_expires_at IS NULL
               OR attempt.dispatch_lease_expires_at <= clock_timestamp())
          AND ($1::uuid IS NULL OR request.id = $1)
          AND ($2::uuid IS NULL OR attempt.id = $2)
        ORDER BY attempt.dispatch_next_at, attempt.pinged_at
        LIMIT $3
        FOR UPDATE OF attempt SKIP LOCKED
     )
     UPDATE match_attempts attempt
        SET dispatch_lease_id = gen_random_uuid(),
            dispatch_lease_expires_at = clock_timestamp()
              + ($4::double precision * INTERVAL '1 millisecond'),
            dispatch_attempt_count = dispatch_attempt_count + 1,
            dispatch_last_error = NULL
       FROM due
      WHERE attempt.id = due.id
      RETURNING attempt.*`,
    [matchId, attemptId, batchSize, DISPATCH_LEASE_MS]
  );
  return result.rows;
}

async function deliverAttemptClaim(claim) {
  const loaded = await db.query(
    `SELECT attempt.id AS attempt_id,
            attempt.match_request_id,
            attempt.labourer_id,
            attempt.offer_expires_at,
            attempt.dispatch_lease_id,
            request.customer_id, request.skill_needed, request.address,
            request.location_lat, request.location_lng, request.scheduled_at,
            request.hours_est, request.notes, request.created_at,
            profile.hourly_rate
       FROM match_attempts attempt
       JOIN match_requests request ON request.id = attempt.match_request_id
       JOIN labourer_profiles profile ON profile.user_id = attempt.labourer_id
      WHERE attempt.id = $1
        AND attempt.status = 'pinged'
        AND request.status = 'pending'
        AND request.expires_at > clock_timestamp()
        AND attempt.offer_expires_at > clock_timestamp()
        AND attempt.dispatch_lease_id = $2`,
    [claim.id, claim.dispatch_lease_id]
  );
  const row = loaded.rows[0];
  if (!row) {
    await db.query(
      `UPDATE match_attempts
          SET dispatch_lease_id = NULL, dispatch_lease_expires_at = NULL
        WHERE id = $1 AND dispatch_lease_id = $2`,
      [claim.id, claim.dispatch_lease_id]
    );
    return 'stale';
  }

  const matchRequest = {
    id: row.match_request_id,
    customer_id: row.customer_id,
    skill_needed: row.skill_needed,
    address: row.address,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    scheduled_at: row.scheduled_at,
    hours_est: row.hours_est,
    notes: row.notes,
    created_at: row.created_at,
  };
  const attempt = { id: row.attempt_id, offer_expires_at: row.offer_expires_at };
  const labourer = { user_id: row.labourer_id, hourly_rate: row.hourly_rate };

  try {
    const deliver = offerDeliveryOverride || defaultOfferDelivery;
    await deliver({ matchRequest, attempt, labourer });
    await db.query(
      `UPDATE match_attempts
          SET dispatched_at = COALESCE(dispatched_at, clock_timestamp()),
              dispatch_next_at = offer_expires_at,
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_last_error = NULL
        WHERE id = $1 AND dispatch_lease_id = $2`,
      [claim.id, claim.dispatch_lease_id]
    );
    return 'dispatched';
  } catch (err) {
    const message = String(err.message || err).slice(0, ERROR_MAX_CHARS);
    await db.query(
      `UPDATE match_attempts
          SET dispatch_next_at = LEAST(
                offer_expires_at,
                clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond')
              ),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_last_error = $4
        WHERE id = $1 AND dispatch_lease_id = $2`,
      [claim.id, claim.dispatch_lease_id, DISPATCH_RETRY_MS, message]
    );
    return 'retry';
  }
}

async function tick({ matchId = null, attemptId = null } = {}) {
  if (stopped) return { matchesClaimed: 0, attemptsClaimed: 0 };
  stats.ticks_total += 1;
  stats.last_tick_at = new Date().toISOString();
  try {
    const matchClaims = await claimDueMatches({ matchId });
    stats.matches_claimed_total += matchClaims.length;
    const matchResults = await Promise.allSettled(matchClaims.map(processMatchClaim));
    let failed = false;
    for (const result of matchResults) {
      if (result.status === 'rejected') {
        failed = true;
        console.error('[matcher] match claim failed:', result.reason?.message || result.reason);
      }
    }
    const attemptClaims = await claimDueAttemptDeliveries({ matchId, attemptId });
    stats.attempts_claimed_total += attemptClaims.length;
    const attemptResults = await Promise.allSettled(attemptClaims.map(deliverAttemptClaim));
    for (const result of attemptResults) {
      if (result.status === 'rejected') {
        failed = true;
        console.error('[matcher] offer dispatch failed:', result.reason?.message || result.reason);
      }
    }
    if (failed) stats.failed_ticks_total += 1;
    else stats.last_success_at = new Date().toISOString();
    return {
      matchesClaimed: matchClaims.length,
      attemptsClaimed: attemptClaims.length,
    };
  } catch (err) {
    stats.failed_ticks_total += 1;
    throw err;
  }
}

async function runMatchNow(matchId) {
  try {
    await tick({ matchId });
  } catch (err) {
    console.error('[matcher] dispatchMatch failed:', err.message);
  }
}

function dispatchMatch(matchId) {
  // Low-latency nudge only. Durable `dispatch_next_at` is the ownership
  // source and the interval loop recovers this work if the process dies.
  setImmediate(() => runMatchNow(matchId));
}

async function scheduledTick() {
  if (scheduledTickInFlight || stopped) return;
  scheduledTickInFlight = true;
  try {
    await tick();
  } finally {
    scheduledTickInFlight = false;
  }
}

function start({ intervalMs = 1000 } = {}) {
  stopped = false;
  scheduledTickInFlight = false;
  if (timer) clearInterval(timer);
  stats.ticks_total = 0;
  stats.matches_claimed_total = 0;
  stats.attempts_claimed_total = 0;
  stats.failed_ticks_total = 0;
  stats.last_tick_at = null;
  stats.last_success_at = null;
  stats.started_at = new Date().toISOString();
  stats.interval_ms = intervalMs;
  timer = setInterval(() => {
    scheduledTick().catch(err => console.error('[matcher] tick failed:', err.message));
  }, intervalMs);
  if (timer.unref) timer.unref();
  scheduledTick().catch(err => console.error('[matcher] initial tick failed:', err.message));
}

function isFresh(intervalMs = stats.interval_ms || 1000, freshnessFactor = 3) {
  if (!stats.last_success_at) return false;
  const age = Date.now() - new Date(stats.last_success_at).getTime();
  return age < intervalMs * freshnessFactor;
}

function stop() {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ─── External API used by routes ────────────────────────────────────────────

async function recordResponse(attemptId, status) {
  // status: 'accepted' | 'declined' | 'cancelled'
  const matchId = await withTx(async (client) => {
    const updated = await client.query(
      `UPDATE match_attempts
          SET status = $2, responded_at = clock_timestamp(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL
        WHERE id = $1 AND status = 'pinged'
        RETURNING match_request_id`,
      [attemptId, status]
    );
    const id = updated.rows[0]?.match_request_id;
    if (id) {
      await client.query(
        `UPDATE match_requests
            SET dispatch_next_at = clock_timestamp(),
                dispatch_lease_id = CASE
                  WHEN dispatch_lease_expires_at <= clock_timestamp() THEN NULL
                  ELSE dispatch_lease_id
                END,
                dispatch_lease_expires_at = CASE
                  WHEN dispatch_lease_expires_at <= clock_timestamp() THEN NULL
                  ELSE dispatch_lease_expires_at
                END
          WHERE id = $1 AND status = 'pending'`,
        [id]
      );
    }
    return id || null;
  });
  if (matchId && status !== 'accepted') dispatchMatch(matchId);
  return Boolean(matchId);
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
    await client.query(
      `UPDATE match_attempts
          SET status = 'cancelled', responded_at = NOW(),
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL
        WHERE match_request_id = $1 AND status = 'pinged'`,
      [matchId]
    );
    const cancelled = await client.query(
      `UPDATE match_requests
          SET status = 'cancelled',
              dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_last_error = NULL
        WHERE id = $1
        RETURNING *`,
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
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


// Boot-time recovery is non-destructive. Pending requests survive a restart;
// work with no active lease becomes due immediately, while live leases from a
// concurrently running instance remain untouched until their DB deadline.
async function recoverPendingDispatches() {
  return withTx(async (client) => {
    await client.query(
      `UPDATE match_attempts
          SET dispatch_lease_id = NULL,
              dispatch_lease_expires_at = NULL,
              dispatch_next_at = LEAST(dispatch_next_at, clock_timestamp())
        WHERE status = 'pinged'
          AND dispatched_at IS NULL
          AND dispatch_lease_expires_at <= clock_timestamp()`
    );
    const recovered = await client.query(
      `UPDATE match_requests
          SET dispatch_next_at = CASE
                WHEN EXISTS (
                  SELECT 1 FROM match_attempts attempt
                   WHERE attempt.match_request_id = match_requests.id
                     AND attempt.status = 'pinged'
                     AND attempt.offer_expires_at > clock_timestamp()
                ) THEN LEAST(
                  dispatch_next_at,
                  expires_at,
                  (SELECT MIN(attempt.offer_expires_at)
                     FROM match_attempts attempt
                    WHERE attempt.match_request_id = match_requests.id
                      AND attempt.status = 'pinged')
                )
                ELSE LEAST(dispatch_next_at, expires_at, clock_timestamp())
              END,
              dispatch_lease_id = CASE
                WHEN dispatch_lease_expires_at <= clock_timestamp() THEN NULL
                ELSE dispatch_lease_id
              END,
              dispatch_lease_expires_at = CASE
                WHEN dispatch_lease_expires_at <= clock_timestamp() THEN NULL
                ELSE dispatch_lease_expires_at
              END
        WHERE status = 'pending'
        RETURNING id`
    );
    return recovered.rowCount;
  });
}

// Backward-compatible name for existing callers. Its semantics are now safe
// recovery, not destructive expiration.
const sweepStalePending = recoverPendingDispatches;

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
  recoverPendingDispatches,
  getPingTimeoutMs,
  start,
  stop,
  tick,
  isFresh,
  stats,
  // For tests:
  __setPingTimeoutForTesting: setPingTimeoutForTesting,
  __resetPingTimeoutForTesting: resetPingTimeoutForTesting,
  __setDispatchLeaseForTesting: setDispatchLeaseForTesting,
  __resetDispatchLeaseForTesting: resetDispatchLeaseForTesting,
  __setOfferDeliveryForTesting: delivery => { offerDeliveryOverride = delivery; },
  __resetOfferDeliveryForTesting: () => { offerDeliveryOverride = null; },
  __pendingSize: () => 0,
};
