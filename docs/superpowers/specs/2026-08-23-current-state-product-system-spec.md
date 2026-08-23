# TOGT current-state product and system specification

**Date:** 2026-08-23

**Status:** Planning baseline; not production approval

**Owner:** Damian Oosthuyzen

**Canonical code baseline:** `origin/main` at `389c81d` when audited

## 1. Purpose

This specification replaces the fragmented mental model spread across the original project brief, March QA report, May handoffs, privacy design, and unmerged deployment documents.

It answers four questions:

1. What product is TOGT building?
2. What is implemented on current `main`?
3. What remains unsafe, incomplete, or unproven?
4. What must be true before a closed pilot or real-user launch?

When this document conflicts with current code, migrations, tests, Git state, or a newer approved specification, current verified evidence wins and this document must be updated.

## 2. Evidence snapshot

| Surface | Evidence observed on 2026-08-23 |
|---|---|
| GitHub default branch | `origin/main` at `389c81d`; PRs 1, 2, 5, and 6 merged |
| Open deployment documentation | PR 3 (deployment design) open; PR 4 (stacked implementation plan) open |
| Deployment implementation branch | `origin/feat/fly-production-deploy` is 21 commits behind and 5 commits ahead of `origin/main` |
| Current deployment convergence | Fresh task branch created from `389c81d`; May matrix, replacement config, and synthetic-preview runbook prepared locally; validation and Draft PR pending |
| Mac runtime | Healthy on port 3002 at branch HEAD `0564153`; `/health` and `/health/deep` respond |
| Public endpoint | `https://togt-api.fly.dev/health` did not resolve |
| Database schema | Migrations `001` through `016`, including audit log and customer-data safety |
| Tests present | 218 unit/integration declarations plus 7 smoke declarations by static inventory |
| Last recorded green run | 198 unit plus 7 smoke on the pre-privacy branch; current `main` needs a fresh full run |
| Agent surface | 16 MCP tools in the catalog, 21 OpenAPI paths, agents manifest lists 13 non-admin tools but omits `audit_log_query` |
| Mobile API target | `mobile/app.json` points at a private-LAN HTTP address; multiple services resolve base URLs independently |

## 3. Product definition

TOGT is a transactional South African marketplace connecting customers who need skilled labour with verified independent labourers who can perform the work.

TOGT is not a job board, generic delivery platform, payroll system, or social network. Its transaction is:

```text
discover or match -> quote/estimate -> book -> accept -> perform -> complete -> pay -> rate
```

The differentiator is a first-class agent channel. A trusted AI agent should be able to evaluate TOGT, estimate cost, request a match, track state, cancel safely, receive lifecycle events, and explain what happened without bespoke integration glue.

The agent channel is not the product by itself. The marketplace is only valuable when supply, trust, fulfilment, payment, payout, support, and dispute handling work for real people.

## 4. Actors and permissions

### 4.1 Customer

A customer can:

- register, authenticate, recover access, and complete KYC;
- browse verified available labourers or request an automatic match;
- see price/rate context before committing;
- create and cancel a booking within policy;
- track an accepted/in-progress labourer;
- coordinate through booking-scoped chat;
- confirm scope or respond to a change order;
- complete payment and rate the labourer;
- view only their own bookings, payments, messages, and agent/API activity.

### 4.2 Labourer

A labourer can:

- register, authenticate, and complete KYC;
- maintain skills, services, profile, rate, image, availability, and location;
- receive and accept/decline eligible work;
- see limited job context before acceptance and exact fulfilment details after acceptance;
- start and complete work;
- request scope changes through an explicit change order;
- see earnings and ratings;
- receive payment/payout information once a payout system exists.

### 4.3 Agent integrator

An agent can:

- discover the REST/OpenAPI and MCP interfaces;
- authenticate with a scoped API key;
- perform read-only discovery and estimation with `mcp:read_only`;
- create/cancel matches and manage owned webhook subscriptions with `mcp:full`;
- retry mutating actions safely using idempotency semantics;
- receive tenant-scoped, signed, at-least-once webhooks;
- query its own audit trail;
- never gain admin scope by implication.

### 4.4 TOGT operator

The operator can inspect marketplace health, audit events, stuck matches, disputes, and vendor/payment evidence. Production data, money, credentials, KYC mode, and destructive actions remain explicit human gates.

## 5. Recommended first-pilot boundary

This is a proposed focus for Damian to approve, not a silent change to product scope.

- Geography: Durban/Umhlanga service area.
- Supply: a deliberately small, manually onboarded cohort.
- Trades: plumbing first, with at most two additional categories after the flow is stable.
- Demand: invited customers only.
- Identity: sandbox/synthetic testing until the production KYC policy is approved; then verified pilot identities only.
- Payments: sandbox or operator-observed test transactions until settlement, refunds, disputes, and labourer payout are proven.
- Agent channel: one operator-owned integration key first; no third-party production keys during the initial pilot.
- Capacity: one backend instance until matcher, rate-limit, and worker-process state are redesigned for multiple instances.

The purpose of the pilot is to prove one complete job lifecycle repeatedly, not to maximize listings or geographic coverage.

## 6. Functional specification

### 6.1 Authentication and account lifecycle

Implemented:

- customer/labourer registration and login;
- short-lived access tokens and rotating refresh tokens;
- server-side refresh-token revocation and logout;
- silent mobile refresh and secure token storage;
- password-reset request and completion.

Required before live pilot:

- account deletion/deactivation policy and non-destructive implementation;
- support identity and recovery procedure;
- explicit handling for compromised sessions and devices;
- production email/domain configuration and delivery evidence.

### 6.2 KYC and trust

Implemented:

- structural South African ID validation;
- optional VerifyNow `said_verification` call;
- KYC status and provider metadata;
- raw-ID minimization, last-four display, keyed blind index, and privacy audit points;
- mobile ID/selfie flow.

Launch blockers:

- VerifyNow errors currently fail open to structural-only `verified` status;
- selfie enrolment is a POC/manual-review stub and does not prove liveness or identity match;
- production demo controls are not separated from the release experience;
- final KYC/manual-review/retry policy is not documented or tested;
- real-person processing requires approved privacy, vendor, retention, and support procedures.

Production behavior must use `pending_review` or fail closed when authoritative verification is unavailable. Structural validation alone must never confer the same trust state as a successful production identity check.

### 6.3 Discovery and matching

Implemented:

- geographic labourer discovery with skill/radius filters;
- automatic match requests and ranked candidate attempts;
- Socket.io delivery/acceptance path;
- stale pending recovery and race-safe acceptance;
- approximate-location and pre-acceptance privacy rules.

Constraints:

- the dispatcher uses process-local pending promises;
- rate limits are process-local;
- the first deployment must remain single-instance unless shared coordination is implemented;
- stale supply, no-answer, retry, and customer-facing timeout behavior need pilot evidence.

### 6.4 Booking and scope

Booking states:

```text
pending -> accepted -> in_progress -> completed
pending|accepted -> cancelled
```

Implemented:

- direct booking and match-generated booking;
- role-gated transitions;
- schedule validation;
- state-based detail reveal;
- scope confirmation and change orders;
- ratings after completion;
- booking lifecycle notifications and events.

Required:

- cancellation/no-show/refund policy aligned with actual code;
- dispute state and operator evidence path;
- explicit customer acceptance for price/scope changes;
- consistent RFC 9457 behavior across legacy route trees;
- pilot usability evidence for the full human flow.

### 6.5 Location, chat, and notifications

Implemented:

- labourer location updates and booking-scoped live tracking;
- state-based location reveal and stale-location handling;
- booking chat and Socket.io broadcast;
- Expo push registration and booking/match notifications;
- selected offline persistence helpers.

Required:

- production background-location behavior and consent evidence;
- notification behavior in a development/production build, not only Expo Go;
- chat retention/moderation/support policy;
- a single mobile API/socket base-URL resolver;
- release builds that reject HTTP and private-LAN targets;
- measured behavior during network loss, restart, and reconnection.

### 6.6 Payments and payouts

Payment states:

```text
pending -> paid|failed|refunded
```

Implemented:

- Peach checkout initiation;
- webhook signature code and server-side payment verification;
- payment lifecycle records and events;
- cash-payment fallback;
- labourer earnings views.

Launch blockers:

- Peach's exact production webhook signature contract still needs vendor confirmation and a production-like fixture;
- refund/dispute/chargeback behavior is not proven;
- cash marking and operator reconciliation policy are not defined for live use;
- labourer payout is not implemented;
- no payout ledger or payout state machine exists;
- real money movement requires an explicitly approved provider integration, reconciliation, and rollback procedure.

TOGT must not call the marketplace economically complete until a completed job can be reconciled from customer payment through platform state to labourer payout.

### 6.7 Agent-native interface

Implemented:

- RFC 9457 problem details;
- idempotency middleware;
- scoped API keys;
- MCP Streamable HTTP and stdio transports;
- agent discovery manifest;
- OpenAPI 3.1 document;
- tenant-scoped signed webhooks with retry, replay, rotation, and dead-letter behavior;
- audit log and `audit_log_query`;
- privacy serializers for agent-facing results.

Contract gaps:

- OpenAPI describes 21 paths but omits several mounted application route trees;
- the agents manifest omits `audit_log_query`;
- versioning and compatibility policy are not explicit;
- external partner onboarding, key approval, revocation, and incident processes do not exist;
- the interface is not reachable on a public HTTPS hostname.

The REST, MCP, webhook, and manifest descriptions must derive from one reviewed contract or be checked for drift in tests.

## 7. Data protection and reveal rules

### Public labourer discovery

May reveal display name, avatar, skills, hourly rate, bio, availability, rating, distance, and approved verification badge.

Must not reveal raw ID, KYC fields, contact details, or exact current coordinates.

### Before labourer acceptance

May reveal skill, scheduled time, hours estimate, broad area, and estimated amount.

Must not reveal full address, exact coordinates, customer contact details, or unnecessary notes.

### Accepted or in-progress booking

The assigned labourer may receive the exact address, job coordinates, customer display name, and phone needed for fulfilment. The customer may receive the assigned labourer's contact/location details required for fulfilment.

### Webhooks, MCP, logs, and audit metadata

Default to IDs, states, timestamps, amount/currency, and non-sensitive summaries. Do not include credentials, tokens, raw IDs, full addresses, exact coordinates, phone/email, raw notes, or raw vendor payloads without a separately approved need and scope.

### Retention

Retention periods remain a launch decision. At minimum, define and implement retention for refresh tokens, password-reset rows, webhook payloads, chat, location, audit metadata, KYC/vendor references, ratings/comments, payment references, and uploaded media.

## 8. Architecture and operating model

```text
Expo mobile clients
        |
        | HTTPS + Socket.io
        v
Node/Express API + MCP + background workers
        |
        +--> PostgreSQL
        +--> Peach Payments
        +--> VerifyNow
        +--> Cloudinary
        +--> Expo Push
        +--> Resend
        +--> signed customer/agent webhooks
```

The first public preview should use one application instance. Multi-instance operation requires shared matcher coordination, distributed rate limiting, explicit worker leadership/leases, and concurrency verification.

## 9. Non-functional requirements

### Security

- production startup fails on missing or malformed core secrets;
- HTTPS-only external communication;
- explicit CORS allowlist;
- SSRF protection for outbound webhooks;
- scoped API keys and least privilege;
- password/token/key hashes at rest; webhook secrets encrypted at rest;
- no secrets or PII in Git, Markdown, logs, errors, audit metadata, or PR evidence;
- no unsigned production payment-state mutation.

### Reliability

- idempotent mutating requests;
- transactional event creation;
- at-least-once webhook delivery with receiver deduplication;
- clean shutdown and recoverable workers;
- liveness and readiness probes;
- rollback point and migration evidence before deployment;
- single-instance constraint enforced until distributed state exists.

### Observability

- liveness, database, dispatcher, and sweeper health;
- audit trail for authenticated REST and MCP actions;
- delivery logs without secrets/PII;
- alerts for public endpoint, readiness failure, webhook backlog, stuck matches, payment mismatch, and KYC vendor failure;
- deployed commit recorded separately from merged commit.

### Performance and accessibility

- data-light mobile behavior for South African networks;
- reconnect/retry behavior that does not duplicate bookings or payments;
- plain-language, low-jargon copy;
- usable tap targets, readable contrast, and non-color-only status cues;
- measured pilot targets for match latency, API latency, crash-free sessions, and completion rate.

## 10. Readiness classification

| Capability | Status | Meaning |
|---|---|---|
| Core human booking flow | Built, needs current regression/pilot proof | Code exists; full current test run and device evidence pending |
| Agent-native API | Built, contract drift remains | Strong technical moat; public reachability and contract completion pending |
| Privacy hardening | Implemented on `main`, not runtime-proven | Migration/code/docs merged; Mac runtime is older |
| KYC | POC only | Cannot support real users until fail-open and selfie policy are fixed |
| Customer payment | Integrated, not production-proven | Vendor contract and reconciliation evidence pending |
| Labourer payout | Missing | Live marketplace economic loop is incomplete |
| Public deployment | Not live | Hostname still does not resolve; a replacement candidate exists only on the isolated convergence branch and is not deployment approval |
| Mobile release | Not ready | API configuration, builds, store, and device evidence pending |
| Legal/POPIA operations | Draft | Publication, operator, retention, and incident contacts pending |
| Support/disputes | Unspecified | Closed pilot needs an operator playbook |

## 11. Go/no-go gates

### Public technical preview, synthetic data only

- fresh branch based on current `origin/main` contains reviewed deployment configuration;
- all migrations apply to a disposable target database;
- exactly one always-running application instance is enforced until process-local coordination is redesigned;
- current unit and smoke suites pass with timings recorded;
- production configuration includes every current required secret name, including `PII_BLIND_INDEX_KEY`;
- mobile and agent clients point to the same HTTPS base URL;
- `/health`, `/health/deep`, OpenAPI, agents manifest, MCP, auth, webhooks, and audit query pass;
- deployed evidence maps the approved `origin/main` commit to the provider release and exact image reference;
- rollback is rehearsed;
- no real identities, money, customer records, or third-party API keys are used without separate approval.

### Closed human pilot

In addition to the technical-preview gates:

- KYC is fail-closed/pending-review and the selfie/manual-review policy is honest;
- privacy notice, operator review, retention, access, incident, support, cancellation, dispute, and refund procedures are approved;
- production mobile build is tested on supported devices and networks;
- payment reconciliation and labourer payout path are proven end to end;
- invited supply and customers are trained and supported;
- explicit Damian approval covers the pilot cohort and exact live actions.

### General availability

Requires evidence from the closed pilot, public support/terms/privacy surfaces, scalable operational controls, monitored backup/restore, multi-instance design if needed, fraud/abuse handling, and a reviewed commercial/legal model.

## 12. Decisions for Damian

1. Approve or change the proposed Durban/Umhlanga, plumbing-first closed-pilot boundary.
2. Decide whether the next milestone is a synthetic public technical preview or a human closed pilot. The recommended next milestone is the synthetic preview.
3. Decide the production KYC posture: authoritative verification plus pending manual review on vendor failure is recommended.
4. Choose and approve the labourer payout provider/flow before real-money launch.
5. Confirm whether cash is a pilot payment method or should be removed from the live path.
6. Decide whether PRs 3 and 4 should be closed as superseded once a current deployment plan is approved.
7. Approve current vendor choices only after cost, region, data-processing, backup, and operational assumptions are revalidated.

## 13. Deployment convergence update

The 2026-08-23 convergence audit keeps the May Docker/Fly intent but replaces its executable configuration and operating assumptions. The current evidence is recorded in:

- `docs/deployment/2026-08-23-may-convergence-matrix.md`;
- `docs/runbooks/synthetic-preview-deployment.md`;
- `backend/Dockerfile`, `backend/.dockerignore`, and `backend/fly.toml` on the convergence branch.

Key corrections are Node 24 LTS instead of EOL Node 20, a non-root narrowly copied image, Johannesburg as the proposed compute region, removal of unverified free-tier claims, no scale-to-zero while workers are process-local, release-command migrations through 016, the current six-name production startup contract, deep-health routing readiness, and explicit deployed-commit/image evidence.

The candidate remains blocked from deployment pending review, container build/runtime proof, remediation of the current production dependency audit (27 advisories: 1 critical, 16 high, 10 moderate), PR #7 landing before the dependent deployment PR, Damian’s milestone/provider/first-deploy approvals, mobile endpoint unification, and any access control needed to keep a public preview synthetic-only. PRs #3 and #4 and the old feature branch remain historical inputs and have not been merged, closed, or deployed.

Local PostgreSQL 17.11 evidence on Windows is green: migrations 001–016 applied twice to an empty `togt_test` database, 20 tables and all five migration-016 fields were verified, focused readiness tests passed 17/17, the full backend suite passed 218/218 after fixing a pre-existing `/tmp` portability defect, and smoke passed 7/7. This is one current run, not the later three-cold-run release-candidate gate. The suite emits a `pg` query-overlap deprecation warning that must be tracked before a future pg 9 upgrade.
