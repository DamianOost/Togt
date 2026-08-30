# TOGT Grounded Momentum — accelerated full-build plan

| Field | Value |
|---|---|
| Date | 2026-08-23 |
| Status | Approved execution plan; implementation and release evidence pending |
| Owner/release authority | Damian Oosthuyzen |
| Governing specification | `docs/superpowers/specs/2026-08-23-togt-grounded-momentum-master-spec.md` |
| Implementation handoff | `docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-handoff.md` |
| Execution profile | Sol-class agentic implementation with parallel lanes and one integration owner |

## 1. Outcome

Build the complete Grounded Momentum product from the existing working APK/source baseline through Phase 4 without restarting the application, editing the APK binary, or reopening settled product scope.

The execution sequence is:

```text
existing APK/source baseline
→ higher-version P0-Triage APK
→ reliability spine + Grounded Momentum foundation
→ paired customer/minimum-worker marketplace slice
→ complete worker, money, trust and operations
→ bounded AI and live-status differentiation
→ evidence-gated release candidate
```

Time is compressed through reuse, parallel implementation and automated verification. Acceptance gates remain evidence-based. Provider provisioning, physical devices, legal/finance decisions and operated safety/payment checks retain their real wall-clock constraints and block only the affected capability.

## 2. Authority and safety boundary

- All implementation uses isolated worktrees and `codex/...` branches. No task commits to `main`.
- `origin/main` is the canonical integration base. The readiness commit is reviewed and ported/landed deliberately; it is not assumed merged.
- No production deployment, real-person KYC, real customer data, money movement, vendor configuration, production secret or production schema action is authorized by this plan.
- Synthetic development/test data is the default through the public technical-preview gate.
- Unsupported payment, payout, KYC, push, maps, background tracking, public sharing and SOS capabilities remain truthfully off.
- Customer and worker lifecycle slices land together when one side's action requires the other side to be real.
- Shared navigation roots, DTO/schema versions, lifecycle state machines and migration numbers have one integration owner.

## 3. Recorded starting point

### Source

| Item | Value |
|---|---|
| Canonical base | `origin/main` at `389c81dcf21829472dfd174fadaff00a2cbf0721` when this plan was written |
| APK-readiness source | `codex/mobile/internal-apk-readiness-2026-08-23` |
| Readiness commit | `66cd45822e4958edc5be97af418bc4f674ce932f` |
| Existing review | Draft PR 9; not merged at plan creation |

Commit `66cd458` already centralizes the mobile API/realtime/upload base URL, adds configuration and wiring tests, adds a release configuration/export path, removes the missing notification icon reference and repairs selected socket/listener access. The full build reuses that work after convergence; it does not duplicate it blindly.

### Installed-test artifact

| Item | Value |
|---|---|
| Filename | `TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk` |
| Package/version | `za.togt.app`, `1.0.0` (`versionCode 1`) |
| ABI/platform | `arm64-v8a`; minimum SDK 24; target/compile SDK 36 |
| SHA-256 | `604E6F1F7E6518F5F430745E2ED63260FD70E2716EA0D8FFB70CB4E28B8228E2` |
| Signer SHA-256 | `FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C` |
| Distribution | Approved Development artifact store |
| Confidence | Internal synthetic/private-LAN test only; no connected-device launch smoke was available during build |

The artifact was built locally with a portable Microsoft JDK 17 and Android SDK/Gradle toolchain. It was zip-aligned, signature-verified, inspected for package/SDK/ABI metadata and confirmed to contain a standalone JavaScript bundle. Expo Go, an Expo account and EAS cloud build were not used.

### Already-proven preparation

- Local portable Android toolchain and successful release assembly.
- Existing mobile `npm ci`, 12/12 configuration tests and 18/18 Expo Doctor checks.
- Development backend `/health` and `/health/deep` green at the time of the APK build.
- Unified mobile endpoint work available on the readiness branch.
- Baseline APK checksum, package, signer, ABI and artifact location recorded.

### Still unproven at the start

- Physical-device clean install, upgrade install, cold launch and paired-role smoke evidence.
- A higher `versionCode` successor using the same signer.
- Resolution of the known crash, navigation, unintended mutation and truthfulness defects.
- Public HTTPS/WSS preview, remote push, restricted Maps/Places keys, Peach sandbox reconciliation, production-grade KYC, operated SOS and payout.

### Current P0 correction — 2026-08-30

The implemented fresh-customer intake is blocked at Address because it exposes no path to a dispatch-safe location source. This is a release blocker, not a location-quality enhancement. Execute the pin-first contract—including LOC-00A's additive server provenance bridge—in `docs/superpowers/specs/2026-08-30-togt-address-pin-funnel-unblock-spec.md` before treating the customer booking funnel as internally beta-complete. Search/geocoding follow later and must not block the exact-pin route.

## 4. Ten-star build bar

Every wave must leave TOGT more truthful and more testable. A feature is not accepted because its happy-path screen renders.

The build bar requires:

1. one authoritative state and commercial snapshot;
2. no action without a real handler, acknowledgement and failure path;
3. no unsupported trust, money, location or safety claim;
4. paired customer/worker behaviour for shared lifecycle steps;
5. deterministic retries, idempotency and race handling;
6. compact Android, 200% text, TalkBack and weak-network evidence;
7. observable provider/background work with PII-safe logs;
8. an installable signed candidate, immutable build/evidence records, exact-hash approval, promoted bytes and rollback point at each release gate;
9. capability flags/kill switches for incomplete or externally blocked work;
10. exact automated and physical-device evidence attached to the owning ticket.

## 5. Parallel execution topology

Keep up to four active lanes with one integration controller:

| Lane | Primary ownership |
|---|---|
| Integration/release | Shared contracts, branch convergence, conflict control, builds, evidence, landing order and rollback |
| Backend/data/operations | Lifecycle, migrations, idempotency/outbox, matching, Peach/payment/payout, KYC, safety and staff controls |
| Customer mobile/design | Tokens/components, customer shell, intent/brief, selection, Project Hub, payment and retention |
| Worker/platform/QA | Worker shell/fulfilment, auth/realtime/push/location/media platform services, E2E and device automation |

During early P0 work, the fourth lane prioritizes QA automation and truth-fence review. Lane ownership may rotate after a wave, but two agents never edit the same worktree or shared high-conflict file concurrently.

## 6. Wave 0 — converge and lock

### Goal

Create one reviewable implementation base without losing the installed-test artifact or silently mixing unrelated branches.

### Work

- Commit and review the master specification, concept board and this plan.
- Preserve the canonical checkout's untracked source assets until their hashes and committed copies are proven.
- Review the exact readiness diff at `66cd458` against current `origin/main`.
- For the P0 implementation task, create a fresh branch from then-current `origin/main` and port the readiness commit deliberately if PR 9 has not landed. Mark PR 9 as a dependency or superseded only through an explicit review decision.
- Freeze `za.togt.app`, the current signer fingerprint and the first successor target at `versionCode 2`; use the next higher unused code if an intervening approved artifact consumes it.
- Freeze the P0 capability defaults: private-LAN development only; Peach/push/KYC/SOS/public-share/background-tracking off unless their stated gate passes.
- Record synthetic fixtures, backend commit/runtime, target physical device and artifact destination.

### Exit evidence

- approved spec SHA and implementation base SHA;
- preserved v1 APK and checksum;
- clean isolated implementation worktree;
- same-signer upgrade strategy and `versionCode > 1`;
- capability matrix and fixture/device record;
- no product scope reopened.

## 7. Wave 1 — P0-Triage successor APK

P0-Triage is one focused accelerated execution session. Tickets run in the dependency order below; independent tickets execute in parallel.

```text
P0T-00 → P0T-01
              ├→ P0T-02 ─┐
              ├→ P0T-03 → P0T-04 ─┐
              └→ P0T-05 ──────────┼→ P0T-06 → P0T-07
                                   ┘
```

### P0T-00 — Lock implementation base and release identity

**Scope**

- Execute Wave 0 convergence for the code task.
- Record base/readiness commits, dependency lockfiles, local toolchain versions and backend runtime/fixture boundary.
- Preserve v1 and assign the first successor target `versionCode 2`, or the next higher unused code if required.
- Verify access to the same internal signing key before implementation depends on upgrade installation.

**Acceptance**

- Branch starts from current `origin/main` and contains only the reviewed readiness delta plus P0 work.
- Package, version, signer, ABI target, build command and rollback artifact are recorded.
- Existing source and APK evidence remain recoverable.

### P0T-01 — Make the local APK pipeline repository-reproducible

**Scope**

- Keep local Gradle as the default internal build path; EAS remains optional.
- Add documented environment validation, prebuild/Gradle command, ABI selection, signing input and deterministic artifact naming.
- Keep one runtime resolver for REST, realtime, chat, matching and uploads.
- Fail release configuration on insecure/missing enabled-provider inputs while allowing labelled development LAN HTTP.

**Acceptance**

- `npm ci`, configuration tests, Expo Doctor and production export pass.
- The local command creates an aligned, signed installable APK without Expo Go/EAS.
- Output manifest records package/version/commit/config class/ABI/signer/checksum.
- No production/preview bundle contains localhost or private-LAN fallback.

### P0T-02 — Stabilize startup, auth and bounded failure states

**Scope**

- Restore SecureStore tokens, fetch `/api/auth/me`, single-flight refresh and resolve the authorized role before rendering its shell.
- Replace startup/endless spinners with bounded offline/retry/error states.
- Prevent stale cached identity or role from becoming authoritative.
- Add focused tests for clean launch, valid restore, expired token, refresh failure, offline cold start and logout cleanup.

**Acceptance**

- No wrong-role flash or startup crash.
- Auth failure reaches a usable sign-in/retry state.
- Offline cold start states exactly what is cached/unavailable.
- Token refresh creates one request/effect.

### P0T-03 — Type and repair the critical navigation matrix

**Scope**

- Introduce TypeScript route/parameter contracts for touched customer, worker and shared roots.
- Pass stable IDs rather than mutable full objects.
- Repair Discover/Profile, booking/payment/scope, worker offers/active job, chat back and notification/deep-link entry.
- Remove duplicate route registration and native/custom headers in the touched matrix.

**Acceptance**

- Type checking rejects missing/wrong critical route parameters.
- Zero unhandled-navigation warnings in the triage matrix.
- Every detail flow returns to a valid authorized destination.
- A stale notification fetches authoritative state before navigation.

### P0T-04 — Repair confirmed crashes and unintended mutations

**Scope**

- Fix undefined change-order state/setters and render the intended flow.
- Remove `Start Job (skip scope)` and enforce scope/PIN prerequisites on the backend start transition.
- Opening Payment performs a read only; no checkout is created on mount.
- Separate scheduled pending requests from timed Fast Match offers; client timer expiry never declines an ordinary booking.
- Prevent unary cash-paid state and remove every remaining known dead handler/endless spinner.

**Acceptance**

- Each defect has a failing-before/passing-after focused regression test.
- Duplicate taps produce one server effect.
- Scope/PIN cannot be bypassed from another route or direct API call.
- Scheduled jobs survive beyond the Fast Match countdown.
- Failed/abandoned payment remains unpaid.

### P0T-05 — Install truth-first capability fences

**Scope**

- Add/read the minimum capability contract with schema version, TTL, minimum app version and effective fail-closed intersection.
- Hide or qualify unsupported Peach, cash settlement, remote push, production KYC, background tracking, live/public sharing and operated SOS.
- Remove production-looking selfie simulation and generic verification claims.
- Quarantine legacy queued consequential offline commands; preserve only safe drafts.

**Acceptance**

- No unsupported capability presents a success state or dead CTA.
- Expired/unavailable capability data disables consequential optional features.
- Cached state shows freshness; accept/start/complete/pay/KYC/SOS require acknowledgement.
- Push payload/log/analytics inspection contains no prohibited PII.

### P0T-06 — Automate the bounded triage smoke matrix

**Reopened 2026-08-30:** The historical vc3 matrix did not and could not pass the newly discovered fresh-customer Address → Schedule journey. LOC-06 in the focused address-pin specification supersedes this ticket for that journey; prior vc3 evidence remains valid only for the paths it actually exercised and is not retroactively upgraded.

**Scope**

- Add unit/component/API regression coverage owned by P0T-02 through P0T-05.
- Automate the highest-value Android journeys with Maestro or the approved equivalent.
- Seed two synthetic accounts and deterministic booking/match/payment-off fixtures.
- Capture ADB logs, screenshots/video where useful and test-data reset steps.

**Required journeys**

- clean launch, sign-in/restore and one customer plus one worker fixture;
- fresh-customer Address → explicitly accepted exact pin → Schedule;
- quote/match/direct-booking coordinate provenance → immutable request snapshot/row → resulting booking, with legacy absence retained as `NULL`;
- Discover → Worker Profile → scheduled request;
- Fast Match offer expiry/accept distinction;
- scope confirmation, PIN/start guard and change-order entry;
- Payment read-only entry and capability-off recovery;
- flagship candidate omits legacy `RequestMatch`/`BookingForm` registration and rejects the valid-form legacy link `togt://customer/workers/00000000-0000-4000-8000-000000000001/book`;
- offline/reconnect, duplicate tap, back navigation and logout cleanup.

**Acceptance**

- Selected journeys pass from a deterministic reset.
- No reproducible JavaScript crash, unhandled route action or false success remains.
- Failures retain logs and evidence instead of being rerun until green.

### P0T-07 — Build, inspect, approve and promote the successor

**Reopened 2026-08-30:** The historical vc3 artifact remains the grandfathered upgrade baseline, not evidence for the location candidate. LOC-07 and the candidate runbook govern vc4 inspection, approval and promotion.

**Scope**

- Follow `docs/superpowers/plans/2026-08-30-togt-apk-candidate-promotion-rollback-runbook.md`.
- Build higher-version x86_64 and ARM64 candidates through the local pipeline from a clean isolated candidate commit.
- Independently inspect package/version/SDK/ABI/bundle, permissions/components/provider metadata, runtime contract, Maps-key fingerprint, alignment/signature/signer and SHA-256.
- Assert vc4 packages `groundedMomentumShell: true` plus `customerFlagship: true`, mounts Grounded Address and rejects legacy customer booking/match routes and links.
- Verify nullable source provenance through quote/match creation into booking without treating legacy `NULL` as safe.
- Perform emulator clean/upgrade tests and same-signer physical-device upgrade over the current installed/legacy baseline.
- Run the P0T-06 smoke matrix against the labelled synthetic development backend.
- Present the exact ARM64 SHA-256, visual evidence, known limitations and rollback source for user approval.
- Promote the exact approved bytes without rebuilding; retain the previous baseline.

**Acceptance**

- Physical device cold-launches the successor and both fixture roles complete the selected matrix.
- Upgrade preserves intended local state without replaying legacy consequential commands.
- Immutable build/evidence records, checksum, signer SHA-1/SHA-256, source/backend identity, provider/runtime identity, known limitations and rollback instructions are published.
- Approval names the exact ARM64 SHA-256 and promotion hashes prove the tested bytes were not rebuilt or overwritten.
- Rollback is prepared as capability-off plus a same-signer build of the last known-good source with a new higher `versionCode`; a lower-version Android install is not the release rollback path.
- P0-Reliability backlog is reissued from measured evidence; no Reliability item blocks the internal APK unless it violates a Triage truth/safety gate.

## 8. Wave 2 — reliability spine plus Phase 1 foundation

Run these lanes concurrently behind feature flags:

### Backend/data/operations

- canonical machine-readable statecharts and transition tests;
- additive migrations for payment attempts/refunds, push devices, journey/location, KYC assurance and durable marketplace state;
- expected-version plus idempotency contracts;
- transactional lifecycle event/outbox and idempotent consumers;
- durable matching single-winner/restart/race handling;
- privacy serializers and versioned `/api/capabilities`;
- minimum audited staff controls for affected KYC/payment/safety/dispute actions.

### Mobile/platform

- canonical DTO adapters and one server-state layer;
- one realtime manager and selected push provider (`disabled`, Expo Push/EAS or direct FCM);
- address/pin integrity, freshness/TTL and approved tracking mode;
- normalized errors, offline guards and process-restart reconciliation;
- deep-link/notification intent compatibility.

### Grounded Momentum foundation

- approved identity/assets and Android-native companion reference;
- semantic tokens, typography, spacing, motion and accessibility defaults;
- primitives and first vertical-slice components rather than an upfront giant library;
- single-role customer/worker shells, auth, KYC and required account foundations;
- component gallery and visual/accessibility regression evidence.

### Exit gate

- previous/new mobile/backend compatibility passes;
- restart, accept/cancel race, duplicate, replay and outbox recovery tests pass;
- TalkBack, 200% text, offline/process-restart and PII scrub checks pass;
- unavailable providers remain capability-off;
- Reliability candidate APK/API, migration rehearsal, rollback flags and operations ownership exist.

## 9. Wave 3 — Phase 2 paired marketplace slice

Build customer and worker counterparts as one vertical lifecycle:

```text
Customer Home/brief/address/schedule/review
↔ service catalogue and immutable snapshot
↔ Fast Match / Compare Workers / Receive Quotes / Diagnostic Visit
↔ worker offer/request/quote builder
↔ Project Hub / Worker Job
↔ scope + PIN + change orders
↔ completion + issue + payment capability + rating
```

Required launch inputs:

- bounded launch catalogue/pricing modes;
- curated operations-onboarded worker fixtures/cohort;
- deterministic matching/quote data;
- restricted location provider or truthful fallback;
- payment remains sandbox/staff-only or off until payable-ledger/reconciliation gates pass.

Exit when one authoritative job completes across two physical devices for every enabled launch mode, duplicate actions have one effect, privacy reveal windows hold, scope/price snapshots remain immutable and every terminal match state recovers visibly.

## 10. Wave 4 — Phase 3 worker, money, trust and operations

Parallel lanes deliver:

- worker activation, Today, Jobs, services/profile, account and availability;
- earnings/payable ledger, beneficiary assurance, payout attempts and reconciliation;
- Peach/cash/refund/chargeback contracts and finance controls;
- Safety Centre, operated incident progression, sharing, disputes and support;
- favourite, block, rebook, recurrence and two-sided fairness controls;
- audited staff client/APIs, runbooks, dashboards and escalation drills.

Exit requires balanced payment/payable/payout evidence, migration restore, safety escalation drill, physical-device matrix, accessibility/weak-network passes and the 50-run public-beta crash protocol. Real money remains off until settlement and payout are audited and explicitly approved.

## 11. Wave 5 — Phase 4 differentiation

Build in bounded, separately kill-switchable increments:

- multimodal intake with explicit consent and editable structured extraction;
- explainable recommendations with worker-exposure monitoring;
- clarifying assistant backed by the canonical brief;
- Android live status and later iOS Live Activities;
- contextual safety education and bounded personalization;
- AI evaluation/red-team harness, model/prompt/schema registry and deterministic fallback.

Household/business profiles remain candidate-off until repeat-usage evidence approves them.

Exit requires complete manual booking, confirmed/visible AI fields, privacy/legal approval, local language/accent and hazardous-work evaluation, provider-outage fallback, fairness guardrails and lock-screen privacy evidence.

## 12. Validation cadence

### Every implementation branch

- dependency install from lockfiles;
- focused type/lint/unit/component/contract checks;
- relevant full backend or mobile gates for shared changes;
- `git diff --check`, complete diff, status and sensitive-data scan;
- source commit, test counts, failures/limitations and rollback note.

### Every paired vertical slice

- seeded two-role E2E;
- duplicate-tap/idempotency and expected-version conflict;
- token refresh, socket reconnect, stale notification and process restart;
- offline/error/capability-off recovery;
- privacy reveal and analytics/push/log inspection.

### Every APK/release gate

- isolated clean candidate commit; build success is not promotion;
- standalone static inspection of the exact existing APK and delta from the previous promoted build manifest/promotion record;
- clean and upgrade install where compatible;
- physical target devices, performance/battery and accessibility checks;
- Grounded Momentum screenshot/visual review for affected screens;
- artifact identity, signer SHA-1/SHA-256, ABI, checksum, source/runtime/provider manifest and exact-hash user approval;
- migration/provider reconciliation where affected;
- operations/support drill where affected;
- promotion of the exact approved bytes without overwrite;
- retained prior artifact and tested capability/forward-rollback path.

## 13. Genuine external blockers

These do not stop unrelated implementation:

- public staging TLS/WSS;
- restricted Maps/Places credentials;
- selected push credentials and real background/terminated delivery tests;
- Peach sandbox signing/webhook/status/3DS access plus fee/legal decisions;
- KYC assurance/provider approval;
- payout provider, beneficiary verification and finance reconciliation;
- SOS staffing, acknowledgement SLA, MFA staff access and escalation drill;
- representative Android hardware and real network/battery testing;
- POPIA/cross-border approval for AI media/transcripts.

Missing inputs set the affected capability to off and create a named approval/evidence gate. Local APK production never depends on EAS unless TOGT explicitly selects EAS as its build provider.

## 14. Landing and release order

1. Current repository governance/current-state documentation lands.
2. Grounded Momentum master spec, concept and this plan land after catch-up.
3. Readiness changes land or are explicitly superseded by the fresh P0 branch.
4. P0-Triage successor APK branch lands after focused evidence.
5. Shared lifecycle/schema/outbox/capabilities contracts land before dependent feature branches.
6. Grounded Momentum tokens/shells and paired customer/worker slices land in dependency order.
7. Money, safety and operations capabilities remain behind flags until their evidence/approval gates.
8. Deployment is a separate approval package; merge never implies deploy.

Parallel branches may be built and reviewed early. Default-branch merges are serialized through the repository landing procedure, with catch-up and revalidation at the front of the queue.

## 15. Definition of programme completion

The full build is complete only when the master specification's final acceptance criteria pass, the exact release artifact/source/schema/provider versions are recorded, operations can handle every enabled consequential capability, rollback remains available and Damian approves the specific release/deployment action. A feature-complete branch, merged PR or downloadable APK alone is not production completion.
