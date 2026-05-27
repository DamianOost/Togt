# Production Deployment Design — Phase 1 (First Public Deploy)

**Date:** 2026-05-27
**Status:** Draft for execution approval (L3 — Damian approval required per action)
**Branch:** `docs/production-deployment-spec`
**Owner:** Damian (sole TOGT operator)

## Authority Source

Owned by TOGT under the canonical george-brain department contract. Authority files (read these first if any rule here conflicts):

- TOGT AGENTS — `george-brain/business/togt/AGENTS.md` (action tier table; production deployment is row 16 = L3, per-action Damian approval)
- TOGT SCOPE — `george-brain/business/togt/SCOPE.md` (§6 approval triggers — vendor signup, first production deploy, credential generation, schema migration not rollback-cheap)
- TOGT source map — `george-brain/business/togt/systems/source-map.md` (credential env-var inventory, runtime paths)
- Durable task — `george-brain/business/togt/INBOX.md` entry `[2026-05-27-C]`

## Goal

Take TOGT from `localhost:3002` on the Mac mini (launchd `com.togt.backend`) to **`https://togt-api.fly.dev`** reachable by any external AI agent. A custom domain (`togt-api.fly.dev`) is a non-blocking follow-up — see "Future — Custom Domain Cutover" at the end.

The Path B agent-native bet (RFC 9457 errors + Idempotency-Key + OpenAPI 3.1 + scoped API keys + MCP server + signed webhooks + audit log) is theoretical until this is done. Once done, any external Claude / Operator / A2A orchestrator can book a TOGT labourer end-to-end via HTTP MCP at `/mcp` without custom integration code.

## Non-Goals (Explicit Deferrals)

- GitHub Actions auto-deploy — Phase 2 follow-up after first deploy proves stable
- Production secrets rotation policy — separate Security-Safety runbook
- Postgres backup beyond Neon free-tier snapshots — separate task
- Mobile Play Store / App Store publish — separate task
- PostGIS extension on Neon — current matcher uses pure-SQL haversine (`6371 * acos(...)`), no extension required
- Migrating any dev data from the Mac mini's `togt` DB — production starts empty (per "Fresh start" decision)
- Real customer / labourer onboarding — deploy is infra-only; onboarding flow happens after

## Hard Operating Rules

- **No real customer or labourer data touched.** First deploy populates only Damian's user account + his API key, manually, post-deploy. Test labourers (Sipho, Thandi, etc.) are NOT migrated.
- **Old encrypted webhook secrets do NOT migrate.** Mac's `WEBHOOK_SECRET_ENCRYPTION_KEY` is dev-only. Production gets a fresh key. Any `webhook_subscriptions.secret_encrypted` rows from Mac would be unreadable garbage on prod and are excluded by design.
- **Mac mini stays alive as dev / staging.** Cutover is additive, not destructive. `launchctl kickstart -k gui/$(id -u)/com.togt.backend` continues to work after deploy. The dev API key `togt_live_pENbbPJ5TPVXMEtAvij8Gz9QcjWzehNc` remains live in the Mac's `togt` DB and is unchanged.
- **`requiredInProd()` is honoured.** The backend hard-fails on boot if `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, or `PEACH_WEBHOOK_SECRET` are missing under `NODE_ENV=production`. This is intentional and tests every secret is set before the app accepts traffic.
- **No POPIA-regulated data flows through this phase.** No real customer PII, no real ID numbers, no real bookings. The first real booking happens in a later, explicitly-approved phase.

## Architecture

| Component | Vendor | Tier | Notes |
|---|---|---|---|
| Compute | Fly.io | Free (1x shared-cpu-1x) | Region `lhr` (London) — closest to SA for the agent traffic. Auto-stop when idle saves on free-tier hours |
| Database | Neon | Free (0.5GB storage, 5GB egress / mo, **7-day point-in-time recovery built-in**) | Serverless Postgres; PITR is the entire backup strategy at POC scale |
| DNS + TLS (first deploy) | Fly native (`*.fly.dev`) | Free | `togt-api.fly.dev` with Let's-Encrypt cert auto-issued by Fly. No custom domain involvement |
| Monitoring | HC.io (Healthchecks.io) | Free (20 checks) | Ping `/health/deep` every 5 min; alert on 3 consecutive failures via email |
| Logging | Fly native (`flyctl logs`) | Free | Tail to local terminal; structured log shipping is a follow-up |

**Total fixed cost at POC scale:** **R0**. All vendors covered by free tiers.

**Free-tier discipline:** if usage would push past any vendor's free tier (Neon 0.5GB / 5GB egress, Fly free hours, HC.io 20 checks), stop and ask before paying.

**Mobile app:** Existing build pipeline; `API_BASE_URL` env at build time flips from Tailscale IP to `https://togt-api.fly.dev`.

## Phases (Sequential, Reversible)

### Phase 0 — Pre-flight (vendor accounts)

**Tier:** L3 for each signup (per AGENTS row 16, vendor accounts attached to billing).

Use email `georgeoosthuyzen@gmail.com` for all signups (matches existing GitHub + Tailscale).

Actions Damian explicitly approves per vendor:

- [ ] Create Fly.io account. Add payment method (free tier still requires it on signup; no charge unless free-tier limits exceeded).
- [ ] Create Neon account. Verify email.
- [ ] Create HC.io account. Verify email.

Custom domain (`togt.co.za`) registration + Cloudflare setup deliberately deferred. First deploy ships on `togt-api.fly.dev`. See "Future — Custom Domain Cutover" at the end of this spec for the non-disruptive add-on path.

Evidence: account confirmation emails for each of the three vendors.

### Phase 1 — Local prep (no live infra writes)

**Tier:** L1 / L2 — all local development work, no live vendor calls.

Actions:

- [ ] Add `backend/Dockerfile` — Node 20 base, install deps with `npm ci --omit=dev`, copy source, EXPOSE 3002, CMD `node src/app.js`.
- [ ] Add `backend/.dockerignore` — exclude `node_modules`, `tests/`, `.env*`, `coverage/`.
- [ ] Add `backend/fly.toml` at the backend folder root — single primary region `lhr`, single shared-cpu-1x VM, internal port 8080 mapped to public 80/443 (Fly's convention), auto-stop + auto-start enabled.
- [ ] Adjust `backend/src/app.js` to listen on `process.env.PORT || 3002` if it doesn't already (Fly injects `PORT=8080`).
- [ ] Generate the 4 production secrets locally and store in 1Password:
  ```bash
  for k in JWT_SECRET JWT_REFRESH_SECRET WEBHOOK_SECRET_ENCRYPTION_KEY PEACH_WEBHOOK_SECRET; do
    echo "$k=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')";
  done
  ```
  Paste the four lines into a new 1Password secure note titled "TOGT production secrets — 2026-05-27".
- [ ] Verify Dockerfile builds locally: `docker build -t togt-test backend/` (if Docker is installed on Damian's machine; otherwise skip — Fly will build remotely).

Evidence: `Dockerfile`, `.dockerignore`, `fly.toml` committed to a branch.

### Phase 2 — Infrastructure spin-up (Damian-driven)

**Tier:** L3 — each step writes to a live vendor.

Actions, executed by Damian via `flyctl` and `neonctl` (or web UI):

- [ ] `flyctl launch --name togt-api --region lhr --no-deploy` — creates the Fly app shell. Reject the auto-Postgres prompt (we use Neon).
- [ ] On Neon dashboard: create project "togt-prod", create database "togt", capture the connection string. It will be of the form `postgresql://<user>:<password>@<host>/togt?sslmode=require`.
- [ ] Set Fly secrets (all values copied from the relevant source — 1Password for the 4 new ones; Mac `~/.env` for the existing vendor creds):

  ```bash
  flyctl secrets set --app togt-api \
    NODE_ENV=production \
    DATABASE_URL='postgresql://...' \
    JWT_SECRET='...64-hex...' \
    JWT_REFRESH_SECRET='...64-hex...' \
    WEBHOOK_SECRET_ENCRYPTION_KEY='...64-hex...' \
    PEACH_WEBHOOK_SECRET='...64-hex...' \
    PEACH_CLIENT_ID='...' PEACH_CLIENT_SECRET='...' PEACH_MERCHANT_ID='...' \
    PEACH_AUTH_URL='...' PEACH_RECON_URL='...' \
    CLOUDINARY_CLOUD_NAME='...' CLOUDINARY_API_KEY='...' CLOUDINARY_API_SECRET='...' \
    VERIFYNOW_API_KEY='...' VERIFYNOW_MODE=sandbox \
    RESEND_API_KEY='...' \
    API_PUBLIC_BASE_URL='https://togt-api.fly.dev' \
    HC_TOGT_BACKEND='https://hc-ping.com/<uuid-from-phase-6>'
  ```

  (The HC.io ping URL is filled in during Phase 6 and a second `flyctl secrets set HC_TOGT_BACKEND=...` adds it then.)

- Fly auto-issues a Let's Encrypt cert for `togt-api.fly.dev` automatically — no manual cert step required for the first deploy. (Custom domain cert is added later in the optional follow-up phase.)

Evidence: `flyctl secrets list --app togt-api` shows all expected keys (only digests, not values).

### Phase 3 — Schema migration on empty Neon DB

**Tier:** L2 — pure migrations on an empty DB, no live data.

Actions:

- [ ] From local machine: `DATABASE_URL='<neon-conn-string>' cd backend && npm run migrate`
- [ ] Verify via `psql` (or Neon's SQL editor):
  ```sql
  \dt
  -- Expect: users, labourer_profiles, bookings, payments, ratings,
  -- kyc_verifications, refresh_tokens, password_resets, match_requests,
  -- match_attempts, idempotency_keys, api_keys, webhook_subscriptions,
  -- webhook_deliveries, audit_log
  ```
- [ ] `SELECT COUNT(*) FROM users;` → 0. `SELECT COUNT(*) FROM audit_log;` → 0. Production is empty.

Evidence: psql output showing 15 expected tables, all empty.

### Phase 4 — First deploy

**Tier:** L3 — first time real traffic could hit production. Damian's explicit go-ahead before running the deploy command.

Actions:

- [ ] `cd backend && flyctl deploy --remote-only --app togt-api`. Fly builds the Dockerfile remotely (avoids local Docker dependency).
- [ ] Wait for "Deployment status changed to successful" and the health check passes (Fly polls `/health` automatically).
- [ ] External smoke from any machine NOT on Tailscale:
  - `curl https://togt-api.fly.dev/health` → `{"status":"ok"}` (200)
  - `curl https://togt-api.fly.dev/health/deep` → `{"status":"ok","checks":{...}}` (200)
  - `curl https://togt-api.fly.dev/.well-known/openapi.json | jq .info` → returns OpenAPI metadata
  - `curl https://togt-api.fly.dev/.well-known/agents.json | jq .` → returns the agents manifest
- [ ] `flyctl logs --app togt-api` shows the boot lines:
  - `Togt API running on port 8080`
  - `[matcher] swept N stale pending match(es) on boot` (probably 0)
  - `[webhookDispatcher] started: tick=5000ms ...`
  - `[maintenanceSweepers] started: tick=3600000ms ...`

Evidence: 4 green curls + log output captured to the runbook.

### Phase 5 — Identity bootstrap

**Tier:** L3 — first production credential issued.

Actions (Damian runs):

- [ ] `curl -X POST https://togt-api.fly.dev/auth/register -H 'Content-Type: application/json' -d '{"name":"Damian Oosthuyzen","email":"<damian-prod-email>","phone":"+27...","password":"<strong-pw>","role":"customer"}'`
- [ ] Capture the returned `accessToken`. Save the password in 1Password under "TOGT production — Damian admin login".
- [ ] `curl -X POST https://togt-api.fly.dev/api/api-keys -H "Authorization: Bearer <accessToken>" -H 'Content-Type: application/json' -d '{"description":"Damian admin key 2026-05-27","scopes":["mcp:full","admin:full"]}'`
- [ ] Capture the returned plaintext key (e.g. `togt_live_<32 hex>`). **Shown ONCE.** Save in 1Password under "TOGT production API key — admin".
- [ ] Verify MCP HTTP works against production:
  ```bash
  curl -X POST https://togt-api.fly.dev/mcp \
    -H "Authorization: Bearer togt_live_<new>" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
  ```
  Should return a tools list with `find_labourers`, `audit_log_query`, `marketplace_stats`, etc.

Evidence: API key plaintext in 1Password + a successful `tools/list` response captured.

### Phase 6 — HC.io wiring

**Tier:** L2 — monitoring setup, no live data.

Actions:

- [ ] On HC.io: create check named "togt-prod-api" with type "ping by HTTP", schedule "every 5 min", grace period 3 min.
- [ ] Capture the ping URL (form: `https://hc-ping.com/<uuid>`).
- [ ] `flyctl secrets set HC_TOGT_BACKEND='https://hc-ping.com/<uuid>' --app togt-api`. This triggers a redeploy.
- [ ] Verify the backend now reads `HC_TOGT_BACKEND` and pings on each /health/deep result. (If the existing health-check pattern doesn't auto-ping, add a small periodic wrapper that hits the HC URL on each successful /health/deep call — alternatively use HC.io's "passive" mode where HC.io itself probes the URL.)
- [ ] On HC.io: confirm the check has received its first ping within 10 minutes. Status flips to green ("up").
- [ ] Configure alert: email to `<damian-email>` after 3 consecutive missed pings. Slack integration optional.

Evidence: HC.io dashboard shows the check in "up" state with the last ping <10 min ago.

### Phase 7 — Mobile app pointer flip

**Tier:** L2 — config change, no live customer impact (no customers yet).

Actions:

- [ ] Edit `mobile/src/services/api.js` (or wherever `API_BASE_URL` is set). Pick **one** approach (Option A for this first deploy; Option B is a follow-up cleanup):
  - **Option A — hardcoded constant (simpler, this plan picks this):** Replace the Mac mini Tailscale IP / hostname with the literal string `https://togt-api.fly.dev`. One-line change.
  - Option B — env-driven (follow-up): Read `process.env.EXPO_PUBLIC_API_BASE_URL` set at build time in `app.json` / `eas.json`. Cleaner long-term (lets a dev build target Mac mini while a release build targets prod) but more moving parts for the first cutover.
- [ ] Build Expo dev client targeting production: `cd mobile && npx expo run:android --variant release` (or iOS equivalent).
- [ ] Smoke-test on Damian's Android device: register a NEW account (since production DB is empty), confirm it lands.
- [ ] Verify the audit_log entry for the registration via `audit_log_query` MCP tool from Phase 5's API key.

Evidence: Expo build hits production, a new audit_log row exists for the registration call.

### Phase 8 — Documentation + INBOX close

**Tier:** L1 — pure docs.

Actions:

- [ ] Write `Togt/docs/superpowers/runbooks/production-deploy-runbook.md`:
  - How to deploy: `flyctl deploy --remote-only --app togt-api`
  - How to rollback: `flyctl releases --app togt-api` to list, `flyctl deploy --image <prev-image> --app togt-api` to revert
  - How to read logs: `flyctl logs --app togt-api -i 2h` (last 2 hours)
  - How to SSH into the running VM: `flyctl ssh console --app togt-api`
  - How to run a one-off command (e.g. migrations): `flyctl ssh console --app togt-api -C "npm run migrate"`
  - HC.io alert email goes to `<damian-email>`
  - Vendor support contacts (Fly: fly.io/discuss, Neon: neon.tech/docs, HC.io: dashboard support)
- [ ] Update `Togt/CLAUDE.md` (project brief) with the new production paths.
- [ ] Update `george-brain/business/togt/MEMORY.md` § "Stable Current Facts" — backend now lives at `togt-api.fly.dev` (via Fly.io + Neon), Mac mini is staging.
- [ ] Update `george-brain/business/togt/INBOX.md`: move `[2026-05-27-C]` from Open → Done with evidence (commit SHAs, vendor account names, deployment date).
- [ ] Append a `[T]` line to today's `memory/YYYY-MM-DD.md` summarising the deploy completion.

Evidence: runbook committed, INBOX entry moved to Done.

## Cutover Criteria — "deployed" is true when ALL pass:

- [ ] `https://togt-api.fly.dev/health` returns 200 with `{"status":"ok"}`
- [ ] `https://togt-api.fly.dev/health/deep` returns 200 with all checks `ok` or `skipped-in-test`
- [ ] MCP HTTP call from Damian's browser against `togt-api.fly.dev` with the new admin key returns a valid `tools/list` JSON-RPC envelope
- [ ] HC.io shows the check in "up" state with 3 consecutive successful pings
- [ ] Mobile app's production build authenticates against `togt-api.fly.dev` and creates an audit_log row
- [ ] `flyctl logs --app togt-api` shows the expected 4 boot lines and no error stacks since boot
- [ ] `togt-api.fly.dev` resolves and serves Fly's content from a non-Tailscale network (verify by switching Windows to phone hotspot and curling, or use any external machine)

## Future — Custom Domain Cutover (deferred, non-blocking)

When Damian registers `togt.co.za` and wants to swap the public hostname, the cutover is non-disruptive:

1. Register `togt.co.za` at a .co.za registrar (Domains.co.za, Afrihost, etc.) — ~R150/yr.
2. Add the domain to Cloudflare (free plan) — update registrar nameservers to Cloudflare's. Wait for "Active" status.
3. Cloudflare DNS: add CNAME `api` → `togt-api.fly.dev`, proxy ON (orange cloud).
4. `flyctl certs add api.togt.co.za --app togt-api` — Fly issues an additional cert that coexists with the original `togt-api.fly.dev` cert. Both hostnames now work.
5. `flyctl secrets set API_PUBLIC_BASE_URL='https://api.togt.co.za' --app togt-api` — RFC 9457 error type URIs and the agents.json self-description flip to the custom hostname.
6. Mobile app's `API_BASE_URL` constant updated to `https://api.togt.co.za` in the next release build. (Old builds continue working off `togt-api.fly.dev` — both routes serve the same app.)
7. HC.io check URL updated to `https://api.togt.co.za/health/deep` for clarity.
8. Verify externally + update runbook + MEMORY.md.

Both hostnames keep serving traffic indefinitely. There's no flag-day cutover. Old API keys + old MCP integrations against `togt-api.fly.dev` keep working until they're explicitly migrated.

## Rollback

| What broke | Recovery |
|---|---|
| Deploy bricks the app — health check failing | `flyctl releases --app togt-api`, identify the previous-good release id, `flyctl deploy --image <id> --app togt-api`. Recovery ~2 minutes. |
| Schema migration on Neon broke production reads | Use Neon's built-in 7-day point-in-time recovery via the Neon dashboard to restore the branch to before the migration ran. **Mitigation:** every migration should include a manual downgrade SQL block in a comment as a faster path than full PITR. |
| Fly TLS / `*.fly.dev` cert issue | `flyctl certs check togt-api.fly.dev` to inspect. Fly auto-rotates Let's Encrypt certs; manual `flyctl certs add` re-triggers issuance if stuck. |
| Fly region outage (lhr down) | Fly UI → scale to 2 regions (`lhr` + `fra`). Costs more but adds redundancy. Out of scope for first deploy at POC scale. |
| Neon outage | No active mitigation at POC. Document the incident, wait for Neon. Future: switch to Fly Postgres or DO Managed Postgres if Neon proves unreliable. |
| HC.io false-positive alert | HC.io dashboard → pause check temporarily, investigate. Real outage requires log inspection via `flyctl logs`. |
| Mobile app crash after URL flip | Revert the hardcoded `API_BASE_URL` constant in the next dev build. Production crash → out-of-band Expo update (or accept ~7-day Play/App Store review if it's a published build, which it isn't yet). |

## Decisions Captured (2026-05-27 review)

1. **Cost ceiling:** stay within free tiers only for POC. If any vendor's usage would push past its free tier, **stop and ask** before paying. No standing rand cap — just "free or pause".
2. **Backup discipline:** Neon free tier's built-in **7-day point-in-time recovery** is the entire backup strategy at POC. No daily `pg_dump` cron, no manual exports, no ongoing operator burden. Revisit when real customer data exists and the 7-day window stops being long enough.
3. **Domain:** custom `togt.co.za` deferred to a future session. First deploy ships on `togt-api.fly.dev` with Fly's auto-issued Let's Encrypt cert. See "Future — Custom Domain Cutover" below for the non-disruptive add-on path.
4. **Vendor signup email:** `georgeoosthuyzen@gmail.com` (existing account already tied to GitHub + Tailscale + the planned MCP integrator path).

## Evidence Required Before Cutover Sign-off

1. `flyctl secrets list --app togt-api` output (digests only, no values) — shows all expected env vars set
2. Three consecutive successful HC.io pings (auto-captured in the HC.io dashboard)
3. Saved-to-1Password screenshots / records:
   - The 4 generated production secrets (under "TOGT production secrets — 2026-05-27")
   - The bootstrap admin API key plaintext (under "TOGT production API key — admin")
   - The Damian admin user's password (under "TOGT production — Damian admin login")
4. A successful MCP `tools/list` JSON response from production, recorded in the runbook
5. A successful audit_log_query MCP response showing the bootstrap actions (register + api-key creation + first MCP call)
6. The 4 expected backend boot lines captured in `flyctl logs --app togt-api -i 30m`

## Authority Summary

| Action | Tier | Approval mechanism |
|---|---|---|
| Write Dockerfile, fly.toml, dotignore | L1 | Autonomous |
| Generate the 4 secrets via crypto.randomBytes | L1 | Autonomous |
| Run schema migration on empty Neon DB | L2 | Autonomous after Neon DB is created |
| Register `togt.co.za`, create Fly/Neon/Cloudflare/HC.io accounts | L3 | Damian-explicit per signup |
| Run `flyctl deploy` against production for the first time | L3 | Damian-explicit go-ahead |
| Mint the bootstrap admin API key | L3 | Damian-explicit (he's the user) |
| Set Fly secrets including vendor credentials | L2 (secrets handling is policy-bound) | Autonomous if Damian has approved the values in 1Password |
| Update mobile app `API_BASE_URL` | L2 | Autonomous after Phase 4 cutover passes |
| Modify auth/security primitives (JWT secrets, encryption keys) | L3 | Per `requiredInProd()` — generated once in Phase 1, never rotated in this plan |
| Disable KYC enforcement or any L4 action | L4 | Never (this plan does not touch these) |
