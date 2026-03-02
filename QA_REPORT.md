# Togt Backend QA Report
**Date:** 2026-03-02  
**Tester:** QA Sub-agent  
**Backend:** http://localhost:3002 (PostgreSQL `togt` on unix socket)

---

## Summary

| Category | Count |
|---|---|
| ✅ PASS | 22 |
| ❌ FAIL (fixed) | 4 |
| ⚠️ Issues found (not fixed) | 3 |
| 🔒 Security issues | 2 |

**Full booking flow: UNBLOCKED** ✅

---

## Endpoint Test Results

### Auth (`/auth/*` and `/api/auth/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `POST /api/auth/register` (customer) | ✅ PASS | Returns user + tokens, no password_hash |
| `POST /api/auth/register` (labourer) | ✅ PASS | Creates labourer_profiles row automatically |
| `POST /api/auth/register` (duplicate email/phone) | ✅ PASS | Returns 409 |
| `POST /api/auth/register` (missing fields) | ✅ PASS | Returns 400 |
| `POST /api/auth/login` | ✅ PASS | Returns user + accessToken + refreshToken |
| `POST /api/auth/login` (bad credentials) | ✅ PASS | Returns 401 |
| `POST /api/auth/refresh` | ✅ PASS | Returns new tokens |

### Labourers (`/api/labourers/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/labourers` | ✅ PASS | Returns all available labourers |
| `GET /api/labourers?lat=&lng=` | ✅ PASS | Returns labourers sorted by distance |
| `GET /api/labourers?skill=` | ✅ PASS | Filters by skill (case-insensitive) |
| `GET /api/labourers/:id` | ✅ PASS | Returns profile + recent reviews |
| `PUT /api/labourers/availability` | ✅ PASS | Labourer-only, requires auth |
| `PUT /api/labourers/location` | ✅ PASS | Updates GPS coords |
| `PUT /api/labourers/profile` | ✅ PASS | Updates bio, rate, skills |
| `GET /api/labourers/profile` | ✅ PASS | Own profile (labourer only) |

### Bookings (`/api/bookings/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `POST /api/bookings` | ✅ PASS | Customer-only, all validations work |
| `GET /api/bookings` | ✅ PASS (fixed) | **Was 404 — now fixed** |
| `GET /api/bookings/my` | ✅ PASS | Existing route, still works |
| `GET /api/bookings/:id` | ✅ PASS | Access control enforced |
| `PATCH /api/bookings/:id/status` | ✅ PASS (fixed) | **Was 404 — now fixed** |
| `PUT /api/bookings/:id/accept` | ✅ PASS | Labourer only |
| `PUT /api/bookings/:id/decline` | ✅ PASS | Labourer only |
| `PUT /api/bookings/:id/start` | ✅ PASS | Labourer only |
| `PUT /api/bookings/:id/complete` | ✅ PASS | `completed_at` now set correctly (fixed) |
| `PUT /api/bookings/:id/cancel` | ✅ PASS | Customer only, `cancelled_by` now set (fixed) |

### Ratings (`/api/ratings/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `POST /api/ratings` (customer→labourer) | ✅ PASS | Updates `rating_avg` and `rating_count` |
| `POST /api/ratings` (labourer→customer) | ✅ PASS | Doesn't update labourer avg (correct) |
| `POST /api/ratings` (duplicate) | ✅ PASS | Returns 409 |
| `POST /api/ratings` (invalid score) | ✅ PASS | Returns 400 |
| `GET /api/ratings/labourer/:id` | ✅ PASS | Public endpoint |

### Earnings (`/api/earnings`)

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/earnings` | ✅ PASS | Requires labourer auth, returns today/week/month/all_time + daily breakdown |

### Messages (`/api/messages/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/messages/:bookingId` | ✅ PASS | Auth required, access control enforced |
| `POST /api/messages/:bookingId` | ✅ PASS | Sends message, triggers socket.io broadcast |

### Services (`/api/services/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/services` | ✅ PASS | Public, filterable by `?skill=` |
| `GET /api/services/labourer/:id` | ✅ PASS | Public |
| `GET /api/services/my` | ✅ PASS | Labourer auth required |
| `POST /api/services` | ✅ PASS | Creates service listing |
| `PUT /api/services/:id` | ✅ PASS | Ownership check enforced |
| `DELETE /api/services/:id` | ✅ PASS | Soft-deletes (sets is_active=false) |

### Payments (`/api/payments/*`)

| Endpoint | Result | Notes |
|---|---|---|
| `POST /api/payments/initiate` | ⚠️ NOT TESTED | Requires Peach Payments credentials (dev_placeholder in .env) |
| `POST /api/payments/webhook` | ⚠️ NOT TESTED | Requires Peach integration |
| `GET /api/payments/status/:bookingId` | ✅ PASS (auth) | Returns 401 without token correctly |

---

## Bugs Found and Fixed

### 🐛 Bug 1: `completed_at` never set on booking completion
**File:** `src/routes/bookings.js` — `transition()` function  
**Problem:** `UPDATE bookings SET status = $1 WHERE id = $2` — never set `completed_at`  
**Impact:** `GET /api/earnings` always returns 0 (queries filter by `completed_at`)  
**Fix:** Updated query to include `completed_at = NOW()` when `toStatus === 'completed'`  
**Status:** ✅ Fixed

### 🐛 Bug 2: `cancelled_by` never set on cancellation
**File:** `src/routes/bookings.js` — `transition()` function  
**Problem:** Cancellation didn't record which user cancelled  
**Fix:** Added `cancelled_by = $3` with `req.user.id` when `toStatus === 'cancelled'`  
**Status:** ✅ Fixed

### 🐛 Bug 3: `GET /bookings` returns 404 (no bare list route)
**File:** `src/routes/bookings.js`  
**Problem:** Only `GET /bookings/my` existed; `GET /bookings` returned 404  
**Impact:** Frontend apps calling `GET /api/bookings` would fail  
**Fix:** Added `router.get('/')` as an alias matching the same logic as `/my`  
**Status:** ✅ Fixed

### 🐛 Bug 4: `PATCH /bookings/:id/status` returns 404
**File:** `src/routes/bookings.js`  
**Problem:** All status transitions used `PUT /:id/accept|decline|start|complete|cancel`. No unified PATCH endpoint.  
**Impact:** Frontend/mobile clients expecting REST-style `PATCH /status` would fail  
**Fix:** Added `router.patch('/:id/status')` that maps `{status}` to the correct transition with role/state validation  
**Status:** ✅ Fixed

### 🐛 Bug 5 (infrastructure): Server running old code
**Problem:** Server was managed by launchd (`com.togt.backend`) but was started before newer routes (earnings, messages, services) were added to `app.js`  
**Fix:** Reloaded launchd service: `launchctl unload/load ~/Library/LaunchAgents/com.togt.backend.plist`  
**Status:** ✅ Fixed (server now serves all routes)

### 🐛 Bug 6: `POST /api/auth/register` and `POST /api/auth/login` only at `/auth/*`
**File:** `src/app.js`  
**Problem:** Auth routes were mounted at `/auth` but not `/api/auth`, inconsistent with all other routes which are at `/api/*`  
**Fix:** Added `app.use('/api/auth', authRoutes)` to mount at both paths  
**Status:** ✅ Fixed

---

## Issues Found (Need Frontend/Product Decision)

### ⚠️ Issue 1: `total_amount` is always 0 for new labourers
New labourers are registered with `hourly_rate = 0`. Until they set their rate via `PUT /api/labourers/profile`, all bookings will have `total_amount = 0`. Earnings will always show 0.  
**Recommendation:** Prompt labourer to complete profile (rate, bio, skills) on first login. Consider making `hourly_rate` required at registration, or requiring it before appearing in search results.

### ⚠️ Issue 2: Phone numbers exposed in public labourer list
`GET /api/labourers` returns `phone` for every labourer — no auth required.  
**Recommendation:** May be intentional for on-the-spot contact. If not, move phone behind auth or hide it from list view, only show on booking confirmation.

### ⚠️ Issue 3: `/api/auth` inconsistency (legacy routes)
`/auth/login` and `/api/auth/login` both work, but `/services`, `/earnings`, `/messages` have no legacy path (only `/api/*`). Minor inconsistency.  
**Recommendation:** The `/api/*` prefix should be standard going forward. Legacy `/auth`, `/bookings` etc. can stay for backward compat but no new routes should be added without `/api/`.

---

## Security Audit

| Check | Result |
|---|---|
| `password_hash` not in any API response | ✅ PASS |
| All protected routes require auth | ✅ PASS |
| SQL injection risk (parameterized queries) | ✅ PASS — all queries use `$1, $2` params |
| CORS configured | ✅ PASS — wildcard `*` (fine for mobile RN app) |
| JWT secret is non-default | ✅ PASS — using custom secret in `.env` |
| JWT expires in 15m (access) / 7d (refresh) | ✅ PASS |
| Booking access control (only parties can view/modify) | ✅ PASS |
| Socket.io namespaces require auth | ✅ PASS — JWT middleware on both `/location` and `/chat` |
| **Rate limiting** | ❌ MISSING — `express-rate-limit` not installed |
| **Peach webhook verification** | ⚠️ PARTIAL — verifies with Peach API but no HMAC signature check |

### 🔒 Security Recommendation 1: Add rate limiting
```bash
npm install express-rate-limit
```
Then in `app.js`:
```js
const rateLimit = require('express-rate-limit');
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20 }));
app.use('/api/', rateLimit({ windowMs: 60*1000, max: 100 }));
```

### 🔒 Security Recommendation 2: Peach webhook HMAC validation
The webhook at `POST /api/payments/webhook` currently verifies by calling back to Peach, but doesn't validate a signature header. If Peach provides an HMAC signature, it should be verified before processing.

---

## Recommendations

1. **Profile completion flow** — New labourers need to set `hourly_rate` before they should accept bookings. Consider blocking booking acceptance if `hourly_rate = 0`.

2. **Add rate limiting** (security, see above)

3. **Set `completed_at` in DB default or trigger** — Rely on application layer is fragile. Consider a `CHECK` constraint or trigger as a safety net (though app layer is now fixed).

4. **Booking list pagination** — `GET /api/bookings` returns ALL bookings for a user. Add `?limit=` and `?offset=` for users with many bookings.

5. **`/api/auth/refresh` should rotate refresh tokens** — Currently issues a new access token but the old refresh token remains valid. True rotation invalidates the old one.

6. **Push token endpoint security** — `POST /auth/push-token` is correctly behind auth, but push tokens stored in `users` table alongside other data. Consider a separate `push_tokens` table (already exists in DB!) — the migration created it but the code still writes to `users.push_token`.

7. **Services table has no pricing link to booking** — When a booking is created, `total_amount` is calculated from `labourer_profiles.hourly_rate`. But if a labourer has a specific service with `rate_per_hour`, that rate isn't used. Consider linking bookings to a specific service.

---

## Full Booking Flow Status

| Step | Endpoint | Status |
|---|---|---|
| 1. Register customer | `POST /api/auth/register` | ✅ |
| 2. Register labourer | `POST /api/auth/register` | ✅ |
| 3. Labourer sets availability | `PUT /api/labourers/availability` | ✅ |
| 4. Labourer sets location | `PUT /api/labourers/location` | ✅ |
| 5. Customer finds labourers | `GET /api/labourers?lat=&lng=` | ✅ |
| 6. Customer creates booking | `POST /api/bookings` | ✅ |
| 7. Labourer accepts | `PATCH /api/bookings/:id/status` | ✅ |
| 8. Labourer starts job | `PATCH /api/bookings/:id/status` | ✅ |
| 9. Labourer completes job | `PATCH /api/bookings/:id/status` | ✅ |
| 10. Customer rates labourer | `POST /api/ratings` | ✅ |
| 11. Rating average updates | `GET /api/labourers/:id` | ✅ |
| 12. Labourer views earnings | `GET /api/earnings` | ✅ |

**The full booking flow is working end-to-end.** 🎉
