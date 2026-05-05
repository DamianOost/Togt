/**
 * RFC 9457 Problem Details for HTTP APIs.
 *
 * https://datatracker.ietf.org/doc/html/rfc9457
 *
 * Goal: structured, machine-readable errors that an LLM agent can pattern-match
 * on `type` and recover from without reading prose. Stable type URIs survive
 * across API versions; the agent's training data may carry them forward.
 *
 * Usage:
 *   - Throw a ProblemError(...) from inside a route handler — the global
 *     errorHandler catches it and emits the correct JSON.
 *   - OR call problemResponse(res, ...) directly inside the handler.
 *
 * Backwards compat: every response also includes a top-level `error` field
 * with the title, so existing clients (mobile app v1) that read `res.body.error`
 * continue to work. The new structured fields layer on top.
 */

const TYPE_BASE = process.env.API_PUBLIC_BASE_URL || 'https://api.togt.co.za';

function typeUri(slug) {
  return `${TYPE_BASE}/errors/${slug}`;
}

class ProblemError extends Error {
  /**
   * @param {{
   *   type: string,           // slug, e.g. 'scheduled_at_in_past' (becomes a URI)
   *   title: string,          // short human-readable summary
   *   status: number,         // HTTP status (400, 401, 403, 404, 409, 422, 500)
   *   detail?: string,        // expanded explanation, MAY include specifics
   *   extensions?: object,    // domain-specific machine-readable fields
   * }} opts
   */
  constructor({ type, title, status, detail, extensions }) {
    super(title);
    this.problem = {
      type: typeUri(type),
      title,
      status,
      detail: detail || null,
      ...(extensions ? { extensions } : {}),
    };
    this.status = status;
  }
}

function problemResponse(res, { type, title, status, detail, extensions, instance }) {
  const body = {
    type: typeUri(type),
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(instance ? { instance } : {}),
    ...(extensions ? { extensions } : {}),
    error: title, // backwards-compat with existing mobile clients
  };
  return res
    .status(status)
    .type('application/problem+json')
    .json(body);
}

function problemHandler(err, req, res, next) {
  if (err instanceof ProblemError) {
    const body = {
      ...err.problem,
      instance: req.originalUrl,
      error: err.problem.title, // backwards-compat
    };
    return res
      .status(err.problem.status)
      .type('application/problem+json')
      .json(body);
  }

  // Unexpected error — log + emit a 500 problem
  console.error(err.stack || err);
  const body = {
    type: typeUri('internal_server_error'),
    title: 'Internal server error',
    status: 500,
    detail: process.env.NODE_ENV === 'production' ? null : (err.message || String(err)),
    instance: req.originalUrl,
    error: 'Internal server error',
  };
  return res.status(500).type('application/problem+json').json(body);
}

module.exports = {
  ProblemError,
  problemResponse,
  problemHandler,
  typeUri,
};
