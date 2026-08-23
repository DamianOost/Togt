# TOGT recovery-to-pilot execution plan

**Date:** 2026-08-23

**Status:** Proposed

**Owner:** Damian Oosthuyzen

**Target milestone:** Public technical preview using synthetic data, followed by an explicitly approved closed human pilot

## 1. Outcome

Turn the current advanced POC into one coherent, testable, deployable baseline without discarding the valuable May work or pretending that the old deployment branch is current.

The sequence is:

```text
converge Git truth
    -> close launch-critical code/config gaps
    -> prove current tests and contracts
    -> deploy synthetic-data preview
    -> prove operations and rollback
    -> close human/legal/money gates
    -> run small invited pilot
```

Do not resume the May deployment plan at secret generation or first deploy. The code and privacy model changed after that plan was written.

## 2. Operating constraints

- Build each editing task in its own worktree and `codex/...` branch from current `origin/main`.
- Merge foundation tasks before dependent deployment/mobile work.
- Run automated backend tests only against `togt_test` or a disposable database.
- No production vendor changes, credentials, schema migration, real-person KYC, real customer data, or money movement without Damian's exact approval.
- No force pushes, destructive production deletes, or security/KYC bypasses.
- A merged commit and a deployed commit are separate evidence.
- Preserve open PRs 3 and 4 until their useful decisions have been incorporated or Damian chooses to close them.

## 3. Phase 0 — establish the project and decision baseline

**Authority:** L0/L1

**Goal:** make future tasks load one current context automatically.

### Task 0.1 — Register the Windows project

- Add `C:\Users\PadelZone\Documents\GitHub\Togt` as a local Codex project.
- Make that repository the primary folder.
- Keep `george-brain` as a separate project; do not attach it as TOGT's primary repository.
- Confirm new tasks discover root `AGENTS.md`.

Acceptance:

- TOGT appears separately in the Codex project list;
- a new task starts in the TOGT folder and sees the repository instructions;
- `git status --short --branch` reports `main...origin/main` in the canonical checkout.

### Task 0.2 — Approve the milestone and pilot boundary

Damian decides:

- synthetic public preview first (recommended) or immediate closed human pilot;
- Durban/Umhlanga and plumbing-first pilot scope;
- whether cash remains in the future live flow;
- desired KYC fail-closed/manual-review behavior;
- payout-provider decision path.

Acceptance:

- decisions are written into the specification or a superseding dated decision record;
- no implementation assumes an unapproved live-user or payment scope.

## 4. Phase 1 — converge repository truth

**Authority:** L1; merge is L2 and requires review

**Goal:** produce one current deployment candidate based on privacy-hardened `main`.

### Task 1.1 — inventory and retire branch ambiguity

- Fetch and map `origin/main`, PR 3, PR 4, and `origin/feat/fly-production-deploy`.
- Record which decisions/configuration remain valid.
- Compare the deployment branch against current migrations, secret inventory, health checks, and mobile configuration.
- Do not merge or deploy the old feature branch directly.

Acceptance:

- a short convergence note lists each reusable commit/file and each obsolete assumption;
- the 21-behind/5-ahead divergence is resolved deliberately, not by force-push or history rewrite.

### Task 1.2 — recreate deployment work on current `main`

- Create a fresh deployment task branch from current `origin/main`.
- Reapply or rewrite `backend/Dockerfile`, `backend/.dockerignore`, and deployment configuration after review.
- Ensure the container runs as a non-root user where supported, receives termination signals, exposes the correct port, and excludes tests/docs/env files from the runtime image.
- Preserve a single-instance configuration until distributed matcher/rate-limit/worker coordination exists.
- Add a current production runbook and rollback procedure.

Acceptance:

- deployment diff is based on current `main`;
- image builds reproducibly;
- container starts with synthetic/test configuration and serves health endpoints;
- no secret value or private data exists in the image or diff;
- rollback target and commands are documented.

### Task 1.3 — reconcile deployment documentation

- Rewrite the May design/plan against current code.
- Include `PII_BLIND_INDEX_KEY` and every current production-required variable.
- Remove expired account/session details and unverified cost/free-tier claims.
- Treat provider, region, cost, backup, and data-processing assumptions as revalidation gates.
- After a replacement PR is approved, ask Damian whether PRs 3 and 4 should be closed as superseded.

Acceptance:

- one current deployment plan exists on a branch based on `main`;
- no step instructs the operator to deploy an older branch;
- L3 actions are clearly separated from preparatory L1 work.

## 5. Phase 2 — close public-preview blockers

**Authority:** L1; vendor/production actions remain L3

**Goal:** make synthetic public deployment technically safe and observable.

### Task 2.1 — make KYC honest and fail-safe

- Add a state such as `pending_review` if the current schema/API cannot express vendor outage/manual review honestly.
- Change VerifyNow network/quota/5xx failure from structural-only `verified` to retryable/pending-review behavior.
- Separate structural validity from authoritative identity verification.
- Replace the selfie endpoint's unconditional success with an explicit POC/manual-review result, or implement the approved vendor/manual-review flow.
- Hide/remove demo selfie controls in production builds.
- Add tests for configured success, authoritative failure, vendor outage, unconfigured preview mode, raw-ID disposal, blind-index behavior, and response/audit redaction.

Acceptance:

- a vendor outage cannot create a production `verified` identity;
- the UI never claims biometric verification when none occurred;
- privacy/KYC tests prove raw IDs are not retained or emitted;
- launch mode and sandbox mode are distinguishable in configuration and UX.

### Task 2.2 — unify mobile endpoint configuration

- Create one shared resolver for HTTP API and Socket.io base URLs.
- Use an environment-driven value for preview/release builds.
- Reject HTTP, localhost, and private-LAN targets in non-development builds.
- Remove duplicate fallback logic from image upload, chat, match socket, and location socket services.
- Document local LAN development separately from release configuration.

Acceptance:

- every mobile network client resolves the same base URL;
- release configuration uses HTTPS;
- a production build cannot silently point at the Mac mini or localhost;
- unit/config checks cover dev, Expo Go, preview, and production behavior.

### Task 2.3 — complete the agent contract

- Reconcile actual mounted routes, OpenAPI paths, MCP catalog, and `agents.json`.
- Add `audit_log_query` to the public non-admin tool manifest.
- Decide whether legacy REST route trees are documented, deprecated, or removed in a later compatibility release.
- Add contract tests that fail when mounted public routes or MCP tools drift from the published descriptions.
- Add an explicit API/agent contract version and compatibility policy.

Acceptance:

- published OpenAPI and agent metadata match the supported public surface;
- admin-only tools remain absent from public capability advertising unless explicitly authorized;
- privacy reveal rules are identical across REST and MCP serializers;
- drift tests are green.

### Task 2.4 — prove payment integrity without moving real money

- Confirm Peach's exact webhook signature header, payload, encoding, and verification call with current official/vendor material.
- Build production-like fixtures for valid, invalid, missing, replayed, and out-of-order webhooks.
- Verify an attacker cannot mark an arbitrary checkout paid.
- Define how cash payment is authorized and reconciled, or exclude it from the preview/live route.
- Define refund/dispute/payment-reconciliation states and operator evidence.

Acceptance:

- payment webhook behavior is verified by deterministic tests;
- unsigned or invalid production callbacks cannot mutate payment state;
- sandbox payment states reconcile with bookings and emitted events;
- no real funds move in this phase.

### Task 2.5 — re-run security and privacy launch checks

- Verify CORS, rate limiting, SSRF, auth boundaries, API-key scopes, idempotency, webhooks, audit metadata, serializer reveal rules, and production secret guards.
- Confirm the target deployment remains single-instance.
- Scan the repository and image context for secrets and historical raw data.
- Resolve any P0/P1 finding before preview deployment.

Acceptance:

- no critical/high launch blocker remains open;
- findings and fixes have test evidence;
- static and dependency review results are recorded without exposing sensitive output.

## 6. Phase 3 — establish a green release candidate

**Authority:** L1

**Goal:** prove the current branch rather than relying on May's test count.

### Task 3.1 — provision isolated test dependencies

- Install backend and mobile dependencies from lockfiles.
- Configure a disposable `togt_test` PostgreSQL database.
- Apply migrations `001` through the latest migration from zero.
- Confirm automated tests cannot resolve to the production-equivalent `togt` database.

Acceptance:

- dependency installation is reproducible;
- schema bootstrap is green from an empty database;
- test database identity is visible in test logs without credentials.

### Task 3.2 — run cold backend and smoke verification

- Run the full unit/integration suite three cold times.
- Reset the test database as required between runs.
- Run the smoke suite three cold times.
- Record exact test/suite counts, timings, and any flake.
- Fix flakes instead of rerunning until green.

Acceptance:

- all three unit runs and all three smoke runs pass;
- no cross-test environment pollution or order dependence remains;
- the final handoff records the new verified baseline.

### Task 3.3 — verify mobile build quality

- Run `npm ci` and `npx expo-doctor`.
- Produce a development/preview build using the unified HTTPS configuration.
- Exercise customer and labourer flows on supported Android hardware.
- Verify notifications, deep links/navigation, token refresh, network loss/recovery, location consent, background behavior, and secure-session restore.

Acceptance:

- a repeatable preview build exists;
- no production build points at HTTP/private LAN;
- a device evidence checklist covers both roles;
- critical accessibility/usability defects are resolved or explicitly block the pilot.

## 7. Phase 4 — deploy a synthetic public technical preview

**Authority:** L3 for vendor setup, secrets, database migration, and first deploy

**Goal:** prove public reachability and operations with synthetic data only.

### Gate 4.0 — Damian approval package

Present one package containing:

- chosen compute/database/monitoring providers and current costs;
- data-processing regions, backups, access, and rollback posture;
- exact secret names to generate/set, never values;
- branch/commit and green test evidence;
- migration/rollback commands;
- synthetic data policy;
- expected public hostname and monitoring checks.

No vendor write, secret generation, migration, or deploy occurs until Damian approves the exact package.

### Task 4.1 — create preview infrastructure

- Create the approved compute and database resources.
- Generate and store fresh secrets through the approved password manager/secret channel.
- Apply migrations to an empty preview database.
- Deploy the reviewed commit.
- Record resource IDs and deployed commit without copying credentials.

### Task 4.2 — cutover verification

Prove:

- DNS and TLS;
- `/health` and `/health/deep`;
- OpenAPI and agents manifest;
- registration/login/refresh/logout with synthetic users;
- KYC preview behavior without real IDs;
- match to booking lifecycle;
- payment sandbox behavior;
- webhook signing/delivery/replay;
- MCP read/write boundary and idempotent retry;
- audit query and PII redaction;
- logs and alerts;
- rollback to the prior release.

Acceptance:

- every cutover check has timestamped evidence;
- rollback is proven, not merely documented;
- only synthetic data exists;
- the Mac service is clearly labelled development and is not mistaken for production.

## 8. Phase 5 — close human-pilot gates

**Authority:** mostly L3; legal interpretations route to the legal owner

**Goal:** make a small real-user pilot supportable and economically complete.

### Task 5.1 — complete POPIA and user-facing governance

- Finalize entity/operator details, Information Officer posture, privacy notice, terms, consent, retention schedule, access/correction/deletion procedure, and incident contacts.
- Review data-processing arrangements for hosting, database, payments, KYC, media, notifications, and email.
- Define non-destructive account closure/anonymization behavior.

### Task 5.2 — implement the payout and reconciliation loop

- Select the approved payout provider and contract.
- Design payout ledger/states, retries, reconciliation, fees, failed payouts, refunds, chargebacks, and support evidence.
- Implement in sandbox/test mode first.
- Prove customer payment through labourer payout with no double-pay or stranded-money path.

Suggested payout states:

```text
not_due -> eligible -> queued -> processing -> paid
                     -> failed -> retry_pending
                     -> held|reversed
```

The final states must follow the selected provider and finance/legal model.

### Task 5.3 — define marketplace operations

- invitation/onboarding checklist for labourers and customers;
- support intake and service hours;
- cancellation, no-show, scope-change, refund, dispute, safety, and deactivation procedures;
- operator dashboard or minimum auditable admin workflow;
- daily reconciliation and health checklist;
- pilot stop conditions and incident escalation.

### Task 5.4 — build and approve the release mobile app

- production bundle/package identity and signing;
- privacy/permission copy;
- push credentials;
- background-location behavior;
- store/internal-distribution route;
- release rollback and forced-upgrade policy.

## 9. Phase 6 — invited pilot and evidence review

**Authority:** L3; exact cohort and start require Damian approval

**Goal:** prove repeated real fulfilment safely at small scale.

Start only when every Phase 5 gate is accepted.

Measure at minimum:

- invited/verified labourers and customers;
- successful matches and median match-to-accept time;
- booking completion/cancellation/no-show rates;
- price/scope changes and disputes;
- payment and payout reconciliation accuracy;
- notification and location reliability;
- support contacts and time to resolution;
- API/MCP errors and idempotent replays;
- privacy/security incidents;
- crash-free mobile sessions.

Use pre-agreed stop conditions for identity, payment/payout, location/privacy, safety, or reconciliation failures.

At the end, choose one:

- continue the pilot with a bounded improvement list;
- pause and fix a failed gate;
- expand one dimension (trade, geography, cohort, or agent partner), never all simultaneously;
- stop and preserve evidence.

## 10. Recommended landing order

1. Documentation baseline (`AGENTS.md`, current spec, plan, handoff, KYC/project brief corrections).
2. KYC trust-state and tests.
3. Mobile endpoint unification.
4. Agent contract completeness and drift tests.
5. Payment integrity fixtures/policy.
6. Deployment configuration rebuilt on latest `main`.
7. Full cold verification and preview build.
8. Approved synthetic public deployment.
9. POPIA/operations/payout work.
10. Approved closed pilot.

Each item gets its own branch/worktree and PR unless two items are inseparable and the PR remains reviewable.

## 11. Immediate next task

After Damian reviews this baseline, start a new TOGT task for **Phase 1: deployment convergence**. The task should:

1. fetch current `origin/main` and the three deployment branches;
2. write a short commit/file keep-or-replace matrix;
3. create a fresh deployment branch from `origin/main`;
4. port only the reviewed Docker/Fly/runtime decisions;
5. update the deployment plan for migration 016, `PII_BLIND_INDEX_KEY`, the mobile base URL, and current verification gates;
6. build and test locally without performing vendor or production writes.
