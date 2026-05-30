# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is an L3 plan: every Phase-0 / Phase-2 / Phase-4 / Phase-5 step requires Damian's explicit in-conversation approval before execution. Do NOT execute those steps autonomously.**

**Goal:** Ship TOGT to a public-internet HTTPS endpoint (`https://togt-api.fly.dev`) so external AI agents can reach the MCP server, while keeping the Mac mini alive as dev/staging.

**Architecture:** Fly.io free-tier VM in `lhr` region runs the existing Express app via a Dockerfile. Neon free-tier serverless Postgres holds the production schema (empty at start). Fly's built-in Let's Encrypt cert serves `*.fly.dev` automatically. HC.io free-tier polls `/health/deep` every 5min. Custom domain `togt.co.za` is a deferred non-blocking follow-up (see spec § Future).

**Tech Stack:** Node.js 20 (Docker base), Express, Postgres 16 (Neon), Fly.io (Docker deploy + flyctl CLI), HC.io (uptime monitoring). No CI in this plan — manual `flyctl deploy` for first deploy.

**Branch for execution:** `feat/fly-production-deploy` off `main` (created in Task 4 below).
**Branch for this plan itself:** `docs/production-deployment-plan` stacked on `docs/production-deployment-spec`.

**Spec:** `docs/superpowers/specs/2026-05-27-production-deployment-design.md`

---

## File Structure

**New files (committed to `feat/fly-production-deploy`):**
- `backend/Dockerfile` — Node 20 multi-stage build, npm ci --omit=dev, CMD `node src/app.js`
- `backend/.dockerignore` — exclude node_modules, tests, .env*, coverage, .git
- `backend/fly.toml` — single region `lhr`, internal port 8080, auto-stop/auto-start, /health HTTP check
- `docs/superpowers/runbooks/production-deploy-runbook.md` — deploy/rollback/log/ssh commands

**Modified files (same branch):**
- `backend/src/app.js` — verify it already listens on `process.env.PORT || 3002` (don't change if already correct)
- `mobile/src/services/api.js` — replace Tailscale-IP base URL with `https://togt-api.fly.dev` (Task 11 only)
- `CLAUDE.md` (project root) — add production paths section

**Modified files in `george-brain` (separate commit on `codex/togt-deploy-bookkeeping`):**
- `business/togt/MEMORY.md` § 1 — backend now lives at `togt-api.fly.dev`
- `business/togt/INBOX.md` — move `[2026-05-27-C]` Open → Done with evidence
- `memory/2026-05-27.md` — append `[T]` line

**External state (NOT in git, but tracked in 1Password):**
- "TOGT production secrets — 2026-05-27" — 4 generated secret values
- "TOGT production API key — admin" — bootstrap admin API key plaintext
- "TOGT production — Damian admin login" — admin user password
- Vendor account confirmations: Fly.io, Neon, HC.io

---

## Authority Reminder

| Tier | Who decides | Plan steps |
|---|---|---|
| L0–L1 | Autonomous | File writes, local generation, local test runs, commits to feat branch |
| L2 | Autonomous after green tests | Schema migration on empty Neon DB; HC.io check creation; mobile build |
| L3 | **Damian explicit in-conversation per action** | Vendor signups (Task 1), Fly secret setting (Task 7), first `flyctl deploy` (Task 9), production identity bootstrap (Task 11) |
| L4 | Never (without separate Security-Safety runbook) | Anything destructive on prod data; key rotation; force-push |

---

## Task 1: Vendor account signups

**Files:** None (external accounts).

**L-tier:** L3 — each signup requires Damian explicit approval.

**Email to use throughout:** `georgeoosthuyzen@gmail.com`.

- [ ] **Step 1: Pause and explicitly confirm with Damian** that he's ready to create the 3 vendor accounts now. If no go-ahead, stop the task and revisit.

- [ ] **Step 2: Fly.io signup**

In a browser: navigate to `https://fly.io/app/sign-up`. Sign up with `georgeoosthuyzen@gmail.com`. Add a payment method when prompted (free tier still requires it on signup; no charges unless free-tier limits exceeded).

Capture: confirmation email + the Fly organization slug (usually `personal`).

- [ ] **Step 3: Install flyctl on the Mac mini (where the deploy will run from)**

```bash
ssh georgeoosthuyzen@100.65.206.24 "curl -L https://fly.io/install.sh | sh"
ssh georgeoosthuyzen@100.65.206.24 "export FLYCTL_INSTALL=\"\$HOME/.fly\"; export PATH=\"\$FLYCTL_INSTALL/bin:\$PATH\"; flyctl version"
```
Expected output: a version line like `flyctl v0.x.x linux/amd64 ...`.

- [ ] **Step 4: flyctl auth login**

```bash
ssh -t georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl auth login"
```
Expected: prints a URL, Damian opens it in browser, authenticates, returns to terminal showing "successfully logged in as georgeoosthuyzen@gmail.com".

- [ ] **Step 5: Neon signup**

In a browser: navigate to `https://console.neon.tech/`. Sign up with `georgeoosthuyzen@gmail.com`. Verify email.

Capture: confirmation email.

- [ ] **Step 6: HC.io signup**

In a browser: navigate to `https://healthchecks.io/`. Sign up with `georgeoosthuyzen@gmail.com`. Verify email.

Capture: confirmation email.

- [ ] **Step 7: Confirm all three accounts active**

Damian confirms: "Fly + Neon + HC.io all signed in." Plan moves to Task 2.

---

## Task 2: Create feature branch and write Dockerfile

**Files:**
- Create branch: `feat/fly-production-deploy` (off `main` in the TOGT repo)
- Create: `backend/Dockerfile`

**L-tier:** L1 — local file writes.

- [ ] **Step 1: Branch off main on Mac**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git checkout main && git pull --ff-only && git checkout -b feat/fly-production-deploy"
```
Expected output: `Switched to a new branch 'feat/fly-production-deploy'`.

- [ ] **Step 2: Write the Dockerfile**

Create `backend/Dockerfile` with exact content:

```dockerfile
# Node 20 (LTS) — the existing engines field in package.json is satisfied.
# Multi-stage so the runtime image doesn't carry dev deps + build tools.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev: production deps only. Saves ~80MB vs the full install.
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
# Bring in just the pruned node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy source — .dockerignore excludes tests, .env files, coverage, .git.
COPY . .
# Fly injects PORT=8080. The app reads process.env.PORT — verified in app.js.
EXPOSE 8080
# No shell wrapper — direct exec so SIGTERM reaches the Node process
# (the existing installShutdownHandlers in app.js needs the signal).
CMD ["node", "src/app.js"]
```

- [ ] **Step 3: Verify Dockerfile syntax (no Docker required locally)**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && head -20 backend/Dockerfile"
```
Expected: prints the FROM/WORKDIR/COPY lines.

- [ ] **Step 4: Commit**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add backend/Dockerfile && git commit -m 'feat(deploy): Dockerfile for Fly.io production build'"
```

---

## Task 3: Write .dockerignore

**Files:**
- Create: `backend/.dockerignore`

**L-tier:** L1.

- [ ] **Step 1: Create the .dockerignore**

Content:

```
node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
tests
coverage
*.md
docs
.DS_Store
```

Path: `backend/.dockerignore`.

- [ ] **Step 2: Verify it's there**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && cat backend/.dockerignore"
```
Expected: prints the 10 lines above.

- [ ] **Step 3: Commit**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add backend/.dockerignore && git commit -m 'feat(deploy): .dockerignore — exclude tests/docs/.env from image'"
```

---

## Task 4: Write fly.toml

**Files:**
- Create: `backend/fly.toml`

**L-tier:** L1.

- [ ] **Step 1: Create the fly.toml**

Content:

```toml
# Fly.io app config for togt-api.
# Region: lhr (London — closest to South Africa on Fly's free network).
# Single shared-cpu-1x VM with auto-stop to stay under free-tier hours.
# Public HTTP/HTTPS via Fly's edge proxy on port 443 → internal port 8080.

app = "togt-api"
primary_region = "lhr"
kill_signal = "SIGTERM"
kill_timeout = "11s"

[build]
  # Dockerfile lives in this same directory.

[env]
  # Sensitive values go via `flyctl secrets set`, NOT here.
  # Non-sensitive defaults can live here.
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

Path: `backend/fly.toml`.

- [ ] **Step 2: Confirm Express listens on `process.env.PORT`**

```bash
ssh georgeoosthuyzen@100.65.206.24 "grep -nE 'PORT|listen' ~/.openclaw/workspace/Togt/backend/src/app.js | head -5"
```
Expected: a line showing `const port = process.env.PORT || 3002;` or equivalent. If the literal port is `3002` hardcoded (no env read), add the env fallback in this step and commit it as part of this task.

- [ ] **Step 3: Commit**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add backend/fly.toml && git commit -m 'feat(deploy): fly.toml — lhr, shared-cpu-1x, auto-stop, /health check'"
```

---

## Task 5: Generate the 4 production secrets

**Files:** None in git. The values go into 1Password.

**L-tier:** L3 — these are real production credentials about to be minted.

- [ ] **Step 1: Pause and confirm with Damian** he's ready to generate + store production secrets. If no go-ahead, stop.

- [ ] **Step 2: Generate 4 secrets locally**

Damian runs on the Mac mini (so values are generated on a trusted host, not transmitted across SSH):

```bash
ssh georgeoosthuyzen@100.65.206.24 "for k in JWT_SECRET JWT_REFRESH_SECRET WEBHOOK_SECRET_ENCRYPTION_KEY PEACH_WEBHOOK_SECRET; do
  echo \"\$k=\$(node -e 'console.log(require(\\\"crypto\\\").randomBytes(32).toString(\\\"hex\\\"))')\";
done"
```

Expected output: 4 lines, each `<KEY>=<64-hex-chars>`.

- [ ] **Step 3: Copy all 4 lines into 1Password**

Damian creates a 1Password secure note titled `TOGT production secrets — 2026-05-27`. Pastes all 4 lines. Saves.

- [ ] **Step 4: Damian confirms** the secrets are stored in 1Password before terminal scrollback is cleared.

- [ ] **Step 5: Clear the terminal** so the secrets don't sit in scrollback longer than necessary.

```bash
ssh georgeoosthuyzen@100.65.206.24 "clear"
```

---

## Task 6: Create the Fly app shell + Neon project

**Files:** None (creates Fly + Neon side state, not local files).

**L-tier:** L3 — each step writes to a live vendor.

- [ ] **Step 1: Pause and confirm** with Damian that the Fly app + Neon project should be created now.

- [ ] **Step 2: Create Fly app**

```bash
ssh -t georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt/backend && ~/.fly/bin/flyctl launch --name togt-api --region lhr --no-deploy --copy-config --yes"
```

When prompted about Postgres / Redis / Tigris attachment: **decline all**. We use Neon, not Fly Postgres.

Expected: `Created app togt-api in organization personal` and a confirmation that fly.toml was respected.

- [ ] **Step 3: Verify Fly app exists**

```bash
ssh georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl apps list | grep togt-api"
```
Expected: a line `togt-api  personal  ...`.

- [ ] **Step 4: Create Neon project + database**

On `https://console.neon.tech/`:
1. Click "New Project". Name: `togt-prod`. Region: closest to lhr (EU-Central or US-East). Postgres version: 16.
2. After creation, the default database is named `neondb`. Rename or create a new one called `togt`:
   - Settings → Databases → "+ Create database" → Name: `togt`.
3. Settings → Connection details → toggle "Pooled connection" ON (recommended for serverless). Copy the connection string. It looks like:
   ```
   postgresql://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/togt?sslmode=require
   ```

- [ ] **Step 5: Save the Neon connection string in 1Password**

1Password note title: `TOGT production Neon DATABASE_URL — 2026-05-27`.

- [ ] **Step 6: Verify connection from the Mac mini**

```bash
ssh georgeoosthuyzen@100.65.206.24 "DATABASE_URL='<paste-neon-url-here>' /opt/homebrew/opt/postgresql@16/bin/psql -c 'SELECT version();'"
```
Expected: prints `PostgreSQL 16.x on ...`.

---

## Task 7: Set Fly secrets

**Files:** None (writes to Fly secret store).

**L-tier:** L3 — bulk credential set.

- [ ] **Step 1: Pause and confirm** with Damian that the Fly secret-set is about to run.

- [ ] **Step 2: Gather all values** Damian needs to have on hand:

From 1Password `TOGT production secrets — 2026-05-27`:
- JWT_SECRET, JWT_REFRESH_SECRET, WEBHOOK_SECRET_ENCRYPTION_KEY, PEACH_WEBHOOK_SECRET (4 hex strings)

From 1Password `TOGT production Neon DATABASE_URL — 2026-05-27`:
- DATABASE_URL (the pooled Neon URL)

From the Mac mini's existing `~/.env` (Damian runs `grep -E 'PEACH|CLOUDINARY|VERIFYNOW|RESEND' ~/.env` to surface them):
- PEACH_CLIENT_ID, PEACH_CLIENT_SECRET, PEACH_MERCHANT_ID, PEACH_AUTH_URL, PEACH_RECON_URL
- CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
- VERIFYNOW_API_KEY (set MODE to sandbox for prod first deploy)
- RESEND_API_KEY

- [ ] **Step 3: Set all secrets in one flyctl command** (atomic — either all land or none)

```bash
ssh -t georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt/backend && ~/.fly/bin/flyctl secrets set --app togt-api \
  NODE_ENV=production \
  DATABASE_URL='<neon-pooled-url>' \
  JWT_SECRET='<64-hex>' \
  JWT_REFRESH_SECRET='<64-hex>' \
  WEBHOOK_SECRET_ENCRYPTION_KEY='<64-hex>' \
  PEACH_WEBHOOK_SECRET='<64-hex>' \
  PEACH_CLIENT_ID='<from-mac-env>' \
  PEACH_CLIENT_SECRET='<from-mac-env>' \
  PEACH_MERCHANT_ID='<from-mac-env>' \
  PEACH_AUTH_URL='<from-mac-env>' \
  PEACH_RECON_URL='<from-mac-env>' \
  CLOUDINARY_CLOUD_NAME='<from-mac-env>' \
  CLOUDINARY_API_KEY='<from-mac-env>' \
  CLOUDINARY_API_SECRET='<from-mac-env>' \
  VERIFYNOW_API_KEY='<from-mac-env>' \
  VERIFYNOW_MODE=sandbox \
  RESEND_API_KEY='<from-mac-env>' \
  API_PUBLIC_BASE_URL='https://togt-api.fly.dev'"
```

Expected: `Secrets are staged for the first deployment` (no deploy triggered yet because no machine exists yet — that's fine).

`HC_TOGT_BACKEND` is intentionally not set here — added in Task 12 once the HC.io ping URL exists.

- [ ] **Step 4: Verify the secret list (digests only, no values)**

```bash
ssh georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl secrets list --app togt-api"
```

Expected: a table with 17 secret names + digests + create timestamps. Verify each expected key is present.

- [ ] **Step 5: Clear terminal scrollback**

```bash
ssh georgeoosthuyzen@100.65.206.24 "clear"
```

---

## Task 8: Run schema migration on empty Neon DB

**Files:** None in git (operates on Neon).

**L-tier:** L2 — pure migrations on an empty DB, no risk to any live data.

- [ ] **Step 1: Run migrate**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt/backend && DATABASE_URL='<neon-pooled-url>' npm run migrate"
```

Expected: each migration prints `Running migration: NNN_...sql` then `  ✓ NNN_...sql`, ending with `All migrations complete.`. 15 migrations total (001 through 015).

- [ ] **Step 2: Verify schema**

```bash
ssh georgeoosthuyzen@100.65.206.24 "DATABASE_URL='<neon-pooled-url>' /opt/homebrew/opt/postgresql@16/bin/psql -c '\\dt'"
```

Expected: 15 tables listed:
```
users, labourer_profiles, bookings, payments, ratings, kyc_verifications,
refresh_tokens, password_resets, match_requests, match_attempts,
idempotency_keys, api_keys, webhook_subscriptions, webhook_deliveries,
audit_log
```

- [ ] **Step 3: Verify all tables empty**

```bash
ssh georgeoosthuyzen@100.65.206.24 "DATABASE_URL='<neon-pooled-url>' /opt/homebrew/opt/postgresql@16/bin/psql -c 'SELECT COUNT(*) FROM users UNION ALL SELECT COUNT(*) FROM audit_log UNION ALL SELECT COUNT(*) FROM api_keys;'"
```

Expected: three rows, all `0`.

---

## Task 9: First deploy

**Files:** None in git (deploys what's already committed).

**L-tier:** L3 — first time real traffic could hit production. Damian explicit go-ahead before running.

- [ ] **Step 1: Pause and confirm** with Damian he's ready to deploy.

- [ ] **Step 2: Push the feature branch to origin** (so the build is from a reachable commit)

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git push -u origin feat/fly-production-deploy"
```

Expected: `* [new branch] feat/fly-production-deploy -> feat/fly-production-deploy`.

- [ ] **Step 3: Deploy**

```bash
ssh -t georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt/backend && ~/.fly/bin/flyctl deploy --remote-only --app togt-api"
```

Expected over ~2–4 minutes:
- `==> Verifying app config`
- `==> Building image`
- `==> Pushing image to fly`
- `==> Creating release`
- `==> Monitoring deployment`
- One machine starts, health check passes
- `Deployment status changed to successful`

- [ ] **Step 4: External smoke test from a non-Tailscale network**

From any machine NOT on the tailnet (e.g. switch Windows to phone hotspot briefly, or use any external machine):

```bash
curl -sS https://togt-api.fly.dev/health
# Expected: {"status":"ok"}

curl -sS https://togt-api.fly.dev/health/deep | jq .
# Expected: {"status":"ok","checks":{"process":"ok","db":"ok","dispatcher":"fresh","sweepers":"fresh"}}
# (sweepers may be "stale" if dispatcher hasn't ticked yet — re-run in 30s)

curl -sS https://togt-api.fly.dev/.well-known/openapi.json | jq '.info'
# Expected: {"title":"Togt API",...,"version":"..."}

curl -sS https://togt-api.fly.dev/.well-known/agents.json | jq '.tools | length'
# Expected: a number ≥ 10 (the MCP tool count)
```

- [ ] **Step 5: Check the boot logs**

```bash
ssh georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl logs --app togt-api -i 5m"
```

Expected to find:
- `Togt API running on port 8080`
- `[matcher] swept N stale pending match(es) on boot` (probably 0)
- `[webhookDispatcher] started: tick=5000ms ...`
- `[maintenanceSweepers] started: tick=3600000ms ...`
- NO unhandled error stacks.

- [ ] **Step 6: Verify health check is green in Fly**

```bash
ssh georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl status --app togt-api"
```

Expected: `Hostname togt-api.fly.dev` + at least one machine in `started` state with `passing` health check.

---

## Task 10: HC.io wire-up

**Files:** None in git.

**L-tier:** L2 — monitoring setup; no live data.

- [ ] **Step 1: Create HC.io check**

On `https://healthchecks.io/` dashboard:
1. Click "Add Check"
2. Name: `togt-prod-api`
3. Tags: `togt prod`
4. Schedule: "Simple" → every `5 minutes`, grace `3 minutes`
5. Save. Capture the ping URL from the check page — looks like `https://hc-ping.com/<uuid>`.

- [ ] **Step 2: Add HC_TOGT_BACKEND secret to Fly + redeploy**

```bash
ssh georgeoosthuyzen@100.65.206.24 "~/.fly/bin/flyctl secrets set HC_TOGT_BACKEND='https://hc-ping.com/<uuid>' --app togt-api"
```

Expected: triggers a one-machine rolling restart. ~1 minute.

- [ ] **Step 3: Confirm the backend code already pings HC.io**

```bash
ssh georgeoosthuyzen@100.65.206.24 "grep -rn 'HC_TOGT_BACKEND\\|ping_healthcheck\\|HC_' ~/.openclaw/workspace/Togt/backend/src | head -10"
```

If the backend doesn't yet have a healthcheck-ping path that uses `HC_TOGT_BACKEND`: add a small periodic ping inside `webhookDispatcher.tick()` or `/health/deep` handler that POSTs to `process.env.HC_TOGT_BACKEND` when set. (One-liner using `fetch` in the post-tick callback.) Commit on the same branch with message `feat(deploy): ping HC.io on /health/deep success`.

Alternative — HC.io's "passive" mode: in the HC.io check settings, switch to "I want HC.io to poll my service" and provide `https://togt-api.fly.dev/health/deep` as the polled URL. This bypasses needing the backend to actively ping.

**Recommended for first deploy:** HC.io passive polling (no code change required). Switch the check to passive in the dashboard and skip the backend code change.

- [ ] **Step 4: Verify HC.io receives first ping**

Wait 10 minutes. Refresh `https://healthchecks.io/`. The `togt-prod-api` check should show "up" with a green dot and a "Last ping" timestamp <10 min ago.

- [ ] **Step 5: Configure alert**

In HC.io: Integrations → Email → add `georgeoosthuyzen@gmail.com`. Set the check's notification to "after 1 failure" (HC.io will email after the grace period expires).

---

## Task 11: Identity bootstrap

**Files:** None in git. State is in production DB + 1Password.

**L-tier:** L3 — first production credential.

- [ ] **Step 1: Pause and confirm** with Damian he's ready to bootstrap his prod identity. Pick a strong password and save it in 1Password BEFORE running the curl.

- [ ] **Step 2: Register Damian's prod admin user**

Damian picks an email (suggested: `damianoost+togtprod@gmail.com` or his real email) and a strong password. Saves password in 1Password under `TOGT production — Damian admin login`.

```bash
curl -sS -X POST https://togt-api.fly.dev/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Damian Oosthuyzen","email":"<prod-email>","phone":"+27<damian-phone>","password":"<strong-pw-from-1password>","role":"customer"}' | jq .
```

Expected: a JSON response with `user.id` (UUID), `accessToken` (JWT), `refreshToken` (JWT). HTTP 201.

Capture the `accessToken` for the next step.

- [ ] **Step 3: Mint the production admin API key**

```bash
curl -sS -X POST https://togt-api.fly.dev/api/api-keys \
  -H "Authorization: Bearer <accessToken-from-step-2>" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Damian admin key 2026-05-27","scopes":["mcp:full","admin:full"]}' | jq .
```

Expected: a JSON response with `id` (UUID), `prefix` (first 12 chars), and **the full plaintext key** (`togt_live_<32-hex>`) shown ONCE.

- [ ] **Step 4: Immediately save the plaintext key to 1Password**

Note title: `TOGT production API key — admin`. Body: the full `togt_live_<32-hex>` value.

- [ ] **Step 5: Verify MCP HTTP works against production**

```bash
curl -sS -X POST https://togt-api.fly.dev/mcp \
  -H "Authorization: Bearer togt_live_<from-step-3>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | jq '.result.tools[0].name'
```

Expected: prints a tool name like `"find_labourers"`.

- [ ] **Step 6: Verify audit_log_query returns the bootstrap actions**

```bash
curl -sS -X POST https://togt-api.fly.dev/mcp \
  -H "Authorization: Bearer togt_live_<from-step-3>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"audit_log_query","arguments":{"limit":5}},"id":1}' | jq '.result.content[0].text' -r | jq '.rows | length'
```

Expected: a number ≥ 1 (at minimum the api-keys mint + this tools/call land in audit_log).

---

## Task 12: Mobile app pointer flip

**Files:**
- Modify: `mobile/src/services/api.js` (or whichever file defines `API_BASE_URL`)

**L-tier:** L2 — config change, no live customer impact (no customers yet).

- [ ] **Step 1: Locate the API_BASE_URL constant**

```bash
ssh georgeoosthuyzen@100.65.206.24 "grep -rn 'API_BASE_URL\\|baseURL' ~/.openclaw/workspace/Togt/mobile/src | head -5"
```

Capture the file path (likely `mobile/src/services/api.js`).

- [ ] **Step 2: Edit the file**

In the captured file, replace the existing Mac mini Tailscale-IP-based URL with the literal string `'https://togt-api.fly.dev'`.

Example before:
```js
const API_BASE_URL = 'http://100.65.206.24:3002';
```
After:
```js
const API_BASE_URL = 'https://togt-api.fly.dev';
```

- [ ] **Step 3: Confirm the edit landed**

```bash
ssh georgeoosthuyzen@100.65.206.24 "grep -n 'togt-api.fly.dev' ~/.openclaw/workspace/Togt/mobile/src/services/api.js"
```
Expected: prints the new constant line.

- [ ] **Step 4: Build a development client targeting production**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt/mobile && npx expo prebuild --clean && cd android && ./gradlew assembleRelease"
```

Expected: a release APK at `mobile/android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 5: Install on Damian's Android device + smoke test**

Damian installs the APK (via USB / Expo Go) and:
1. Registers a fresh new account (production DB has only his admin user from Task 11).
2. Confirms registration succeeds — receives tokens.
3. Logs out, logs back in — confirms persistence works.

- [ ] **Step 6: Verify the audit_log shows the mobile registration**

```bash
curl -sS -X POST https://togt-api.fly.dev/mcp \
  -H "Authorization: Bearer togt_live_<admin-key>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"audit_log_query","arguments":{"action":"route.post./auth/register","limit":5}},"id":1}' | jq '.result.content[0].text' -r
```

Expected: a JSON blob with at least one row in `.rows[]` matching the mobile registration.

- [ ] **Step 7: Commit the mobile change**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add mobile/src/services/api.js && git commit -m 'feat(deploy): mobile points at togt-api.fly.dev for production'"
```

---

## Task 13: Write the production runbook

**Files:**
- Create: `docs/superpowers/runbooks/production-deploy-runbook.md`

**L-tier:** L1 — pure docs.

- [ ] **Step 1: Create the runbooks directory**

```bash
ssh georgeoosthuyzen@100.65.206.24 "mkdir -p ~/.openclaw/workspace/Togt/docs/superpowers/runbooks"
```

- [ ] **Step 2: Create the runbook**

Path: `docs/superpowers/runbooks/production-deploy-runbook.md`.

Content:

```markdown
# Production Deploy Runbook

**Stack:** Fly.io (compute, app `togt-api`, region lhr) + Neon (Postgres) + HC.io (monitoring).
**Hostname:** `https://togt-api.fly.dev` (custom domain deferred).
**Deploy from:** Mac mini, branch `main` after merge.

## Deploy a new version

1. Merge the feature PR to `main`.
2. On Mac mini:
   ```bash
   cd ~/.openclaw/workspace/Togt
   git checkout main && git pull --ff-only
   cd backend
   ~/.fly/bin/flyctl deploy --remote-only --app togt-api
   ```
3. Wait for "Deployment status changed to successful".
4. Verify externally:
   ```bash
   curl -sS https://togt-api.fly.dev/health/deep | jq .
   ```
   Expect all checks `ok`.

## Rollback to previous release

1. List recent releases:
   ```bash
   ~/.fly/bin/flyctl releases --app togt-api
   ```
2. Identify the previous-good release id (column 1).
3. Get its image:
   ```bash
   ~/.fly/bin/flyctl releases --app togt-api --image
   ```
4. Deploy that image:
   ```bash
   ~/.fly/bin/flyctl deploy --image <previous-image> --app togt-api
   ```
   Recovery ~2 minutes.

## Read logs

```bash
~/.fly/bin/flyctl logs --app togt-api          # tail
~/.fly/bin/flyctl logs --app togt-api -i 2h    # last 2 hours
```

## SSH into the running VM

```bash
~/.fly/bin/flyctl ssh console --app togt-api
```

## Run a one-off command (e.g. migrations)

```bash
~/.fly/bin/flyctl ssh console --app togt-api -C "npm run migrate"
```

## Restart all machines

```bash
~/.fly/bin/flyctl machine restart --app togt-api --select
```

## Schema migration rollback (Neon)

If a migration broke production reads:
1. Neon dashboard → togt-prod → Branches → "Restore to point in time" → pick a timestamp before the migration ran.
2. Neon creates a restored branch. Promote it to be the new main branch via Settings.
3. `DATABASE_URL` does not change (Neon swaps the underlying branch).
4. Verify schema is back: `psql togt -c '\\d audit_log'` etc.

## Secrets rotation (emergency)

1. Generate new secret(s) via `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`.
2. `flyctl secrets set --app togt-api JWT_SECRET='<new>'` (triggers rolling restart).
3. Save new value(s) to 1Password.
4. Existing JWTs become invalid — users / agents must re-auth.

## Contacts

- Fly.io support: fly.io/discuss + dashboard
- Neon: neon.tech/docs + dashboard
- HC.io: dashboard support
- HC.io alert email: georgeoosthuyzen@gmail.com
```

- [ ] **Step 3: Commit**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add docs/superpowers/runbooks/production-deploy-runbook.md && git commit -m 'docs(deploy): production-deploy runbook (deploy/rollback/logs/ssh/secrets-rotation)'"
```

---

## Task 14: Update CLAUDE.md with production paths

**Files:**
- Modify: `CLAUDE.md` (Togt repo root)

**L-tier:** L1.

- [ ] **Step 1: Locate the right section**

```bash
ssh georgeoosthuyzen@100.65.206.24 "head -40 ~/.openclaw/workspace/Togt/CLAUDE.md"
```

Find the "Repository structure" section.

- [ ] **Step 2: Add a "Production" subsection after "Stack"**

Append (or insert after the Stack table):

```markdown
## Production

- **Public URL:** `https://togt-api.fly.dev` (custom domain `togt.co.za` deferred)
- **Compute:** Fly.io app `togt-api`, region `lhr`, free tier, auto-stop/auto-start
- **Database:** Neon serverless Postgres (project `togt-prod`, database `togt`)
- **Monitoring:** HC.io check `togt-prod-api`, 5min cadence, email alerts to georgeoosthuyzen@gmail.com
- **Deploy:** `cd backend && flyctl deploy --remote-only --app togt-api` from Mac mini
- **Runbook:** `docs/superpowers/runbooks/production-deploy-runbook.md`
- **Mac mini:** continues as dev/staging via launchd `com.togt.backend`. Both environments run side-by-side.
```

- [ ] **Step 3: Commit**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git add CLAUDE.md && git commit -m 'docs: CLAUDE.md adds Production section pointing at togt-api.fly.dev'"
```

---

## Task 15: Final commit + push + open PR for the deploy branch

**Files:** None (only pushes existing commits).

**L-tier:** L2 — opens the PR; merge happens after Damian reviews.

- [ ] **Step 1: Push the feature branch**

```bash
ssh georgeoosthuyzen@100.65.206.24 "cd ~/.openclaw/workspace/Togt && git push origin feat/fly-production-deploy"
```

- [ ] **Step 2: Open PR from Windows (gh CLI)**

```bash
cd /c/Users/Damian/Documents/GitHub/Togt && git fetch origin feat/fly-production-deploy:feat/fly-production-deploy
gh pr create --base main --head feat/fly-production-deploy \
  --title "feat(deploy): first production deploy to Fly.io + Neon" \
  --body "Ships TOGT to https://togt-api.fly.dev per the design at docs/superpowers/specs/2026-05-27-production-deployment-design.md and the plan at docs/superpowers/plans/2026-05-27-production-deployment-plan.md.

## What landed
- backend/Dockerfile (Node 20 multi-stage)
- backend/.dockerignore
- backend/fly.toml (lhr, shared-cpu-1x, auto-stop, /health check)
- mobile/src/services/api.js — API_BASE_URL flipped to https://togt-api.fly.dev
- docs/superpowers/runbooks/production-deploy-runbook.md
- CLAUDE.md Production section

## Deploy state at PR open
- Fly app togt-api: deployed, health-check passing
- Neon togt-prod / togt DB: schema migrated, empty
- HC.io togt-prod-api: receiving pings, status up
- Damian's admin user + admin API key minted, stored in 1Password
- Mobile production build smoke-tested on Android

## Out of scope
- Custom domain togt.co.za (deferred, follow-up plan)
- GitHub Actions auto-deploy (Phase 2 after first deploy proves stable)
- Production secrets rotation policy (separate Security-Safety runbook)"
```

---

## Task 16: Update george-brain bookkeeping (separate branch + PR)

**Files (george-brain repo):**
- Modify: `business/togt/MEMORY.md` § 1 Stable Current Facts
- Modify: `business/togt/INBOX.md` (move [2026-05-27-C] Open → Done)
- Modify: `memory/2026-05-27.md` (append `[T]` line)

**L-tier:** L1 — documentation updates.

- [ ] **Step 1: Branch off main on Windows george-brain**

```bash
cd /c/Users/Damian/Documents/GitHub/george-brain && git checkout main && git pull --ff-only && git checkout -b codex/togt-deploy-bookkeeping
```

- [ ] **Step 2: Update MEMORY.md § 1**

Edit `business/togt/MEMORY.md` § "Stable Current Facts". Find the line about backend hosting and replace:

Before:
> Backend lives on Mac mini as a launchd service (`com.togt.backend`, port 3002).

After:
> Backend production lives at `https://togt-api.fly.dev` (Fly.io app `togt-api`, region `lhr`, Neon Postgres `togt-prod/togt`, HC.io monitoring). Mac mini continues as dev/staging via launchd `com.togt.backend` on port 3002.

- [ ] **Step 3: Move INBOX [2026-05-27-C] Open → Done**

Edit `business/togt/INBOX.md`. Cut the `### [2026-05-27-C] Production deployment plan + first deploy` entry from `## Open` and paste under `## Done`. Update its body:

- `**Status:**` → `Done`
- `**Evidence:**` → add commit SHAs of feat/fly-production-deploy commits, the PR URL, the production URL, the HC.io check URL, the date
- `**Next action:**` → "None. Custom domain cutover is a separate INBOX item when togt.co.za is registered."

- [ ] **Step 4: Append `[T]` line to today's daily memory**

Edit `memory/2026-05-27.md` (create if it doesn't exist with the standard YAML front-matter and `# 2026-05-27` heading). Append at the end:

```markdown
- [T] production-deploy-phase-1: First TOGT production deploy shipped to https://togt-api.fly.dev on Fly.io + Neon Postgres + HC.io monitoring. Fresh-start data approach (empty DB). Damian's admin user + admin API key minted post-deploy. Mobile production build smoke-tested. Path B agent-native API surface now publicly reachable; external Claude/Operator/A2A integrations can hit /mcp. Custom domain togt.co.za deferred (non-blocking follow-up). PRs: github.com/DamianOost/Togt#4 (feat/fly-production-deploy), and this bookkeeping change. Free-tier only — R0/month at POC scale. INBOX [2026-05-27-C] moved to Done.
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Damian/Documents/GitHub/george-brain && git add business/togt/MEMORY.md business/togt/INBOX.md memory/2026-05-27.md && git commit -m "togt: bookkeeping — first production deploy shipped

- business/togt/MEMORY.md §1: backend now at togt-api.fly.dev (Fly+Neon+HC.io); Mac mini becomes staging
- business/togt/INBOX.md: [2026-05-27-C] Open → Done with evidence
- memory/2026-05-27.md: appended [T] line summarising the deploy"
```

- [ ] **Step 6: Push + open PR**

```bash
cd /c/Users/Damian/Documents/GitHub/george-brain && git push -u origin codex/togt-deploy-bookkeeping
gh pr create --base main --head codex/togt-deploy-bookkeeping --repo DamianOost/george-brain \
  --title "togt: bookkeeping — first production deploy shipped" \
  --body "Companion to DamianOost/Togt PR for the first production deploy.

Updates:
- business/togt/MEMORY.md §1 — production hostname togt-api.fly.dev
- business/togt/INBOX.md — moves [2026-05-27-C] Open → Done
- memory/2026-05-27.md — [T] line"
```

---

## Self-Review

**1. Spec coverage:** Every spec phase has a corresponding task:

| Spec phase | Plan task(s) |
|---|---|
| Phase 0 — Pre-flight | Task 1 (3 signups) |
| Phase 1 — Local prep | Tasks 2 (Dockerfile), 3 (.dockerignore), 4 (fly.toml), 5 (secrets gen) |
| Phase 2 — Infra spin-up | Task 6 (Fly + Neon), Task 7 (Fly secrets) |
| Phase 3 — Schema migration | Task 8 |
| Phase 4 — First deploy | Task 9 |
| Phase 5 — Identity bootstrap | Task 11 |
| Phase 6 — HC.io | Task 10 |
| Phase 7 — Mobile pointer | Task 12 |
| Phase 8 — Documentation | Tasks 13, 14, 16 |
| Future — Custom Domain | Out of scope of this plan (separate follow-up when togt.co.za registered) |

**2. Placeholder scan:** Execution-time placeholders (`<neon-pooled-url>`, `<64-hex>`, `<from-mac-env>`, `<accessToken-from-step-2>`, `<damian-phone>`, etc.) are intentional — the plan template; values come from 1Password / vendor consoles at execute time. No "TBD", no "implement later", no "similar to Task N".

**3. Type consistency:** App name `togt-api` consistent across all flyctl invocations. Region `lhr` consistent. Public URL `https://togt-api.fly.dev` consistent. Branch name `feat/fly-production-deploy` consistent. george-brain branch name `codex/togt-deploy-bookkeeping` consistent. The two-PR pattern (Togt PR + george-brain PR) explicit.

---

## Execution Handoff

This plan is **L3 across most steps** (vendor signups, secret minting, first deploy, prod identity bootstrap, infra writes). **Do not dispatch a subagent to execute autonomously.** Each Task 1, 5, 6, 7, 9, 11 step pauses for Damian's explicit in-conversation go-ahead before running.

The L1/L2 steps (file writes, .dockerignore, Dockerfile, fly.toml, schema migration on empty DB, runbook, MEMORY/INBOX updates) can run inline once their preceding L3 prerequisite is approved.

Recommended execution mode: **Inline execution via `superpowers:executing-plans` skill** with Damian present in the conversation, NOT subagent-driven. The plan is operational, not a code build — interactive checkpoints are the whole point.
