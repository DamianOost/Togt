#!/usr/bin/env node
/**
 * Togt MCP server (stdio transport).
 *
 * First Uber-for-labourers in SA with a published MCP server. An AI agent
 * (Claude Desktop, Claude Code, any MCP client) can:
 *   - find labourers by skill + location
 *   - estimate cost before committing
 *   - create / get / cancel a match request
 *   - list bookings
 *
 * Auth model (POC): TOGT_USER_ID env var. The MCP server acts on behalf of
 * that user. For production / multi-customer use, swap to TOGT_API_KEY and
 * look up the user_id from a hashed-api-keys table.
 *
 * Claude Desktop config:
 *   "mcpServers": {
 *     "togt": {
 *       "command": "node",
 *       "args": ["/Users/georgeoosthuyzen/.openclaw/workspace/Togt/backend/mcp-server/index.js"],
 *       "env": {
 *         "TOGT_USER_ID": "<your customer uuid>",
 *         "DATABASE_URL": "postgresql://georgeoosthuyzen@localhost/togt"
 *       }
 *     }
 *   }
 *
 * Run standalone: TOGT_USER_ID=... DATABASE_URL=... node mcp-server/index.js
 */

const path = require('path');

// Load env from backend/.env when running directly (so Claude Desktop config
// only needs TOGT_USER_ID; everything else comes from .env).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const db = require('../src/config/db');
const matcher = require('../src/services/matcher');

const USER_ID = process.env.TOGT_USER_ID;
if (!USER_ID) {
  console.error('FATAL: TOGT_USER_ID env var not set. The MCP server needs to know which Togt user it acts on behalf of.');
  process.exit(1);
}

async function loadUser() {
  const r = await db.query('SELECT id, name, role, kyc_status FROM users WHERE id = $1', [USER_ID]);
  if (r.rows.length === 0) {
    throw new Error(`Togt user ${USER_ID} not found in database.`);
  }
  return r.rows[0];
}

// ─── Tool implementations ────────────────────────────────────────────────────

async function findLabourers({ skill, lat, lng, radius_km = 50, limit = 5 }) {
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

async function estimateBookingCost({ labourer_id, hours }) {
  if (!labourer_id || !hours) throw new Error('labourer_id and hours are required');
  const r = await db.query('SELECT hourly_rate FROM labourer_profiles WHERE user_id = $1', [labourer_id]);
  if (r.rows.length === 0) throw new Error(`Labourer ${labourer_id} not found`);
  const rate = Number(r.rows[0].hourly_rate);
  const subtotal = +(rate * Number(hours)).toFixed(2);
  return {
    hourly_rate: rate,
    hours: Number(hours),
    subtotal,
    total: subtotal,
    currency: 'ZAR',
    cancellation_policy: 'Free cancellation within 3 minutes of match acceptance.',
  };
}

async function createMatchRequest({ skill_needed, address, location_lat, location_lng, scheduled_at, hours_est, notes }) {
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
    [USER_ID, skill_needed, address, location_lat, location_lng,
     sched, hours_est || null, notes || null, expiresAt]
  );
  const match = ins.rows[0];
  matcher.dispatchMatch(match.id);
  return {
    match_id: match.id,
    status: match.status,
    expires_at: match.expires_at,
    note: 'Dispatch started. Poll get_match_request every 2-3 seconds, or wait for status to become matched | expired | cancelled.',
  };
}

async function getMatchRequest({ match_id }) {
  if (!match_id) throw new Error('match_id is required');
  const m = await matcher.loadMatch(match_id);
  if (!m) throw new Error(`Match ${match_id} not found`);
  if (m.customer_id !== USER_ID) {
    throw new Error('Forbidden: this match belongs to a different customer');
  }
  const attempts = await db.query(
    `SELECT id, labourer_id, status, pinged_at, responded_at
       FROM match_attempts WHERE match_request_id = $1
       ORDER BY pinged_at ASC`,
    [match_id]
  );
  return { match: m, attempts: attempts.rows };
}

async function cancelMatchRequest({ match_id }) {
  if (!match_id) throw new Error('match_id is required');
  const m = await matcher.loadMatch(match_id);
  if (!m) throw new Error(`Match ${match_id} not found`);
  if (m.customer_id !== USER_ID) {
    throw new Error('Forbidden: this match belongs to a different customer');
  }
  if (m.status === 'matched') {
    return { ok: false, error: 'already_matched', booking_id: m.matched_booking_id, hint: 'Cancel the booking instead via cancel_booking.' };
  }
  const ok = await matcher.cancelByCustomer(match_id, USER_ID);
  return { ok, status: ok ? 'cancelled' : m.status };
}

async function listMyBookings({ status_filter, limit = 20 }) {
  const params = [USER_ID];
  let where = 'WHERE (customer_id = $1 OR labourer_id = $1)';
  if (status_filter) {
    params.push(status_filter);
    where += ` AND status = $${params.length}`;
  }
  params.push(limit);
  const r = await db.query(
    `SELECT id, customer_id, labourer_id, status, skill_needed, address,
            scheduled_at, hours_est, total_amount, created_at
       FROM bookings ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
    params
  );
  return { bookings: r.rows };
}

async function getBooking({ booking_id }) {
  if (!booking_id) throw new Error('booking_id is required');
  const r = await db.query(
    'SELECT * FROM bookings WHERE id = $1 AND (customer_id = $2 OR labourer_id = $2)',
    [booking_id, USER_ID]
  );
  if (r.rows.length === 0) throw new Error('Booking not found or not yours');
  return { booking: r.rows[0] };
}

// ─── MCP wiring ──────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'find_labourers',
    description: 'Find verified, available labourers near a location matching a skill. Returns up to 5 ranked by rating then distance.',
    inputSchema: {
      type: 'object',
      required: ['skill', 'lat', 'lng'],
      properties: {
        skill: { type: 'string', description: 'Skill required, e.g. "Plumbing", "Electrical", "Painting".' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        radius_km: { type: 'number', default: 50 },
        limit: { type: 'number', default: 5 },
      },
    },
  },
  {
    name: 'estimate_booking_cost',
    description: 'Estimate the total cost of booking a specific labourer for a given duration. Use BEFORE create_match_request to confirm budget.',
    inputSchema: {
      type: 'object',
      required: ['labourer_id', 'hours'],
      properties: {
        labourer_id: { type: 'string', format: 'uuid' },
        hours: { type: 'number' },
      },
    },
  },
  {
    name: 'create_match_request',
    description: 'Create an auto-match request. The dispatcher will ping nearby labourers; the first to accept produces a booking. Poll get_match_request to track status.',
    inputSchema: {
      type: 'object',
      required: ['skill_needed', 'address', 'location_lat', 'location_lng', 'scheduled_at'],
      properties: {
        skill_needed: { type: 'string' },
        address: { type: 'string' },
        location_lat: { type: 'number' },
        location_lng: { type: 'number' },
        scheduled_at: { type: 'string', format: 'date-time', description: 'ISO-8601, must be in the future.' },
        hours_est: { type: 'number' },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'get_match_request',
    description: 'Read a match request and its dispatch attempts. Use for polling after create_match_request.',
    inputSchema: {
      type: 'object',
      required: ['match_id'],
      properties: { match_id: { type: 'string', format: 'uuid' } },
    },
  },
  {
    name: 'cancel_match_request',
    description: 'Cancel a pending match. Returns already_matched if a labourer accepted before the cancel landed (cancel the booking instead).',
    inputSchema: {
      type: 'object',
      required: ['match_id'],
      properties: { match_id: { type: 'string', format: 'uuid' } },
    },
  },
  {
    name: 'list_my_bookings',
    description: 'List bookings for the current user (as customer or labourer). Optional status_filter (pending|accepted|in_progress|completed|cancelled).',
    inputSchema: {
      type: 'object',
      properties: {
        status_filter: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'] },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'get_booking',
    description: 'Read a booking by ID. Returns the full record including status, scheduled_at, total_amount.',
    inputSchema: {
      type: 'object',
      required: ['booking_id'],
      properties: { booking_id: { type: 'string', format: 'uuid' } },
    },
  },
];

const handlers = {
  find_labourers: findLabourers,
  estimate_booking_cost: estimateBookingCost,
  create_match_request: createMatchRequest,
  get_match_request: getMatchRequest,
  cancel_match_request: cancelMatchRequest,
  list_my_bookings: listMyBookings,
  get_booking: getBooking,
};

async function main() {
  const user = await loadUser();
  console.error(`[mcp] starting for user ${user.name} (${user.role})`);

  const server = new Server(
    { name: 'togt-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const handler = handlers[name];
    if (!handler) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
    }
    try {
      const result = await handler(args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: err.message || String(err) }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] connected on stdio');
}

main().catch((err) => {
  console.error('[mcp] fatal:', err.stack || err);
  process.exit(1);
});
