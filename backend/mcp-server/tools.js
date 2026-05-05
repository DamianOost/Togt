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

const db = require('../src/config/db');
const matcher = require('../src/services/matcher');

// ─── Tool implementations ────────────────────────────────────────────────────

async function findLabourers(ctx, { skill, lat, lng, radius_km = 50, limit = 5 }) {
  if (!skill || lat == null || lng == null) {
    throw new Error('skill, lat, lng are required');
  }
  const candidates = await matcher.selectCandidates({ skill, lat, lng, radiusKm: radius_km, limit });
  return candidates.map((c) => ({
    user_id: c.user_id,
    name: c.name,
    rating: Number(c.rating_avg) || 0,
    hourly_rate: Number(c.hourly_rate),
    distance_km: Number(c.distance_km).toFixed(2),
  }));
}

async function estimateBookingCost(ctx, { labourer_id, hours }) {
  if (!labourer_id || !hours) throw new Error('labourer_id and hours are required');
  const r = await db.query('SELECT hourly_rate FROM labourer_profiles WHERE user_id = $1', [labourer_id]);
  if (r.rows.length === 0) throw new Error(`Labourer ${labourer_id} not found`);
  const rate = Number(r.rows[0].hourly_rate);
  const subtotal = +(rate * Number(hours)).toFixed(2);
  return {
    hourly_rate: rate, hours: Number(hours), subtotal, total: subtotal,
    currency: 'ZAR',
    cancellation_policy: 'Free cancellation within 3 minutes of match acceptance.',
  };
}

async function createMatchRequest(ctx, args) {
  const { skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, notes } = args;
  if (!skill_needed || !address || location_lat == null || location_lng == null || !scheduled_at) {
    throw new Error('skill_needed, address, location_lat, location_lng, scheduled_at are required');
  }
  const sched = new Date(scheduled_at);
  if (Number.isNaN(sched.getTime()) || sched.getTime() <= Date.now()) {
    throw new Error('scheduled_at must be a valid ISO-8601 datetime in the future');
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const ins = await db.query(
    `INSERT INTO match_requests
       (customer_id, skill_needed, address, location_lat, location_lng,
        scheduled_at, hours_est, notes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [ctx.userId, skill_needed, address, location_lat, location_lng,
     sched, hours_est || null, notes || null, expiresAt]
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
  if (m.customer_id !== ctx.userId) throw new Error('Forbidden: not your match');
  const attempts = await db.query(
    `SELECT id, labourer_id, status, pinged_at, responded_at
       FROM match_attempts WHERE match_request_id = $1
       ORDER BY pinged_at ASC`,
    [match_id]
  );
  return { match: m, attempts: attempts.rows };
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
  let where = 'WHERE (customer_id = $1 OR labourer_id = $1)';
  if (status_filter) { params.push(status_filter); where += ` AND status = $${params.length}`; }
  params.push(limit);
  const r = await db.query(
    `SELECT id, customer_id, labourer_id, status, skill_needed, address,
            scheduled_at, hours_est, total_amount, created_at
       FROM bookings ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`, params);
  return { bookings: r.rows };
}

async function getBooking(ctx, { booking_id }) {
  if (!booking_id) throw new Error('booking_id is required');
  const r = await db.query(
    'SELECT * FROM bookings WHERE id = $1 AND (customer_id = $2 OR labourer_id = $2)',
    [booking_id, ctx.userId]
  );
  if (r.rows.length === 0) throw new Error('Booking not found or not yours');
  return { booking: r.rows[0] };
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

// ─── Tool catalog ────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'find_labourers', scope: 'mcp:read_only',
    description: 'Find verified, available labourers near a location matching a skill. Returns up to 5 ranked by rating then distance.',
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
        scheduled_at: { type: 'string', format: 'date-time' },
        hours_est: { type: 'number' }, notes: { type: 'string' },
      },
    },
    handler: createMatchRequest,
  },
  { name: 'get_match_request', scope: 'mcp:read_only',
    description: 'Read a match request and its dispatch attempts. Use for polling after create_match_request.',
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
    description: 'List bookings for the current user. Optional status_filter.',
    inputSchema: { type: 'object',
      properties: {
        status_filter: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'] },
        limit: { type: 'number', default: 20 },
      },
    },
    handler: listMyBookings,
  },
  { name: 'get_booking', scope: 'mcp:read_only',
    description: 'Read a booking by ID.',
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

module.exports = { TOOLS, listTools, callTool };
