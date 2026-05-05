/**
 * API key management — Stripe-style prefixed keys.
 *
 * Format: `togt_live_<32 chars from a-z0-9>`
 *
 * The raw key is shown to the user ONCE at creation. We store only the
 * SHA-256 hash. Every authenticated MCP-over-HTTP call hashes the supplied
 * key and looks it up.
 *
 * Scopes (string array):
 *   mcp:full        full MCP toolset
 *   mcp:read_only   read-only MCP tools
 *   admin:full      admin tools (admin_stats, force_expire_match)
 *
 * The middleware sets req.apiKey = { id, user_id, scopes } and also req.user
 * (loaded from users) so downstream code that expects req.user.id works.
 */

const crypto = require('crypto');
const db = require('./../config/db');
const { problemResponse } = require('./problemJson');

const PREFIX = 'togt_live_';
const RAW_LENGTH = 32;

function generateKey() {
  const bytes = crypto.randomBytes(24);
  // url-safe base32-ish from base64
  const raw = bytes.toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, RAW_LENGTH);
  // ensure exact RAW_LENGTH; if base64 trim left us short, pad with extra random
  let out = raw;
  while (out.length < RAW_LENGTH) {
    out += crypto.randomBytes(4).toString('hex')[0];
  }
  return PREFIX + out.slice(0, RAW_LENGTH);
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function keyPrefix(rawKey) {
  return rawKey.slice(0, 12); // togt_live_X
}

async function createKey({ userId, scopes, description }) {
  const raw = generateKey();
  const hash = hashKey(raw);
  const prefix = keyPrefix(raw);
  const r = await db.query(
    `INSERT INTO api_keys (user_id, key_hash, prefix, scopes, description)
     VALUES ($1, $2, $3, $4::text[], $5)
     RETURNING id, prefix, scopes, description, created_at`,
    [userId, hash, prefix, scopes, description || null]
  );
  return { ...r.rows[0], key: raw };
}

async function lookupKey(rawKey) {
  if (typeof rawKey !== 'string' || !rawKey.startsWith(PREFIX)) return null;
  const hash = hashKey(rawKey);
  const r = await db.query(
    `SELECT id, user_id, scopes, revoked_at FROM api_keys WHERE key_hash = $1`,
    [hash]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  if (row.revoked_at) return null;
  // best-effort last_used_at update (don't block the request)
  db.query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
  return { id: row.id, user_id: row.user_id, scopes: row.scopes };
}

async function revokeKey(keyId, userId) {
  const r = await db.query(
    `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
    [keyId, userId]
  );
  return r.rowCount > 0;
}

async function listKeys(userId) {
  const r = await db.query(
    `SELECT id, prefix, scopes, description, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

/**
 * Express middleware. Reads Authorization: Bearer <togt_live_*>, looks up the
 * key, attaches req.apiKey + req.user (with id and role from DB).
 */
function apiKeyMiddleware({ requiredScope } = {}) {
  return async (req, res, next) => {
    const auth = req.header('authorization') || '';
    const m = auth.match(/^Bearer\s+(togt_live_\S+)$/i);
    if (!m) {
      return problemResponse(res, {
        type: 'api_key_required',
        title: 'API key required',
        status: 401,
        detail: 'Send Authorization: Bearer togt_live_<key>',
        instance: req.originalUrl,
      });
    }
    const rawKey = m[1];
    const found = await lookupKey(rawKey);
    if (!found) {
      return problemResponse(res, {
        type: 'api_key_invalid',
        title: 'Invalid or revoked API key',
        status: 401,
        instance: req.originalUrl,
      });
    }
    if (requiredScope && !found.scopes.includes(requiredScope) && !found.scopes.includes('admin:full')) {
      return problemResponse(res, {
        type: 'api_key_insufficient_scope',
        title: 'API key missing required scope',
        status: 403,
        detail: `This endpoint requires the '${requiredScope}' scope.`,
        extensions: { required_scope: requiredScope, your_scopes: found.scopes },
        instance: req.originalUrl,
      });
    }

    // Load the user
    const userRow = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [found.user_id]
    );
    if (userRow.rows.length === 0) {
      return problemResponse(res, {
        type: 'api_key_user_not_found',
        title: 'API key references a deleted user',
        status: 401,
        instance: req.originalUrl,
      });
    }

    req.apiKey = found;
    req.user = userRow.rows[0];
    next();
  };
}

module.exports = {
  PREFIX,
  generateKey,
  hashKey,
  keyPrefix,
  createKey,
  lookupKey,
  revokeKey,
  listKeys,
  apiKeyMiddleware,
};
