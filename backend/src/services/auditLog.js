/**
 * Audit log service — write rows to the audit_log table whenever a
 * privileged action happens (authed route call, MCP tool invocation,
 * dispatcher delivery attempt, etc).
 *
 * Design choices worth knowing:
 *
 * 1. Audit writes use the pool directly, NOT the caller's transaction
 *    client. We WANT audit rows to survive even when the user's
 *    transaction rolls back — failed attempts and validation errors
 *    are exactly what an auditor needs to see. This is different from
 *    services/events.js (the webhook outbox), which deliberately
 *    couples to the caller's transaction.
 *
 * 2. Fire-and-forget from middleware: routes call recordAudit() without
 *    awaiting in the response path. A DB hiccup MUST NOT delay the
 *    response. Errors are logged. Callers that need confirmation
 *    (e.g. MCP tools that want audit-then-return) can await.
 *
 * 3. Action vocabulary: 'route.<METHOD>.<path>' for HTTP, 'mcp.<tool>'
 *    for MCP tools, 'webhook.delivery.<outcome>' for the dispatcher,
 *    'auth.<event>' for login/refresh/logout. Keep dotted, lowercase,
 *    stable — these are query keys.
 *
 * 4. Metadata MUST be sanitised by the caller. This module does NOT
 *    redact secrets, tokens, passwords, or PII. Callers attach only
 *    what is safe to surface to an auditor reading the row.
 *
 * 5. Actor presence is validated by the CHECK constraint on the table:
 *    actor_type='user' needs actor_user_id, actor_type='api_key' needs
 *    api_key_id, actor_type='system' needs neither. If the caller gets
 *    the shape wrong, the INSERT throws — that's the right behaviour;
 *    audit must not silently lose rows.
 */

const db = require('../config/db');

const ACTOR_TYPES = Object.freeze(['user', 'api_key', 'system']);

/**
 * Record an audit row.
 *
 * @param {object} opts
 * @param {object} opts.actor          { type: 'user'|'api_key'|'system', userId?: UUID, apiKeyId?: UUID }
 * @param {string} opts.action         dotted lowercase action key (e.g. 'mcp.create_match_request')
 * @param {object} [opts.resource]     { type: string, id: UUID }
 * @param {string} [opts.requestId]    UUID — request correlation ID
 * @param {string} [opts.ip]           caller IP (set by middleware from req.ip)
 * @param {number} [opts.statusCode]   HTTP status code or equivalent
 * @param {number} [opts.latencyMs]    elapsed ms
 * @param {object} [opts.metadata]     freeform JSONB — PII-free
 * @param {string} [opts.errorCode]    set only when the action failed
 * @returns {Promise<{id: string}>}    the inserted audit row id
 */
async function recordAudit({
  actor,
  action,
  resource,
  requestId,
  ip,
  statusCode,
  latencyMs,
  metadata = {},
  errorCode,
}) {
  if (!actor || !ACTOR_TYPES.includes(actor.type)) {
    throw new Error(`recordAudit: actor.type must be one of ${ACTOR_TYPES.join('|')}`);
  }
  if (actor.type === 'user' && !actor.userId) {
    throw new Error('recordAudit: actor.type=user requires actor.userId');
  }
  if (actor.type === 'api_key' && !actor.apiKeyId) {
    throw new Error('recordAudit: actor.type=api_key requires actor.apiKeyId');
  }
  if (!action || typeof action !== 'string') {
    throw new Error('recordAudit: action is required (dotted lowercase string)');
  }

  const { rows } = await db.query(
    `INSERT INTO audit_log (
       actor_type, actor_user_id, api_key_id,
       action,
       resource_type, resource_id,
       request_id, ip,
       status_code, latency_ms,
       metadata, error_code
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      actor.type,
      actor.type === 'user' ? actor.userId : null,
      actor.type === 'api_key' ? actor.apiKeyId : null,
      action,
      resource ? resource.type : null,
      resource ? resource.id : null,
      requestId || null,
      ip || null,
      statusCode == null ? null : statusCode,
      latencyMs == null ? null : latencyMs,
      metadata,
      errorCode || null,
    ]
  );
  return { id: rows[0].id };
}

/**
 * Fire-and-forget wrapper for middleware. Logs errors but never throws.
 *
 * Use this from Express response-finish handlers and the dispatcher tick
 * — anywhere you do NOT want an audit write to affect the user-visible
 * outcome. Callers that need the row id should call recordAudit() directly.
 */
function recordAuditFireAndForget(opts) {
  recordAudit(opts).catch(err => {
    // Don't crash the caller — but DO log so a failing audit pipeline
    // is visible in stderr / log aggregation.
    console.error('[auditLog] recordAudit failed:', err.message, {
      action: opts && opts.action,
      actor_type: opts && opts.actor && opts.actor.type,
    });
  });
}

module.exports = {
  recordAudit,
  recordAuditFireAndForget,
  ACTOR_TYPES,
};
