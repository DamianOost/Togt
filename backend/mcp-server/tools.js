/**
 * Togt MCP tool catalog + handlers, factored out of the stdio entry point
 * so the same tools are reachable from BOTH:
 *   1. stdio (Claude Desktop spawns mcp-server/index.js locally)
 *   2. HTTP at /mcp (any remote agent with an API key)
 *
 * Each handler receives a `ctx = { userId, scopes }` object instead of
 * reading TOGT_USER_ID. The transport layer constructs ctx — for stdio
 * from env vars, for HTTP from the API key middleware.
 *
 * Scope gating: tools are tagged with their required scope; the dispatcher
 * enforces it.
 */

const crypto = require('crypto');
const db = require('../src/config/db');
const matcher = require('../src/services/matcher');
const { encryptSecret } = require('../src/lib/webhookSecretCrypto');
const { EVENT_TYPES } = require('../src/services/events');
const { normalizeAddressEvidence } = require('../src/lib/addressProvenance');
const {
  serializeLabourerPublic,
  serializeBookingForUser,
  serializeMatchForCustomer,
  serializeMatchForLabourerCandidate,
} = require('../src/lib/privacy');

const BOOKING_READ_SELECT = `
  SELECT b.*,
         (
           b.accepted_quote_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM grounded_booking_agreement_snapshots grounded_agreement
             WHERE grounded_agreement.booking_id = b.id
           )
           OR EXISTS (
             SELECT 1 FROM grounded_fulfilment_policy_snapshots grounded_policy
             WHERE grounded_policy.booking_id = b.id
           )
           OR EXISTS (
             SELECT 1 FROM match_requests grounded_match
             WHERE grounded_match.matched_booking_id = b.id
           )
         ) AS canonical_fulfilment_policy_present,
         cu.name AS customer_name, cu.phone AS customer_phone, cu.avatar_url AS customer_avatar,
         lu.name AS labourer_name, lu.phone AS labourer_phone, lu.avatar_url AS labourer_avatar,
         lp.hourly_rate, lp.skills, lp.current_lat, lp.current_lng, lp.location_updated_at
    FROM bookings b
    LEFT JOIN users cu ON cu.id = b.customer_id
    LEFT JOIN users lu ON lu.id = b.labourer_id
    LEFT JOIN labourer_profiles lp ON lp.user_id = b.labourer_id`;

function serializeMcpLabourerCandidate(candidate) {
  const safe = serializeLabourerPublic(candidate);
  return {
    user_id: safe.user_id,
    name: safe.name,
    rating: Number(candidate.rating_avg) || 0,
    review_count: Number(candidate.rating_count) || 0,
    acceptance_rate_pct: safe.acceptance_rate_pct ?? null,
    completion_rate_pct: safe.completion_rate_pct ?? null,
    pinged_last_30d: safe.pinged_30d,
    bookings_last_30d: safe.bookings_30d,
    days_since_last_booking: safe.days_since_last_booking,
    hourly_rate: Number(candidate.hourly_rate),
    currency: 'ZAR',
    estimated_minimum_total: Number(candidate.hourly_rate),
    distance_km: candidate.distance_km == null ? undefined : Number(candidate.distance_km).toFixed(2),
    approx_lat: safe.approx_lat,
    approx_lng: safe.approx_lng,
    location_precision: safe.location_precision,
  };
}

function serializeMcpBooking(row, ctx) {
  return serializeBookingForUser(row, { userId: ctx.userId });
}

function serializeMcpMatch(row, ctx) {
  return row.customer_id === ctx.userId
    ? serializeMatchForCustomer(row)
    : serializeMatchForLabourerCandidate(row);
}

// ─── Tool implementations ────────────────────────────────────────────────────

async function findLabourers(ctx, { skill, lat, lng, radius_km = 50, limit = 5 }) {
  if (!skill || lat == null || lng == null) {
    throw new Error('skill, lat, lng are required');
  }
  const candidates = await matcher.selectCandidates({ skill, lat, lng, radiusKm: radius_km, limit });
  return candidates.map(serializeMcpLabourerCandidate);
}

async function estimateBookingCost(ctx, { labourer_id, hours }) {
  if (!labourer_id || !hours) throw new Error('labourer_id and hours are required');
  const profile = await db.query(
    'SELECT hourly_rate, rating_avg, rating_count FROM labourer_profiles WHERE user_id = $1',
    [labourer_id]
  );
  if (profile.rows.length === 0) throw new Error(`Labourer ${labourer_id} not found`);
  const rate = Number(profile.rows[0].hourly_rate);
  const subtotal = +(rate * Number(hours)).toFixed(2);
  const platformFee = 0; // POC: no fee taken; integrators must still see the field so the breakdown is structurally complete
  const total = +(subtotal + platformFee).toFixed(2);

  // expected_completion_rate_pct (last 30d) — memo 3 ("supply_confidence_score")
  const stats = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '30 days') AS completed_30d,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS bookings_30d
       FROM bookings WHERE labourer_id = $1`,
    [labourer_id]
  );
  const b30 = Number(stats.rows[0].bookings_30d);
  const c30 = Number(stats.rows[0].completed_30d);
  const expectedCompletionPct = b30 > 0 ? +(((c30 / b30) * 100).toFixed(1)) : null;

  return {
    hourly_rate: rate,
    hours: Number(hours),
    // structured breakdown (memo 1 + memo 3) — no surprise fees post-booking
    subtotal,
    platform_fee: platformFee,
    total,
    currency: 'ZAR',
    // cancellation semantics surfaced (memo 1 #3)
    cancellation_window_seconds: 180,
    cancellation_penalty: { within_window: 0, after_window: total, currency: 'ZAR' },
    cancellation_policy: 'Free cancellation within 3 minutes of match acceptance. Full charge thereafter.',
    // confidence signal (memo 3 #5)
    expected_completion_rate_pct: expectedCompletionPct,
    completed_bookings_30d: c30,
    total_bookings_30d: b30,
    // labourer trust signals (memo 1 #1)
    labourer_rating: Number(profile.rows[0].rating_avg) || 0,
    labourer_review_count: Number(profile.rows[0].rating_count) || 0,
  };
}

async function createMatchRequest(ctx, args) {
  const {
    skill_needed, address, location_lat, location_lng,
    coordinate_source, scheduled_at, hours_est, notes,
  } = args;
  if (!skill_needed || !address || location_lat == null || location_lng == null || !scheduled_at) {
    throw new Error('skill_needed, address, location_lat, location_lng, scheduled_at are required');
  }
  const location = normalizeAddressEvidence({
    latitude: location_lat,
    longitude: location_lng,
    coordinateSource: coordinate_source,
  }, { surface: 'legacy_audit', label: 'match location' });
  const sched = new Date(scheduled_at);
  if (Number.isNaN(sched.getTime()) || sched.getTime() <= Date.now()) {
    throw new Error('scheduled_at must be a valid ISO-8601 datetime in the future');
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const ins = await db.query(
    `INSERT INTO match_requests
       (customer_id, skill_needed, address, location_lat, location_lng,
         coordinate_source, scheduled_at, hours_est, notes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [ctx.userId, skill_needed, address, location.latitude, location.longitude,
     location.coordinateSource, sched, hours_est || null, notes || null, expiresAt]
  );
  const match = ins.rows[0];
  matcher.dispatchMatch(match.id);
  return {
    match_id: match.id, status: match.status, expires_at: match.expires_at,
    note: 'Dispatch started. Poll get_match_request every 2-3 seconds.',
  };
}

async function getMatchRequest(ctx, { match_id }) {
  if (!match_id) throw new Error('match_id is required');
  const m = await matcher.loadMatch(match_id);
  if (!m) throw new Error(`Match ${match_id} not found`);
  const isCustomer = m.customer_id === ctx.userId;
  if (!isCustomer) {
    const allowed = await db.query(
      `SELECT 1 FROM match_attempts WHERE match_request_id = $1 AND labourer_id = $2 LIMIT 1`,
      [match_id, ctx.userId]
    );
    if (allowed.rows.length === 0) throw new Error('Forbidden: not your match');
  }
  const attempts = await db.query(
    `SELECT id, labourer_id, status, pinged_at, responded_at
       FROM match_attempts WHERE match_request_id = $1
       ORDER BY pinged_at ASC`,
    [match_id]
  );
  return {
    match: serializeMcpMatch(m, ctx),
    attempts: isCustomer ? attempts.rows : attempts.rows.filter((a) => a.labourer_id === ctx.userId),
  };
}

async function cancelMatchRequest(ctx, { match_id }) {
  if (!match_id) throw new Error('match_id is required');
  const m = await matcher.loadMatch(match_id);
  if (!m) throw new Error(`Match ${match_id} not found`);
  if (m.customer_id !== ctx.userId) throw new Error('Forbidden: not your match');
  if (m.status === 'matched') {
    return { ok: false, error: 'already_matched', booking_id: m.matched_booking_id,
      hint: 'Cancel the booking instead.' };
  }
  const ok = await matcher.cancelByCustomer(match_id, ctx.userId);
  return { ok, status: ok ? 'cancelled' : m.status };
}

async function listMyBookings(ctx, { status_filter, limit = 20 }) {
  const params = [ctx.userId];
  let where = 'WHERE (b.customer_id = $1 OR b.labourer_id = $1)';
  if (status_filter) { params.push(status_filter); where += ` AND b.status = $${params.length}`; }
  params.push(limit);
  const r = await db.query(
    `${BOOKING_READ_SELECT}
       ${where}
       ORDER BY b.created_at DESC LIMIT $${params.length}`, params);
  return { bookings: r.rows.map((row) => serializeMcpBooking(row, ctx)) };
}

async function getBooking(ctx, { booking_id }) {
  if (!booking_id) throw new Error('booking_id is required');
  const r = await db.query(
    `${BOOKING_READ_SELECT}
      WHERE b.id = $1 AND (b.customer_id = $2 OR b.labourer_id = $2)`,
    [booking_id, ctx.userId]
  );
  if (r.rows.length === 0) throw new Error('Booking not found or not yours');
  return { booking: serializeMcpBooking(r.rows[0], ctx) };
}

// ─── Admin tools (require admin:full scope) ─────────────────────────────────

async function adminStats(_ctx) {
  const [users, bookings, matches] = await Promise.all([
    db.query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role`),
    db.query(`SELECT status, COUNT(*)::int AS n FROM bookings GROUP BY status`),
    db.query(`SELECT status, COUNT(*)::int AS n FROM match_requests GROUP BY status`),
  ]);
  return {
    users: Object.fromEntries(users.rows.map((r) => [r.role, r.n])),
    bookings: Object.fromEntries(bookings.rows.map((r) => [r.status, r.n])),
    match_requests: Object.fromEntries(matches.rows.map((r) => [r.status, r.n])),
    last_24h_bookings: (await db.query(
      `SELECT COUNT(*)::int AS n FROM bookings WHERE created_at > NOW() - INTERVAL '24 hours'`
    )).rows[0].n,
  };
}

async function forceExpireMatch(_ctx, { match_id }) {
  if (!match_id) throw new Error('match_id is required');
  await matcher.expireMatch(match_id, 'admin_override');
  return { ok: true, match_id };
}


async function marketplaceStats(_ctx, { skill, region } = {}) {
  // Aggregate, non-sensitive supply/demand metrics. Helps integrators evaluate
  // Togt without writing test bookings (memo 3 #1 + #2). Helps the personal
  // assistant decide whether Togt is even worth trying for a given task.
  const skillFilter = skill ? `AND $1 = ANY(lp.skills)` : '';
  const params = skill ? [skill] : [];

  const [supply, demand, completion, latency] = await Promise.all([
    // Active verified labourers, by skill
    db.query(
      `SELECT lp.skills, COUNT(*)::int AS n
         FROM labourer_profiles lp
         JOIN users u ON u.id = lp.user_id
        WHERE lp.is_available = true AND u.kyc_status = 'verified'
        GROUP BY lp.skills`
    ),
    // Bookings last 7 / 30 days
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7d,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d
         FROM bookings`
    ),
    // Completion rate last 30 days
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '30 days')::int AS completed_30d,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS bookings_30d
         FROM bookings`
    ),
    // Average match-to-acceptance latency last 30 days
    db.query(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (responded_at - pinged_at)))::numeric(10,1) AS avg_seconds
         FROM match_attempts
        WHERE status = 'accepted'
          AND pinged_at > NOW() - INTERVAL '30 days'
          AND responded_at IS NOT NULL`
    ),
  ]);

  // Flatten skills into a histogram
  const skillHistogram = {};
  for (const row of supply.rows) {
    for (const sk of (row.skills || [])) {
      skillHistogram[sk] = (skillHistogram[sk] || 0) + Number(row.n);
    }
  }

  const b30 = Number(completion.rows[0].bookings_30d);
  const c30 = Number(completion.rows[0].completed_30d);

  return {
    supply: {
      active_verified_labourers: supply.rows.reduce((acc, r) => acc + Number(r.n), 0),
      by_skill: skillHistogram,
    },
    demand: {
      bookings_last_7d: demand.rows[0].last_7d,
      bookings_last_30d: demand.rows[0].last_30d,
    },
    quality: {
      completion_rate_pct_30d: b30 > 0 ? +(((c30 / b30) * 100).toFixed(1)) : null,
      completed_30d: c30,
      total_bookings_30d: b30,
    },
    performance: {
      avg_match_to_acceptance_seconds: latency.rows[0].avg_seconds === null
        ? null
        : Number(latency.rows[0].avg_seconds),
    },
    snapshot_at: new Date().toISOString(),
  };
}

// ─── Webhook subscription management ─────────────────────────────────────────

const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

async function createWebhookSubscription(ctx, { url, event_types, description }) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error('url must be an http(s) URL');
  }
  if (!Array.isArray(event_types) || event_types.length === 0) {
    throw new Error('event_types must be a non-empty array');
  }
  const unknown = event_types.filter((e) => !EVENT_TYPES.includes(e));
  if (unknown.length) {
    throw new Error(`Unknown event_types: ${unknown.join(', ')}. Known: ${EVENT_TYPES.join(', ')}`);
  }
  const plain = generateWebhookSecret();
  const r = await db.query(
    `INSERT INTO webhook_subscriptions (owner_user_id, url, secret_encrypted, event_types, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, url, event_types, description, enabled, created_at`,
    [ctx.userId, url, encryptSecret(plain), event_types, description || null]
  );
  return {
    ...r.rows[0],
    secret: plain,
    decision_context: {
      secret_visible_only_now: true,
      retry_policy: { schedule_seconds: [30, 120, 600, 3600], dead_after_seconds: 86400 },
      signature_header: 'X-Togt-Signature',
      signature_format: 't=<unix>,v1=<hmac_sha256_hex>',
      grace_window_hours_on_rotate: 24,
    },
  };
}

async function listWebhookSubscriptions(ctx) {
  const r = await db.query(
    `SELECT id, url, event_types, description, enabled, created_at, updated_at,
            last_success_at, last_failure_at, consecutive_failures, secret_previous_expires_at
       FROM webhook_subscriptions
      WHERE owner_user_id = $1
      ORDER BY created_at DESC`,
    [ctx.userId]
  );
  return { subscriptions: r.rows };
}

async function deleteWebhookSubscription(ctx, { id }) {
  if (!id) throw new Error('id is required');
  const r = await db.query(
    `DELETE FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
    [id, ctx.userId]
  );
  return { deleted: r.rowCount > 0 };
}

async function rotateWebhookSecret(ctx, { id }) {
  if (!id) throw new Error('id is required');
  const owns = await db.query(
    `SELECT id FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
    [id, ctx.userId]
  );
  if (!owns.rows.length) throw new Error('subscription not found');
  const plain = generateWebhookSecret();
  const expiresAt = new Date(Date.now() + ROTATION_GRACE_MS);
  const r = await db.query(
    `UPDATE webhook_subscriptions
        SET secret_previous_encrypted = secret_encrypted,
            secret_previous_expires_at = $2,
            secret_encrypted = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, url, event_types, enabled, secret_previous_expires_at`,
    [id, expiresAt, encryptSecret(plain)]
  );
  return {
    ...r.rows[0],
    secret: plain,
    previous_secret_expires_at: r.rows[0].secret_previous_expires_at,
    decision_context: {
      secret_visible_only_now: true,
      grace_window_hours: 24,
      signature_during_grace: 'multi-v1: t=<unix>,v1=<new>,v1=<old>',
      instruction: 'Roll your endpoint to verify the new secret. The old secret continues to verify deliveries for 24h.',
    },
  };
}

async function replayWebhookDelivery(ctx, { subscription_id, delivery_id }) {
  if (!subscription_id || !delivery_id) throw new Error('subscription_id and delivery_id are required');
  const owns = await db.query(
    `SELECT id FROM webhook_subscriptions WHERE id = $1 AND owner_user_id = $2`,
    [subscription_id, ctx.userId]
  );
  if (!owns.rows.length) throw new Error('subscription not found');
  const r = await db.query(
    `UPDATE webhook_deliveries
        SET status = 'pending', next_retry_at = NOW(), attempt_count = 0,
            dead_at = NULL, last_error = NULL, last_http_status = NULL
      WHERE id = $1 AND subscription_id = $2 AND status IN ('dead', 'succeeded')
      RETURNING id, status, next_retry_at`,
    [delivery_id, subscription_id]
  );
  if (!r.rows.length) throw new Error('delivery not found or not replayable');
  return r.rows[0];
}

// ─── audit_log_query ─────────────────────────────────────────────────────────
//
// Memo 2's #1 want: "the marketplace won't trust me if it can't audit me."
// Non-admin callers see only their OWN activity (rows where actor_user_id
// matches their ctx.userId OR api_key_id is one of their keys). admin:full
// callers can filter to any actor_user_id / api_key_id. All callers can
// filter by action, resource, time window, error-only, with cursor
// pagination over (occurred_at DESC, id DESC).
//
// Cursor format: base64("ISO8601|uuid"). Server-generated only — callers
// echo it back as opaque.
async function auditLogQuery(ctx, {
  action,
  resource_type,
  resource_id,
  actor_user_id,
  api_key_id,
  since,
  until,
  error_only,
  limit = 50,
  cursor,
} = {}) {
  const isAdmin = (ctx.scopes || []).includes('admin:full');

  const filters = ['TRUE'];
  const params = [];
  let i = 1;

  if (!isAdmin) {
    // Scope to the caller's own audit trail: either they were the user-actor
    // OR the request used one of their API keys.
    filters.push(`(actor_user_id = $${i} OR api_key_id IN (SELECT id FROM api_keys WHERE user_id = $${i}))`);
    params.push(ctx.userId);
    i += 1;
  } else {
    if (actor_user_id) {
      filters.push(`actor_user_id = $${i++}`);
      params.push(actor_user_id);
    }
    if (api_key_id) {
      filters.push(`api_key_id = $${i++}`);
      params.push(api_key_id);
    }
  }
  if (action) {
    filters.push(`action = $${i++}`);
    params.push(action);
  }
  if (resource_type) {
    filters.push(`resource_type = $${i++}`);
    params.push(resource_type);
  }
  if (resource_id) {
    filters.push(`resource_id = $${i++}`);
    params.push(resource_id);
  }
  if (since) {
    filters.push(`occurred_at >= $${i++}`);
    params.push(since);
  }
  if (until) {
    filters.push(`occurred_at <= $${i++}`);
    params.push(until);
  }
  if (error_only) {
    filters.push(`error_code IS NOT NULL`);
  }
  if (cursor) {
    try {
      const decoded = Buffer.from(String(cursor), 'base64').toString('utf-8');
      const [ts, id] = decoded.split('|');
      if (ts && id) {
        // Explicit casts so Postgres knows we're comparing timestamptz/uuid,
        // not text. With us-precision text from a previous SELECT, the cast
        // back to timestamptz preserves the full resolution.
        filters.push(`(occurred_at, id) < ($${i++}::timestamptz, $${i++}::uuid)`);
        params.push(ts);
        params.push(id);
      }
    } catch (_) { /* bad cursor → ignore, return from start */ }
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  params.push(safeLimit);

  // We return occurred_at as Postgres's native text representation
  // (microsecond precision) rather than letting pg-node convert it to
  // a JS Date (millisecond precision). Otherwise the cursor round-trip
  // truncates sub-ms and rows inserted within the same ms get filtered
  // out incorrectly on the next page. Round-trip is lossless when the
  // text comes from Postgres and goes back into a $N::timestamptz
  // cursor parameter.
  const sql = `
    SELECT id, occurred_at::text AS occurred_at, actor_type,
           actor_user_id, api_key_id,
           action, resource_type, resource_id, request_id, host(ip) AS ip,
           status_code, latency_ms, metadata, error_code
      FROM audit_log
     WHERE ${filters.join(' AND ')}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${i}`;

  const { rows } = await db.query(sql, params);

  let next_cursor = null;
  if (rows.length === safeLimit) {
    const last = rows[rows.length - 1];
    // last.occurred_at is now a string from Postgres with us precision.
    next_cursor = Buffer.from(`${last.occurred_at}|${last.id}`).toString('base64');
  }

  return { rows, next_cursor };
}

// ─── Tool catalog ────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'find_labourers', scope: 'mcp:read_only',
    description: 'Find verified, available labourers near a location matching a skill. Returns up to 5 ranked by rating then distance. Exact live current_lat/current_lng are never returned; approximate coordinates may be present.',
    inputSchema: {
      type: 'object', required: ['skill', 'lat', 'lng'],
      properties: {
        skill: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
        radius_km: { type: 'number', default: 50 }, limit: { type: 'number', default: 5 },
      },
    },
    handler: findLabourers,
  },
  { name: 'estimate_booking_cost', scope: 'mcp:read_only',
    description: 'Estimate total cost. Use BEFORE create_match_request to confirm budget.',
    inputSchema: { type: 'object', required: ['labourer_id', 'hours'],
      properties: { labourer_id: { type: 'string', format: 'uuid' }, hours: { type: 'number' } } },
    handler: estimateBookingCost,
  },
  { name: 'create_match_request', scope: 'mcp:full',
    description: 'Create an auto-match. Dispatcher pings nearby labourers; first to accept produces a booking. Poll get_match_request to track status.',
    inputSchema: {
      type: 'object', required: ['skill_needed', 'address', 'location_lat', 'location_lng', 'scheduled_at'],
      properties: {
        skill_needed: { type: 'string' }, address: { type: 'string' },
        location_lat: { type: 'number' }, location_lng: { type: 'number' },
        coordinate_source: {
          type: 'string',
          enum: ['device_gps', 'entered_coordinates'],
          description: 'Optional unverified audit provenance. MCP cannot assert map_pin or server-issued sources.',
        },
        scheduled_at: { type: 'string', format: 'date-time' },
        hours_est: { type: 'number' }, notes: { type: 'string' },
      },
    },
    handler: createMatchRequest,
  },
  { name: 'get_match_request', scope: 'mcp:read_only',
    description: 'Read a match request and its dispatch attempts. Customers see their own entered address; pinged labourers see approximate location only and should use get_booking after acceptance for exact reveal state.',
    inputSchema: { type: 'object', required: ['match_id'],
      properties: { match_id: { type: 'string', format: 'uuid' } } },
    handler: getMatchRequest,
  },
  { name: 'cancel_match_request', scope: 'mcp:full',
    description: 'Cancel a pending match. Returns already_matched if a labourer accepted before the cancel landed.',
    inputSchema: { type: 'object', required: ['match_id'],
      properties: { match_id: { type: 'string', format: 'uuid' } } },
    handler: cancelMatchRequest,
  },
  { name: 'list_my_bookings', scope: 'mcp:read_only',
    description: 'List bookings for the current user. Optional status_filter. Canonical fulfilment requires granted, non-revoked route access before exact counterpart/contact fields reveal; legacy-only bookings retain accepted/in_progress compatibility.',
    inputSchema: { type: 'object',
      properties: {
        status_filter: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'] },
        limit: { type: 'number', default: 20 },
      },
    },
    handler: listMyBookings,
  },
  { name: 'get_booking', scope: 'mcp:read_only',
    description: 'Read a booking by ID. Customers keep their entered address. Canonical fulfilment requires granted, non-revoked route access before exact counterpart/contact fields reveal; legacy-only bookings retain accepted/in_progress compatibility.',
    inputSchema: { type: 'object', required: ['booking_id'],
      properties: { booking_id: { type: 'string', format: 'uuid' } } },
    handler: getBooking,
  },
  { name: 'admin_stats', scope: 'admin:full',
    description: 'Admin: counts of users, bookings, matches by status. Last 24h bookings count.',
    inputSchema: { type: 'object', properties: {} },
    handler: adminStats,
  },
  { name: 'force_expire_match', scope: 'admin:full',
    description: 'Admin: force-expire a match_request (e.g. one stranded by a dispatcher bug).',
    inputSchema: { type: 'object', required: ['match_id'],
      properties: { match_id: { type: 'string', format: 'uuid' } } },
    handler: forceExpireMatch,
  },
  { name: 'marketplace_stats', scope: 'mcp:read_only',
    description: 'Aggregate, non-sensitive supply/demand metrics for evaluating Togt as a partner marketplace. Returns active labourer counts (total + by skill), bookings last 7/30 days, completion rate last 30 days, average match-to-acceptance latency. Use this to decide whether to route a user request to Togt vs another marketplace.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Optional: scope stats to a single skill (e.g. "Plumbing").' },
        region: { type: 'string', description: 'Reserved for future geographic scoping; ignored today.' },
      },
    },
    handler: marketplaceStats,
  },
  { name: 'create_webhook_subscription', scope: 'mcp:full',
    description: 'Subscribe to lifecycle events (booking.*, match_request.*, payment.*). Returns the signing secret ONCE — store it and use it to verify the X-Togt-Signature header on incoming POSTs.',
    inputSchema: {
      type: 'object', required: ['url', 'event_types'],
      properties: {
        url: { type: 'string', format: 'uri', description: 'http(s) endpoint that will receive POSTed events.' },
        event_types: { type: 'array', items: { type: 'string' }, minItems: 1 },
        description: { type: 'string' },
      },
    },
    handler: createWebhookSubscription,
  },
  { name: 'list_webhook_subscriptions', scope: 'mcp:read_only',
    description: 'List my webhook subscriptions (no secrets included).',
    inputSchema: { type: 'object', properties: {} },
    handler: listWebhookSubscriptions,
  },
  { name: 'delete_webhook_subscription', scope: 'mcp:full',
    description: 'Delete one of my webhook subscriptions.',
    inputSchema: { type: 'object', required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } } },
    handler: deleteWebhookSubscription,
  },
  { name: 'rotate_webhook_secret', scope: 'mcp:full',
    description: 'Rotate the signing secret. Old secret stays valid for 24h; during the grace window the dispatcher signs with both, so receivers can roll endpoints at their own pace. Returns new secret ONCE.',
    inputSchema: { type: 'object', required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } } },
    handler: rotateWebhookSecret,
  },
  { name: 'replay_webhook_delivery', scope: 'mcp:full',
    description: 'Re-queue a dead or succeeded webhook delivery for re-dispatch (e.g. after a receiver outage).',
    inputSchema: { type: 'object', required: ['subscription_id', 'delivery_id'],
      properties: {
        subscription_id: { type: 'string', format: 'uuid' },
        delivery_id: { type: 'string', format: 'uuid' },
      },
    },
    handler: replayWebhookDelivery,
  },
  { name: 'audit_log_query', scope: 'mcp:read_only',
    description: 'Query the audit log. Non-admin callers see only their own activity (rows where actor_user_id is them OR api_key_id belongs to them). admin:full callers can pass actor_user_id / api_key_id to scope to any actor. Filter by action, resource, time window, or error_only. Returns rows in occurred_at DESC order with cursor pagination. Use this to retrace agent activity, surface recent failures, or build observability dashboards.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Exact action key, e.g. "route.post./api/bookings" or "mcp.create_match_request".' },
        resource_type: { type: 'string' },
        resource_id: { type: 'string', format: 'uuid' },
        actor_user_id: { type: 'string', format: 'uuid', description: 'Admin-only filter.' },
        api_key_id: { type: 'string', format: 'uuid', description: 'Admin-only filter.' },
        since: { type: 'string', format: 'date-time' },
        until: { type: 'string', format: 'date-time' },
        error_only: { type: 'boolean', description: 'Only return rows where error_code IS NOT NULL.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        cursor: { type: 'string', description: 'Opaque cursor from a previous response’s next_cursor. Pass to page further back in time.' },
      },
    },
    handler: auditLogQuery,
  },
];

function listTools(ctx) {
  // Filter to tools the caller's scopes permit.
  const userScopes = new Set(ctx.scopes || []);
  return TOOLS.filter((t) => {
    if (userScopes.has('admin:full')) return true;
    if (t.scope === 'mcp:full' && (userScopes.has('mcp:full'))) return true;
    if (t.scope === 'mcp:read_only' && (userScopes.has('mcp:full') || userScopes.has('mcp:read_only'))) return true;
    if (t.scope === 'admin:full') return false;
    return false;
  }).map(({ handler, scope, ...t }) => t); // strip handler + scope from MCP-visible tool defs
}

async function callTool(ctx, name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  // Scope check
  const userScopes = new Set(ctx.scopes || []);
  if (!userScopes.has('admin:full')) {
    if (tool.scope === 'mcp:full' && !userScopes.has('mcp:full')) {
      throw new Error(`Tool '${name}' requires scope mcp:full`);
    }
    if (tool.scope === 'mcp:read_only' && !userScopes.has('mcp:full') && !userScopes.has('mcp:read_only')) {
      throw new Error(`Tool '${name}' requires scope mcp:read_only or mcp:full`);
    }
    if (tool.scope === 'admin:full') {
      throw new Error(`Tool '${name}' requires scope admin:full`);
    }
  }
  return tool.handler(ctx, args || {});
}

module.exports = {
  TOOLS,
  listTools,
  callTool,
  serializeMcpLabourerCandidate,
  serializeMcpBooking,
  serializeMcpMatch,
};
