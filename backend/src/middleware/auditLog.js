/**
 * Express middleware: emit an audit_log row on every authenticated
 * request, captured at response-finish time so the row reflects the
 * actual outcome (status code, latency).
 *
 * Mounting order: AFTER auth + apiKey auth middleware so that req.user
 * (for JWT) or req.apiKey (for scoped key auth) is populated. Mount
 * BEFORE the route handlers, since middleware ordering only affects
 * the `next()` chain — the response-finish callback runs after the
 * handler regardless.
 *
 * Skip rules:
 *   - Healthchecks (/health, /health/deep) — too noisy, no audit value.
 *   - .well-known/* — agent-discovery reads, no privileged action.
 *   - GET /openapi.json — same.
 *
 * The middleware is best-effort. It never blocks the response and never
 * throws past `next()` — failures go to stderr via recordAuditFireAndForget.
 */

const { recordAuditFireAndForget } = require('../services/auditLog');

const DEFAULT_SKIP_PATHS = new Set([
  '/health',
  '/health/deep',
  '/openapi.json',
  '/.well-known/openapi.json',
  '/.well-known/agents.json',
]);

function buildActionKey(req) {
  // Prefer the matched route pattern (req.route.path includes :params) so
  // similar requests aggregate cleanly. Fall back to the original URL.
  const method = (req.method || 'unknown').toLowerCase();
  const base = req.baseUrl || '';
  const routePath = req.route && req.route.path ? req.route.path : (req.path || req.url || '');
  return `route.${method}.${base}${routePath}`;
}

function resolveActor(req) {
  // Scoped API key (Stripe-style auth) takes precedence over JWT — if a
  // request carried BOTH, the API key is the "client" identity that
  // matters for audit purposes (it represents an agent, not a human).
  if (req.apiKey && req.apiKey.id) {
    return { type: 'api_key', apiKeyId: req.apiKey.id };
  }
  if (req.user && req.user.id) {
    return { type: 'user', userId: req.user.id };
  }
  return null; // unauthenticated — skip
}

function auditLogMiddleware(opts = {}) {
  const skipPaths = opts.skipPaths instanceof Set
    ? opts.skipPaths
    : DEFAULT_SKIP_PATHS;

  // Hard-skip under NODE_ENV=test. Tests use truncateAll on each beforeEach;
  // fire-and-forget INSERTs into audit_log racing with TRUNCATE ... CASCADE
  // on users (which cascades to audit_log via FK) caused deadlocks. The
  // existing dispatcher follows the same pattern — background workers
  // and write-on-response middleware do not run under test.
  const isTest = process.env.NODE_ENV === 'test';

  return function audit(req, res, next) {
    if (isTest) return next();
    if (skipPaths.has(req.path)) return next();

    const start = Date.now();
    const requestId = req.headers['x-request-id'] || null;

    res.on('finish', () => {
      const actor = resolveActor(req);
      if (!actor) return; // No audited identity — skip.

      const latencyMs = Date.now() - start;
      const statusCode = res.statusCode;
      // 4xx/5xx capture an errorCode of <status>_<problem-type-if-any>.
      let errorCode = null;
      if (statusCode >= 400) {
        const problemType = res.getHeader('x-error-type') || res.locals.errorType;
        errorCode = problemType ? `${statusCode}_${problemType}` : String(statusCode);
      }

      recordAuditFireAndForget({
        actor,
        action: buildActionKey(req),
        requestId,
        ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
        statusCode,
        latencyMs,
        metadata: {
          method: req.method,
          path: req.originalUrl || req.url,
        },
        errorCode,
      });
    });

    next();
  };
}

module.exports = {
  auditLogMiddleware,
  buildActionKey,    // exported for unit tests
  resolveActor,      // exported for unit tests
  DEFAULT_SKIP_PATHS,
};
