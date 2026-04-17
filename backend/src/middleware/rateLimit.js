const rateLimit = require('express-rate-limit');

// Strict limit for credential-checking endpoints: 10 requests per 15 min per IP.
// Protects /auth/login + /auth/register from credential stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser limit for token refresh: 30 per 15 min per IP.
// Legitimate clients refresh occasionally; attackers with a stolen refresh
// token would still be limited to 30 access tokens per window per IP.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, refreshLimiter };
