# Night of 2026-04-17 — Security Hardening

All 5 items Damian approved are complete, verified, and pushed to GitHub.

## What changed

| # | Fix | Files | Commit |
|---|---|---|---|
| 1 | JWT secrets fail fast in prod | `backend/src/config/env.js` | `043aba1` |
| 2 | Rate-limit auth endpoints | `backend/src/middleware/rateLimit.js` + `routes/auth.js` + `package.json` | `8ab3b16` |
| 3 | CORS allowlist via env | `backend/src/app.js` + `.env.example` | `81404b2` |
| 4 | Peach webhook HMAC verification | `backend/src/app.js` + `routes/payments.js` | `5326b35` |
| 5 | Mobile JWT -> expo-secure-store | `mobile/src/store/authSlice.js` + `package.json` | `896c7aa` |

Bonus: committed the in-progress Cloudinary image upload work first (`797a30d`) so nothing was lost.

## Verification done

- Backend boots cleanly with current `.env` (PID 2194 on port 3002, `/health` returns 200).
- Login rate-limiter: 10x 401 then 11th returns 429 (confirmed by curl loop).
- Webhook with `PEACH_WEBHOOK_SECRET=test_secret_xyz`: no-sig gives 401 Missing, bad-sig gives 401 Invalid, correct HMAC passes signature check and falls through to the existing Peach `GET /v1/checkouts/:id/payment` lookup. `.env` was reverted afterwards.
- Prod fail-fast: running env.js with `NODE_ENV=production` and missing required secrets exits with `FATAL: ... is required in production` and code 1.
- `/auth/register` and `/health` still 201 / 200 after all changes.

## What Damian needs to do

**Before next deploy:**
1. Set `CORS_ORIGINS` in `.env` if you want to gate browser clients (e.g. `CORS_ORIGINS=https://togt.co.za`). Leave empty for now if mobile is the only client.
2. Once Peach confirms the webhook signature scheme (header name + encoding), set `PEACH_WEBHOOK_SECRET` in `.env`. The current code assumes HMAC-SHA256 over raw body, base64-encoded, in `X-Signature`. Peach support may use a different header name — confirm with the CEO Damian met.
3. Existing mobile users will be logged out once when they upgrade (the AsyncStorage `@togt_auth` key is orphaned; new flow writes to SecureStore key `togt_auth`). Expected, one-time.

**GitHub repo state:**
- Remote: `git@github.com:DamianOost/Togt.git` (SSH, using `~/.ssh/id_ed25519_github`)
- Branches on remote: `main` (new, pointing at HEAD) and `claude/review-vision-screenshot-CHDSn` (working branch). Consider making `main` the default branch in the GitHub UI (Settings -> General -> Default branch).
- `gh` CLI token is stale -- re-auth with `gh auth login -h github.com` if you want to use it.

## Known follow-ups (not tonight)

- Zero automated tests. QA_REPORT.md documents manual coverage. A smoke-test suite (Jest + supertest) is the highest-leverage next investment.
- Refresh tokens are still stateless with no revocation. Stolen refresh token = 7 day blast radius. Add a DB-backed refresh_tokens table keyed by jti, with a revoked_at column, and check on every refresh.
- `scheduled_at` has no future-only constraint — possible to book for 1990. One-line schema change.
- `users.push_token` isn't cleared on logout — old device keeps receiving notifications.
- Smile ID KYC creds are still placeholder (see QA_REPORT.md `isDemo()`). Real credentials needed before launch.

Plan file: `docs/superpowers/plans/2026-04-17-security-hardening.md`
