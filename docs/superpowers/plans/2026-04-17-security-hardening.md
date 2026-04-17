# Togt Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, single session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five pre-launch security risks + push full codebase to GitHub remote.

**Architecture:** Surgical edits to five files, one new middleware file, one new mobile dep. Each fix is an independent commit. Verification via curl + boot tests (no test framework exists in this repo — adding one is out of scope for tonight).

**Tech Stack:** Node/Express, Socket.io, JWT, PostgreSQL, React Native (Expo SDK 54), expo-secure-store.

**Deviation from TDD:** This codebase has zero tests and no test harness. Setting up Jest for a hardening pass would balloon scope. Each task instead defines manual verification commands with expected output. Document as a follow-up: add a test harness next session.

---

## State snapshot (pre-work)

- Branch: `claude/review-vision-screenshot-CHDSn` (no `main` exists anywhere)
- Remote: `origin https://github.com/DamianOost/Togt.git` — exists, but 7 commits behind local HEAD (remote HEAD is `5642038`, local HEAD is `ba1baf8`)
- Uncommitted: 6 modified + 3 untracked files — all part of an in-progress **Cloudinary image upload feature** (profile photos). Commit cleanly before hardening work.
- `gh` CLI auth token is stale — direct `git push` with HTTPS cached creds may still work; fallback is switch remote to SSH.
- `.env` is correctly gitignored and never committed. Verified.
- Secret scan of tracked files: all hits were false positives (PNG base64 placeholder, normal code).

---

## Task 0: Commit pending image-upload work

**Files:**
- Existing (modified): `backend/package.json`, `backend/package-lock.json`, `backend/src/app.js`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/src/screens/labourer/ProfileSetupScreen.js`
- Existing (untracked): `backend/src/config/cloudinary.js`, `backend/src/routes/upload.js`, `mobile/src/services/imageUpload.js`

- [ ] **Step 0.1:** Review full diff to confirm nothing sensitive
  - Run: `ssh george 'cd ~/.openclaw/workspace/Togt && git diff' | head -200`
- [ ] **Step 0.2:** Stage and commit
  - `git add -A && git commit -m "feat: Cloudinary profile image upload (backend + mobile)"`

---

## Task 1: Harden JWT fallback

**Files:**
- Modify: `backend/src/config/env.js`

**Current risk:** `jwtSecret` falls back to literal `'dev_jwt_secret'` if `JWT_SECRET` env var is missing. A misconfigured prod deploy silently runs with a known-weak secret — full auth bypass.

- [ ] **Step 1.1:** Rewrite env.js to fail hard in production, warn in dev

```js
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, devDefault) {
  const val = process.env[name];
  if (val && val.length > 0) return val;
  if (isProd) {
    console.error(`FATAL: ${name} is required in production`);
    process.exit(1);
  }
  console.warn(`WARNING: ${name} not set — using insecure dev default. DO NOT ship to prod.`);
  return devDefault;
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/togt'),
  jwtSecret: required('JWT_SECRET', 'dev_jwt_secret_do_not_use_in_prod'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_do_not_use_in_prod'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  peach: {
    entityId: process.env.PEACH_ENTITY_ID,
    accessToken: process.env.PEACH_ACCESS_TOKEN,
    baseUrl: process.env.PEACH_BASE_URL || 'https://eu-test.oppwa.com',
    webhookSecret: process.env.PEACH_WEBHOOK_SECRET,
  },
};
```

- [ ] **Step 1.2:** Verify dev boot still works
  - `cd backend && node -e "require('./src/config/env')"` → expect no crash, only warnings if vars missing
- [ ] **Step 1.3:** Verify prod-mode fails fast on missing secret
  - `NODE_ENV=production JWT_SECRET= node -e "require('./src/config/env')"` → expect `FATAL: JWT_SECRET is required in production` + exit 1
- [ ] **Step 1.4:** Commit
  - `git commit -am "security: fail fast on missing secrets in production"`

---

## Task 2: Rate limit auth endpoints

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Create: `backend/src/middleware/rateLimit.js`
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 2.1:** Install dep
  - `cd backend && npm install express-rate-limit`
- [ ] **Step 2.2:** Create `backend/src/middleware/rateLimit.js`

```js
const rateLimit = require('express-rate-limit');

// Strict limit for credential endpoints: 10 requests / 15 min / IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser limit for token refresh: 30 / 15 min / IP
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, refreshLimiter };
```

- [ ] **Step 2.3:** Apply to routes in `backend/src/routes/auth.js`
  - Add `const { authLimiter, refreshLimiter } = require('../middleware/rateLimit');` at top
  - Change `router.post('/register', async ...)` → `router.post('/register', authLimiter, async ...)`
  - Change `router.post('/login', ...)` → `router.post('/login', authLimiter, ...)`
  - Change `router.post('/refresh', ...)` → `router.post('/refresh', refreshLimiter, ...)`
- [ ] **Step 2.4:** Verify — hit /login 11 times fast, expect 429 on the 11th
  - `for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3002/auth/login -H "Content-Type: application/json" -d '{"email":"x@x","password":"x"}'; done`
  - Expect: 10× `401`, then `429`
- [ ] **Step 2.5:** Commit
  - `git add -A && git commit -m "security: rate-limit auth endpoints (express-rate-limit)"`

---

## Task 3: CORS allowlist

**Files:**
- Modify: `backend/src/app.js`

**Current risk:** `cors()` with no options = `*` allow-any; same for Socket.io. Any malicious site could make authed cross-origin calls via a victim's browser if they had a cookie/token.

For a mobile-only API this is a smaller risk (mobile apps don't enforce CORS), but browsers do — e.g. Expo web preview, dashboard, etc. Lock it down now so future browser clients are gated.

- [ ] **Step 3.1:** Replace CORS wiring in `backend/src/app.js`

Before:
```js
app.use(cors());
```

After:
```js
const { corsOrigins, nodeEnv } = require('./config/env');
const corsOptions = corsOrigins.length
  ? { origin: corsOrigins, credentials: true }
  : nodeEnv === 'production