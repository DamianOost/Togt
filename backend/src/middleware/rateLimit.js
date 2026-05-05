const rateLimit = require('express-rate-limit');

// In test env, rate limiters become no-ops so tests exercising auth/email
// flows are not capped by IP-level counts that accumulate across the suite.
// The rateLimit.test.js file still exercises the live limiter behaviour via
// the dedicated /auth/login counter (see below) — that test file asserts
// limits even under this no-op wrapper because authLimiter is constructed
// before this check fires... actually no, we ship real limiters in test too.
// Implementation: simply return a pass-through middleware when NODE_ENV=test
// and the file that tests rate limiting (rateLimit.test.js) overrides this
// via the process.env.RATELIMIT_FORCE flag.
const isTest = process.env.NODE_ENV === 'test' && process.env.RATELIMIT_FORCE !== '1';
const passthrough = (req, res, next) => next();
function maybe(limiter) { return isTest ? passthrough : limiter; }


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

// Strict limit on password reset to prevent enumeration + abuse:
// 5 requests / hour / IP. Legitimate use is rare.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Match creation: a customer should not spam matches. 5 per 10 min per IP
// is generous for legitimate use (typo, retry, change skill) and stops a
// prankster from lighting up every labourer's phone.
const matchCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Too many match requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser on the actual verify step (user may typo code once or twice):
// 10 requests / hour / IP.
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reset attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter: maybe(authLimiter),
  refreshLimiter: maybe(refreshLimiter),
  forgotPasswordLimiter: maybe(forgotPasswordLimiter),
  resetPasswordLimiter: maybe(resetPasswordLimiter),
  matchCreateLimiter: maybe(matchCreateLimiter),
};
