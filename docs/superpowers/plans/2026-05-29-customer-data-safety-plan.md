# Customer Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Every task below starts with an implementation subagent and ends with an independent review subagent. Steps use checkbox (`- [ ]`) syntax for tracking. Damian has requested autonomous execution with auto approval for this build.

**Goal:** Implement the customer-data safety design before real TOGT customer/labourer onboarding: minimize KYC storage, prevent excess phone/address/location exposure, sanitize webhooks/MCP payloads, add audit points, and create POPIA-aligned internal docs.

**Spec:** `docs/superpowers/specs/2026-05-29-customer-data-safety-design.md`

**Recommended execution branch:** `feat/customer-data-safety`

**Base branch:** Use `origin/feat/smoke-tests` at execution start unless PR #1 and PR #2 have already merged into `main`. Current reviewed remote head is `origin/feat/smoke-tests` at `fd5d4a817d87`, which contains the audit-log primitive and smoke harness stack. Note the stack dependency in the PR body if PR #1/#2 are still open.

**Execution mode:** Autonomous, subagent-driven, auto-approved for local repository work.

**Stop conditions:** Do not execute live external writes, production credential changes, public/customer/vendor messages, destructive production data changes, or real customer-data processing. If discovered, write a follow-up runbook item and continue local-safe tasks.

**Task test discipline:** Each task writes only the failing tests for the surface it is about to implement, then ends with focused tests for that surface and `cd backend && npm test` before the next task starts. If a task is mobile-only, still run `cd backend && npm test` to preserve the backend baseline, then run the relevant Expo bundle/config check described in that task. Do not add a broad batch of future failing tests that keeps the suite red across multiple tasks.

**No auto-merge:** Subagents may create, push, and open the PR. They must not merge it. Damian reviews and merges manually.

---

## File Structure

**New files:**

- `backend/src/lib/privacy.js` - serializers, reveal rules, redaction helpers, ID blind-index helpers
- `backend/src/lib/privacyAudit.js` - audit adapter wrapping the audit primitive when present
- `backend/src/db/migrations/016_customer_data_safety.sql` - additive privacy columns and indexes
- `backend/tests/privacySerializers.test.js`
- `backend/tests/privacyKyc.test.js`
- `backend/tests/privacyBookingExposure.test.js`
- `backend/tests/privacyMatchExposure.test.js`
- `backend/tests/privacyWebhookPayloads.test.js`
- `docs/privacy/popia-data-map.md`
- `docs/privacy/privacy-notice-draft.md`
- `docs/privacy/operator-register.md`
- `docs/privacy/security-compromise-runbook.md`

**Modified files:**

- `backend/src/config/env.js`
- `backend/.env.example`
- `backend/src/routes/auth.js`
- `backend/src/routes/labourers.js`
- `backend/src/routes/bookings.js`
- `backend/src/routes/match.js`
- `backend/src/routes/kyc.js`
- `backend/src/services/matcher.js`
- `backend/src/services/events.js`
- `backend/src/services/webhookDispatcher.js`
- `backend/src/openapi.js`
- `backend/mcp-server/tools.js`
- `mobile/app.json` or app config equivalent
- `mobile/src/services/api.js`
- `mobile/src/screens/labourer/ProfileSetupScreen.js`
- `mobile/src/screens/shared/KYCScreen.js`
- `mobile/src/components/IncomingMatchModal.js`
- `mobile/src/screens/customer/HomeMapScreen.js`
- `mobile/src/screens/customer/ActiveBookingScreen.js`
- `mobile/src/screens/labourer/ActiveJobScreen.js`
- `mobile/src/screens/labourer/DashboardScreen.js`
- `mobile/src/screens/labourer/JobRequestsScreen.js`
- `docs/superpowers/plans/2026-05-27-production-deployment-plan.md` - add new production secret to the deployment checklist if this branch lands before first deploy

---

## Authority Matrix

| Work | Tier | Auto approval |
|---|---:|---|
| Local code/test/doc edits | L1 | Yes |
| Local DB migrations against test/dev DB | L2 | Yes |
| Branch, commit, PR prep | L1 | Yes |
| Production deploy, Fly/Neon secret set, credential minting | L3 | No, excluded from this plan |
| Public privacy policy publication | L3 | No, draft only |
| Deleting/scrubbing real production PII | L3/L4 | No, follow-up runbook only |

---

## Task 0: Branch and Baseline

**Subagents:**

- Implementation: repo-prep subagent
- Review: git-hygiene subagent

**Files:** None expected.

- [ ] Check current branch and dirty state.

```powershell
git status --short --branch
git branch --show-current
```

- [ ] Fetch latest refs.

```powershell
git fetch --all --prune
```

- [ ] Choose base explicitly:
  - If PR #1 and #2 are merged: branch from updated `main`.
  - If PR #1 and/or #2 are still open: branch from `origin/feat/smoke-tests`.
  - Do not branch from `main` while PR #1/#2 are still open; this work depends on audit log and smoke-test baseline.

- [ ] Create execution branch from the chosen base.

```powershell
git checkout -b feat/customer-data-safety origin/feat/smoke-tests
```

- [ ] Validate all referenced mobile paths exist before any mobile task starts.

```powershell
$paths = @(
  'mobile/app.json',
  'mobile/src/services/api.js',
  'mobile/src/screens/labourer/ProfileSetupScreen.js',
  'mobile/src/screens/shared/KYCScreen.js',
  'mobile/src/components/IncomingMatchModal.js',
  'mobile/src/screens/customer/HomeMapScreen.js',
  'mobile/src/screens/customer/ActiveBookingScreen.js',
  'mobile/src/screens/labourer/ActiveJobScreen.js',
  'mobile/src/screens/labourer/JobRequestsScreen.js',
  'mobile/src/screens/labourer/DashboardScreen.js'
)
foreach ($p in $paths) {
  if (-not (Test-Path $p)) { throw "Missing referenced mobile path: $p" }
}
```

If a path is missing, stop that task and decide create-vs-rename from the current codebase before touching mobile files.

- [ ] Run baseline tests before changes.

```powershell
cd backend
npm test
```

**Acceptance:** Baseline is known, mobile paths are verified, and the branch base is explicit. If tests fail before changes, capture the failing suite and stop only if the failure blocks privacy work.

---

## Task 1: Write Privacy Test Harness and First Red-Bar Tests

**Subagents:**

- Implementation: backend-test subagent
- Review: security-test-reviewer subagent

**Files:**

- Create `backend/tests/privacySerializers.test.js`

- [ ] Add first red-bar tests for the privacy helper/serializer layer only:
  - public labourer serializer omits `phone`, `email`, `id_number`, exact `current_lat`, and exact `current_lng`.
  - booking serializer gates `customer_phone`, `labourer_phone`, full address, and exact coordinates by role and status.
  - audit redaction removes nested PII and secrets.
  - KYC status serializer returns `id_last4` and never raw `id_number`.

- [ ] Run only the new serializer tests and confirm they fail for the expected reasons.

```powershell
cd backend
npx jest tests/privacySerializers.test.js --runInBand
```

**Acceptance:** Failures are real serializer/helper failures, not harness/setup failures. Do not run the full suite while this intentional red bar exists; Task 2 must make the suite green before Task 3 starts.

---

## Task 2: Add Privacy Serializers and Redaction Helpers

**Subagents:**

- Implementation: backend-privacy-core subagent
- Review: backend-security-reviewer subagent

**Files:**

- Create `backend/src/lib/privacy.js`
- Modify relevant route imports only where needed for compile.

- [ ] Implement classification constants:
  - `CONTACT_REVEAL_STATUSES = new Set(['accepted', 'in_progress'])`
  - `LOCATION_REVEAL_STATUSES = new Set(['accepted', 'in_progress'])`

- [ ] Implement helpers:
  - `normalizeSouthAfricanId(value)`
  - `idLast4(value)`
  - `blindIndex(value, keyHex)`
  - `approxCoordinate(value)`
  - `approxLocation(lat, lng)`
  - `isOperationallyActive(status)`
  - `stripUndefined(obj)`
  - `redactForAudit(obj)`

- [ ] Implement serializers:
  - `serializeUserPrivate(user)`
  - `serializeLabourerPublic(row, opts)`
  - `serializeLabourerOwnProfile(row)`
  - `serializeBookingForUser(row, viewer)`
  - `serializeMatchForCustomer(row)`
  - `serializeMatchForLabourerCandidate(row)`
  - `serializeKycStatus(row)`
  - `sanitizeEventPayload(eventType, payload, opts)`

- [ ] Add unit tests for helper behavior:
  - approximate coordinates are rounded/blurry and never equal exact coordinates when precision would expose exact location.
  - redaction recursively removes `phone`, `email`, `id_number`, `address`, `location_lat`, `location_lng`, `current_lat`, `current_lng`, `accessToken`, `refreshToken`, `api_key`, `secret`.
  - state-gated booking serialization reveals exact address/phone only to the correct viewer in accepted/in-progress states.

**Acceptance:** Privacy serializer tests pass. Existing route tests may still fail until routes are wired.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacySerializers.test.js --runInBand
npm test
```

---

## Task 3: Add KYC Minimization Migration and Env

**Subagents:**

- Implementation: backend-db subagent
- Review: database-safety-reviewer subagent

**Files:**

- Create `backend/src/db/migrations/016_customer_data_safety.sql`
- Modify `backend/src/config/env.js`
- Modify `backend/.env.example`
- Modify `docs/superpowers/plans/2026-05-27-production-deployment-plan.md`

- [ ] Add migration columns:

```sql
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS id_last4 VARCHAR(4);
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS id_blind_index TEXT;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS provider_request_id TEXT;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS raw_input_discarded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_kyc_id_blind_index ON kyc_verifications(id_blind_index);
ALTER TABLE labourer_profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
```

- [ ] Do not drop legacy `id_number` columns in this task.

- [ ] Add `PII_BLIND_INDEX_KEY` to env config:
  - Required in `NODE_ENV=production`.
  - Dev/test fallback may warn but must be deterministic enough for tests.
  - Must be 64 lowercase hex chars.

- [ ] Update `.env.example`.

- [ ] Update the production deployment plan so first deploy includes `PII_BLIND_INDEX_KEY` in the secret-generation and `flyctl secrets set` steps.

- [ ] Run migration against test/dev DB.

```powershell
cd backend
npm run migrate
```

**Acceptance:** Migration is additive, idempotent, and does not erase existing data.

- [ ] Run task verification before moving on.

```powershell
cd backend
npm run migrate
npm test
```

---

## Task 4: Refactor KYC Routes to Stop Raw ID Storage

**Subagents:**

- Implementation: kyc-hardening subagent
- Review: privacy-review subagent

**Files:**

- Create `backend/tests/privacyKyc.test.js`
- Modify `backend/src/routes/kyc.js`
- Modify `mobile/src/screens/shared/KYCScreen.js`
- Modify `backend/src/openapi.js`

- [ ] Change KYC upsert logic:
  - Accept raw `idNumber` only in request memory.
  - Validate structure.
  - Send to provider if configured.
  - Store `id_last4`, `id_blind_index`, `provider`, `provider_request_id`, `status`, `verified_name`, `verified_at`, and `raw_input_discarded_at`.
  - Never write `id_number` in new paths.

- [ ] Change failure path to avoid storing raw invalid ID.

- [ ] Change `GET /api/kyc/status`:
  - Return `kyc_status`, latest `status`, `provider`, `id_last4`, `verified_at`, `created_at`.
  - Do not return `id_number`, DOB, sex, citizenship, or vendor raw payload.

- [ ] Change `POST /api/kyc/verify-id` response:
  - Return `verified`, `provider`, `poc_mode`, `name`, `id_last4`.
  - Do not return DOB, sex, citizenship unless a future legal/business need is approved.

- [ ] Keep `selfie-enroll` POC non-persistent.
  - Add explicit guard comments/tests that selfie payload is not stored.

- [ ] Mobile KYC screen:
  - Add a short collection notice before ID entry.
  - Display only status and last 4 digits after verification.

- [ ] Update OpenAPI schemas.

**Acceptance:** KYC tests pass and no KYC API response contains raw `idNumber`/`id_number`.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyKyc.test.js tests/kyc.test.js tests/kycVerifynow.test.js --runInBand
npm test
```

---

## Task 5: Remove ID Number from Labourer Profile Setup

**Subagents:**

- Implementation: mobile-profile subagent
- Review: mobile-privacy-reviewer subagent

**Files:**

- Modify `backend/src/routes/labourers.js`
- Modify `mobile/src/screens/labourer/ProfileSetupScreen.js`
- Modify `backend/src/openapi.js`

- [ ] Remove `id_number` from `PUT /api/labourers/profile` accepted payload.

- [ ] Remove `id_number` from own-profile response.

- [ ] Remove ID number field from `ProfileSetupScreen`.

- [ ] Route labourers who need verification to the KYC screen instead of profile setup.

- [ ] Add regression tests:
  - Sending `id_number` to profile update is ignored or rejected with a clear problem response.
  - Own labourer profile no longer returns raw `id_number`.

**Acceptance:** Labourer profile setup no longer handles ID numbers.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyKyc.test.js tests/privacySerializers.test.js --runInBand
npm test
```

---

## Task 6: Wire Serializers into Labourer APIs

**Subagents:**

- Implementation: labourer-api subagent
- Review: excessive-data-exposure subagent

**Files:**

- Modify `backend/src/routes/labourers.js`
- Modify `mobile/src/screens/customer/HomeMapScreen.js`

- [ ] `GET /api/labourers` must return `serializeLabourerPublic`.

- [ ] `GET /api/labourers/:id` must return `serializeLabourerPublic`.

- [ ] `GET /api/labourers/profile` must return `serializeLabourerOwnProfile`.

- [ ] Keep exact `current_lat/current_lng` internally for matching, but public response uses:
  - `approx_lat`
  - `approx_lng`
  - `location_precision: 'approximate'`
  - `distance_km` when available

- [ ] Update customer map to use approximate fields and label them as approximate only through UI affordance, not instructional copy.

**Acceptance:** Public labourer APIs no longer expose phone/email/raw exact location.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacySerializers.test.js --runInBand
npm test
```

---

## Task 7: Wire Serializers into Booking APIs

**Subagents:**

- Implementation: booking-api subagent
- Review: authorization-review subagent

**Files:**

- Create `backend/tests/privacyBookingExposure.test.js`
- Modify `backend/src/routes/bookings.js`
- Modify `mobile/src/screens/customer/ActiveBookingScreen.js`
- Modify `mobile/src/screens/labourer/ActiveJobScreen.js`
- Modify `mobile/src/screens/labourer/DashboardScreen.js`

- [ ] Replace raw `result.rows` responses with `serializeBookingForUser(row, req.user)`.

- [ ] Enforce reveal rules:
  - Customer sees own full address/location.
  - Labourer sees exact address/location only when status is `accepted` or `in_progress`.
  - Customer sees labourer phone only when status is `accepted` or `in_progress`.
  - Labourer sees customer phone only when status is `accepted` or `in_progress`.

- [ ] Update mobile screens to handle absent phone/address fields gracefully.

- [ ] Add tests for customer/labourer/pending/accepted/in_progress/completed/cancelled combinations.

**Acceptance:** Booking APIs are role-aware and state-aware; mobile does not crash when contact fields are intentionally absent.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyBookingExposure.test.js tests/bookings.test.js --runInBand
npm test
```

---

## Task 8: Minimize Match Request Pings and Candidate Views

**Subagents:**

- Implementation: matcher-privacy subagent
- Review: realtime-payload-reviewer subagent

**Files:**

- Create `backend/tests/privacyMatchExposure.test.js`
- Modify `backend/src/routes/match.js`
- Modify `backend/src/services/matcher.js`
- Modify `mobile/src/components/IncomingMatchModal.js`
- Modify `mobile/src/screens/labourer/JobRequestsScreen.js`

- [ ] Match create response to customer can include full customer-supplied address.

- [ ] Candidate labourer payload must include only:
  - `matchId`
  - `attemptId`
  - `skill_needed`
  - `scheduled_at`
  - `hours_est`
  - `hourly_rate`
  - approximate location fields or broad area label
  - timeout

- [ ] Candidate payload must not include:
  - exact `address`
  - exact `location_lat`
  - exact `location_lng`
  - customer phone/email
  - raw notes

- [ ] On successful accept, created booking detail may reveal exact address to the accepting labourer.

- [ ] Update push notification body to avoid full address.

**Acceptance:** Incoming match notification and socket payload are safe before acceptance.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyMatchExposure.test.js tests/match.test.js --runInBand
npm test
```

---

## Task 9: Sanitize Webhook and MCP Data Payloads

**Subagents:**

- Implementation: agent-api-privacy subagent
- Review: mcp-webhook-security-reviewer subagent

**Files:**

- Create `backend/tests/privacyWebhookPayloads.test.js`
- Modify `backend/src/services/events.js`
- Modify `backend/src/services/webhookDispatcher.js`
- Modify `backend/mcp-server/tools.js`
- Modify `backend/src/openapi.js`
- Modify `backend/src/agentsJson.js` if present/needed

- [ ] All event emission paths call `sanitizeEventPayload`.

- [ ] Webhook delivery payloads exclude phone, email, full address, exact coordinates, raw notes, raw ID, tokens, API keys, and secrets.

- [ ] MCP tools that read bookings/matches use the same serializers as REST routes.

- [ ] OpenAPI/agents metadata documents the minimized payload shape.

- [ ] Add tests:
  - booking lifecycle webhook payload does not include PII.
  - match lifecycle webhook payload does not include PII.
  - MCP booking/match read tools do not bypass REST reveal rules.

**Acceptance:** Agents can still book end-to-end, but default event/tool payloads are minimized.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyWebhookPayloads.test.js tests/eventsEmission.test.js tests/eventsLifecycle.test.js tests/webhookDispatcher.test.js tests/webhookMcpTools.test.js --runInBand
npm test
```

---

## Task 10: Add Privacy Audit Points

**Subagents:**

- Implementation: audit-integration subagent
- Review: audit-log-reviewer subagent

**Files:**

- Create `backend/src/lib/privacyAudit.js`
- Modify `backend/src/routes/kyc.js`
- Modify `backend/src/routes/bookings.js`
- Modify `backend/src/routes/labourers.js`
- Modify `backend/src/routes/match.js`
- Modify `backend/mcp-server/tools.js`

- [ ] If the audit-log helper from PR #1 exists, wrap it.

- [ ] If it does not exist, create a small adapter with a no-op fallback in test/dev and a clear TODO linked to PR #1.

- [ ] Audit events:
  - `kyc.verify_attempt`
  - `kyc.status_read`
  - `contact.phone_revealed`
  - `booking.exact_address_revealed`
  - `location.exact_location_revealed`
  - `mcp.booking_data_read`
  - `webhook.pii_adjacent_event_enqueued`

- [ ] Audit payloads must use `redactForAudit`.

- [ ] Add tests that audit payloads never contain raw PII.

**Acceptance:** Sensitive reveals are traceable without leaking the sensitive values into audit records.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/privacyKyc.test.js tests/privacyBookingExposure.test.js tests/privacyWebhookPayloads.test.js --runInBand
npm test
```

---

## Task 11: Add Retention and Stale-Location Controls

**Subagents:**

- Implementation: retention subagent
- Review: data-lifecycle-reviewer subagent

**Files:**

- Modify existing maintenance sweeper files if present.
- Modify `backend/src/sockets/location.js`
- Modify `backend/src/routes/labourers.js`
- Modify `backend/tests/maintenanceSweepers.test.js`
- Add a focused retention test file if clearer.

- [ ] On labourer location update, set `location_updated_at = NOW()`.

- [ ] Public labourer serializers hide approximate location if stale.

- [ ] Add or extend sweeper for:
  - expired password reset codes
  - old revoked refresh tokens
  - old webhook delivery payload redaction/purge
  - stale live location hiding

- [ ] Keep retention windows centralized in one module or clearly named constants.

**Acceptance:** Live location does not remain "live" indefinitely and old transient security records are cleaned up.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/maintenanceSweepers.test.js tests/privacySerializers.test.js --runInBand
npm test
```

---

## Task 12: Add Mobile Production Transport Guard

**Subagents:**

- Implementation: mobile-security subagent
- Review: mobile-release-reviewer subagent

**Files:**

- Modify `mobile/src/services/api.js`
- Modify `mobile/app.json` or app config if needed
- Add mobile unit/config test if the project has a suitable harness; otherwise document manual verification.

- [ ] Allow `http://` only in Expo Go/dev mode.

- [ ] In production/release config, throw a clear startup error if API base URL is not HTTPS.

- [ ] Ensure no logs print access tokens, refresh tokens, phone numbers, ID numbers, addresses, or exact coordinates.

- [ ] Confirm SecureStore remains the token store.

**Acceptance:** A production build cannot accidentally point real users at an HTTP API.

- [ ] Run task verification before moving on.

```powershell
cd backend
npm test
cd ../mobile
npm exec expo export --platform android --dev false --output-dir .expo-privacy-transport-check
```

---

## Task 13: Draft POPIA Operating Docs

**Subagents:**

- Implementation: privacy-docs subagent
- Review: compliance-doc-reviewer subagent

**Files:**

- Create `docs/privacy/popia-data-map.md`
- Create `docs/privacy/privacy-notice-draft.md`
- Create `docs/privacy/operator-register.md`
- Create `docs/privacy/security-compromise-runbook.md`

- [ ] Create the docs directory if it does not exist.

```powershell
New-Item -ItemType Directory -Force docs/privacy
```

- [ ] `popia-data-map.md` includes:
  - data categories
  - purpose
  - source
  - storage table/service
  - exposure surface
  - retention intent
  - deletion/scrub note

- [ ] `privacy-notice-draft.md` includes:
  - who TOGT is
  - what is collected
  - why it is collected
  - mandatory vs optional fields
  - recipients/operators
  - cross-border transfer note
  - rights/contact/complaints note
  - breach notification posture

- [ ] `operator-register.md` includes Fly, Neon, Peach, Expo, Cloudinary, Resend, VerifyNow, GitHub, and any SMS/push provider in use.

- [ ] `security-compromise-runbook.md` includes:
  - detection
  - containment
  - evidence capture
  - assessment
  - regulator/data subject notification draft checklist
  - post-incident review

- [ ] Mark all docs as internal drafts until Damian approves publication.

**Acceptance:** Docs match implemented flows and do not over-promise unsupported controls.

- [ ] Run task verification before moving on.

```powershell
cd backend
npm test
```

---

## Task 14: Update API Contract and Agent Metadata

**Subagents:**

- Implementation: api-contract subagent
- Review: openapi-contract-reviewer subagent

**Files:**

- Modify `backend/src/openapi.js`
- Modify `backend/src/agentsJson.js` if present/needed
- Modify related OpenAPI tests

- [ ] Remove raw PII fields from public schemas.

- [ ] Add state-gated nullable fields where relevant:
  - `customer_phone`
  - `labourer_phone`
  - `address`
  - `location_lat`
  - `location_lng`

- [ ] Document approximate fields:
  - `approx_lat`
  - `approx_lng`
  - `location_precision`

- [ ] Document KYC response with `id_last4`, not `id_number`.

- [ ] Ensure `agents.json` describes minimized webhook/MCP payload behavior.

**Acceptance:** API docs match runtime serializer outputs.

- [ ] Run task verification before moving on.

```powershell
cd backend
npx jest tests/openapi.test.js tests/privacyWebhookPayloads.test.js --runInBand
npm test
```

---

## Task 15: Full Verification

**Subagents:**

- Implementation: verification-runner subagent
- Review: independent-final-review subagent

**Files:** No edits expected except fixing failures.

- [ ] Run full backend tests three cold times if this branch is near merge.

```powershell
cd backend
npm test
npm test
npm test
```

- [ ] Run smoke tests if PR #2 harness is present.

```powershell
cd backend
npm run smoke
```

If `npm run smoke` is not present, record that this branch is stacked before the smoke PR and use the existing suite.

- [ ] Compile Expo bundle.

```powershell
cd mobile
npm exec expo export --platform android --dev false --output-dir .expo-privacy-build-check
```

If export is too heavy or unavailable, use Metro bundle compilation as the fallback and record the exact command/output.

- [ ] Run grep checks:

```powershell
rg -n "id_number|idNumber|customer_phone|labourer_phone|current_lat|current_lng|location_lat|location_lng|address" backend/src mobile/src -S
```

Review every remaining hit and classify it as internal storage, serializer, or intentional UI field.

- [ ] Run secret/PII scan:

```powershell
rg -n "togt_live_|JWT_SECRET=|REFRESH_SECRET=|PEACH_|CLOUDINARY_|VERIFYNOW_|DATABASE_URL=|BEGIN PRIVATE KEY|id_number.*res\\.json|phone.*res\\.json" . -S
```

**Acceptance:** Full verification evidence is captured in the PR body.

---

## Task 16: Commit, Push, and PR

**Subagents:**

- Implementation: git-publisher subagent
- Review: pr-readiness-reviewer subagent

**Files:** No edits expected except PR body draft.

- [ ] Review final diff.

```powershell
git status --short
git diff --stat
git diff --check
```

- [ ] Commit with scoped message.

```powershell
git add backend mobile docs
git commit -m "feat(security): minimize customer data exposure"
```

- [ ] Push.

```powershell
git push -u origin feat/customer-data-safety
```

- [ ] Open PR as draft if PR #1/#2 dependencies are still open; otherwise open as ready after green verification. Do not merge the PR.

PR body must include:

- Summary of data minimized.
- Reveal rules implemented.
- KYC storage changes.
- Webhook/MCP sanitization.
- Tests run and cold-run results.
- Known follow-ups:
  - legal review before privacy notice publication
  - Information Officer/operator agreement work
  - production `PII_BLIND_INDEX_KEY` secret set
  - verified legacy `id_number` column scrub/drop after no-real-data confirmation

**Acceptance:** PR exists and is clearly blocked only by explicit upstream dependencies, if any.

---

## Final Cutover Criteria Before Real Users

Real customer/labourer onboarding is allowed only when all are true:

- [ ] Customer-data safety PR merged.
- [ ] Audit-log PR merged.
- [ ] Smoke-test PR merged.
- [ ] Production deploy complete and HTTPS-only endpoint live.
- [ ] `PII_BLIND_INDEX_KEY` set in production.
- [ ] No raw ID numbers in production DB.
- [ ] Privacy notice approved for publication.
- [ ] Operator register reviewed.
- [ ] Breach/security-compromise runbook accepted.
- [ ] Expo/mobile production build points to HTTPS.
- [ ] One fake customer and one fake labourer full journey passes without exposing phone/address/location before allowed states.
