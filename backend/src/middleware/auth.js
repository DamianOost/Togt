const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { problemResponse } = require('../lib/problemJson');

// Auth boundary returns RFC 9457 problem+json so agent integrators get
// a stable machine-readable error type. The mobile app v1 reads
// `body.error` for the human title — problemResponse populates that
// field for backwards-compat.
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return problemResponse(res, {
      type: 'auth_missing_token',
      title: 'No token provided',
      status: 401,
      detail: 'Send Authorization: Bearer <jwt> with the request.',
      instance: req.originalUrl,
    });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch {
    return problemResponse(res, {
      type: 'auth_invalid_token',
      title: 'Invalid or expired token',
      status: 401,
      detail: 'JWT failed verification. Refresh via /auth/refresh or re-authenticate.',
      instance: req.originalUrl,
    });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return problemResponse(res, {
        type: 'auth_forbidden_role',
        title: `Requires ${role} role`,
        status: 403,
        detail: `This endpoint is restricted to users with role '${role}'. Caller has role '${req.user.role}'.`,
        instance: req.originalUrl,
      });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
