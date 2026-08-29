# Togt Grounded Momentum — P0 Checkpoint Handoff

**Checkpoint date:** 2026-08-29

**Implementation branch:** `codex/mobile/grounded-momentum-p0-2026-08-29`

**Canonical base:** `origin/main` at `389c81dcf21829472dfd174fadaff00a2cbf0721`

**Reviewed code checkpoint:** `91f818f70e1817e382f9cbe59c69970461a060ed`

**Scope:** P0T-00 through P0T-06 complete in source and automated evidence; P0T-07 remains the physical build/install/distribution gate.

This is a review checkpoint, not a deployment or public-beta release. No branch was merged, no production system or provider was changed, no real identity or payment flow was enabled, and no v2 APK was published.

## Governing design and plan

The complete Phase 0–4 product/design contract remains in Draft PR [#10](https://github.com/DamianOost/Togt/pull/10):

- [Grounded Momentum master specification](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/specs/2026-08-23-togt-grounded-momentum-master-spec.md)
- [Accelerated full-build plan](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-plan.md)
- [Exact implementation handoff](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-handoff.md)
- [Approved Grounded Momentum visual target](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/design/togt-grounded-momentum-concept.png)

Phase 1 visual implementation has deliberately not started. The concept board and the master specification remain the visual source of truth for the next wave.

## Integrated commit stack

The branch is based on current `origin/main` and contains these bounded commits:

```text
553792a feat(mobile): prepare internal Android APK builds
e3ab48b feat(mobile): make local APK builds reproducible
e4897e4 fix(mobile): keep prebuild source deterministic
59c068e fix(mobile): stabilize auth restore and navigation contracts
2981a02 fix(p0): fail closed on unproven trust flows
d123acb test(backend): make env checks portable on Windows
2231aca fix(p0): close navigation and capability truth gaps
91f818f fix(mobile): enforce Android network and permission policy
```

The first commit converges the reviewed APK-readiness source from Draft PR #9. Do not close or merge PR #9 or PR #10 solely because this implementation PR exists; Damian must approve the exact landing sequence.

## P0 checkpoint status

| Ticket | Status at checkpoint | Evidence |
|---|---|---|
| P0T-00 — base and identity lock | Complete | Current-main base; package `za.togt.app`; `versionName 1.0.1`; `versionCode 2`; ARM64; v1 signer recorded and reverified. |
| P0T-01 — reproducible local APK pipeline | Source complete | Local Gradle is the default; Expo Go, Expo account and EAS are not required; deterministic artifact/manifest/signing verification is implemented. |
| P0T-02 — startup/auth | Complete for triage | Authoritative bounded restore, one refresh, offline/retry/sign-in states, single-flight refresh and cleanup are covered. |
| P0T-03 — navigation | Complete for triage | Stable ID routes, unique transactional routes, nested returns and the labourer incoming-offer root context are covered. |
| P0T-04 — crashes/mutations | Complete for triage | Scheduled requests no longer mutate on a client timer; critical screens use explicit state and fail-closed behavior. |
| P0T-05 — truth-first capability fences | Complete for triage | Payments, KYC, SOS, push, background tracking, live/public sharing and consequential offline mutations are off or truthfully qualified. |
| P0T-06 — automated smoke matrix | Complete | Mobile, backend, config, export and generated-native checks below are green. |
| P0T-07 — build/install/distribute | Operator/device gate | Repository and toolchain are prepared. The current Codex host cannot run Gradle transport; no v2 APK was produced. |

## What is now true

### Android build and runtime configuration

- Local Gradle is the default internal APK route. EAS is optional and provider-gated.
- REST, realtime, chat, matching and upload traffic share one validated API origin.
- Development permits only an explicit local/private-LAN HTTP origin or HTTPS.
- Preview and production require a non-private HTTPS origin.
- Generated release manifests explicitly allow cleartext only for labelled `development-local` and `development-lan` builds. `development-secure`, `preview` and `production` explicitly disable it.
- Every prebuild verifies the generated main Android manifest before Gradle.
- The unused Android background-location permission has been removed. Foreground fine/coarse location remains.
- Artifact creation verifies package, version, ABI, 16 KiB alignment, signature, signer fingerprint, SHA-256 and source commit, then writes an adjacent JSON evidence manifest.
- The build refuses dirty source so the manifest's source commit is authoritative.

The operator runbook is [mobile/BUILDING.md](../../../mobile/BUILDING.md).

### Startup and navigation

- A cached role never authorizes or flashes an account shell before `/api/auth/me` resolves.
- Expired credentials rotate once; revoked credentials return to sign-in; offline/timeout states are bounded and retryable.
- Customer and worker transactional routes are registered once above their tab navigators.
- Critical routes accept stable booking/worker IDs rather than object-shaped navigation state.
- Incoming worker offers now render under the root navigator context and target `Labourer → ActiveJob` explicitly.

### Integrity and truthful capability behavior

- Client payment initiation is unavailable; the payment screen is status-only and backend initiation routes fail closed.
- Earnings count only server-confirmed paid bookings.
- Legacy structural/test KYC cannot render as production verification without an enabled capability, supported VerifyNow provider evidence and `verified_at`.
- Scope prompts begin unchecked and never imply bilateral agreement merely because the screen loaded.
- Synthetic `En Route` and `Arrived` checkmarks were removed because those states are not persisted by the backend lifecycle.
- Tracking copy describes foreground-only updates, approximate 100 m proximity and a rough straight-line walking estimate.
- Scheduled requests do not auto-decline on a local timer.
- Consequential offline mutations fail closed; old queued commands are quarantined without retaining their payloads.
- Discovery, worker availability, KYC, earnings and share copy no longer overstate verification, settlement, speed, live state or public sharing.

## Verification evidence

All evidence used synthetic/local configuration.

| Gate | Result |
|---|---|
| Mobile test runner | **57/57 passed** |
| Mobile changed JS/CJS syntax | **68 files passed** |
| Expo Doctor | **18/18 passed** |
| Android Metro export | **947 modules; passed** |
| Generated development-LAN native manifest | cleartext `true`; no `ACCESS_BACKGROUND_LOCATION` |
| Generated secure/preview/production manifests | cleartext `false` |
| Backend unit/integration suite | **222/222 passed across 33 suites** |
| Backend smoke suite | **7/7 passed across 3 suites** |
| Diff whitespace and secret-pattern checks | passed |

Backend tests ran against the isolated Windows PostgreSQL 17 test cluster on port 55432. The cluster was stopped cleanly after validation. The only source adjustment needed to make the suite Windows-portable was replacing a hard-coded `/tmp` test working directory with `os.tmpdir()`.

`npm ci` reported 9 moderate and 9 high dependency audit findings, with no critical finding. Treat dependency remediation as a reviewed follow-up; do not bulk-upgrade the Expo/React Native graph inside P0T-07.

## APK identity and retained rollback baseline

The retained v1 baseline remains untouched at:

```text
%LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk
```

```text
package:        za.togt.app
versionName:    1.0.0
versionCode:    1
ABI:            arm64-v8a
APK SHA-256:    604E6F1F7E6518F5F430745E2ED63260FD70E2716EA0D8FFB70CB4E28B8228E2
signer SHA-256: FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C
```

The successor is locked to:

```text
package:        za.togt.app
versionName:    1.0.1
versionCode:    2
ABI:            arm64-v8a
expected signer SHA-256: FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C
```

The retained signing key was independently checked against the v1 signer. A mismatch must fail the build and be reported as clean-install-only; it must never be presented as an upgrade.

## Why no v2 APK exists at this checkpoint

The repository preflight, Expo prebuild and bundle export all pass. The portable JDK 17 fails this host-level probe before Gradle can configure or compile:

```text
java.nio.channels.Pipe.open()
→ java.io.IOException: Unable to establish loopback connection
→ java.net.SocketException: Invalid argument: connect
```

This is the same Codex-host transport failure previously seen by the isolated platform lane. The pipeline intentionally stops before spending the one bounded Gradle retry when the JDK pipe probe fails. Run P0T-07 from a normal unrestricted Windows PowerShell where this probe passes.

The dated Mac LAN backend is also not an acceptable P0T-07 target at checkpoint time:

```text
GET http://192.168.10.69:3002/health              → 200
GET http://192.168.10.69:3002/health/deep         → 503 (database failed; dispatcher stale)
GET http://192.168.10.69:3002/api/capabilities    → 404
```

Do not embed that origin in the distributed candidate until the matching current-branch synthetic backend is green and exposes the capability contract.

## Exact P0T-07 continuation

1. Review and merge the prerequisite PR sequence only after Damian approves it. Before landing, merge current `origin/main` into this branch without rewriting history and rerun every affected gate.
2. Prepare a current-branch synthetic backend reachable from the test phone. Require:
   - `/health/deep` status `ok` with database and worker checks green;
   - `/api/capabilities` HTTP 200 with the supported schema version;
   - no real customer, worker, KYC or payment data;
   - a reviewed private-LAN HTTP origin for a labelled development build, or a device-trusted HTTPS origin.
3. In a normal operator PowerShell, set JDK 17 and Android SDK 36, then prove `Pipe.open()` works before running Gradle.
4. Create a short detached worktree at the exact reviewed branch HEAD. Do not build from a dirty checkout.
5. Set only the reviewed build inputs documented in `mobile/BUILDING.md`: local Gradle, explicit API origin, providers disabled, ARM64, approved signing key and expected signer fingerprint.
6. Run, in order:

   ```powershell
   npm ci
   npm test
   npx expo-doctor
   npm run preflight:apk:local
   npm run export:android
   npm run prebuild:android:local
   npm run build:apk:local
   ```

7. Reject the output unless the generated manifest and independent `aapt`, `zipalign`, `apksigner` and SHA-256 checks prove the locked identity above.
8. Install v1, exercise its synthetic baseline, then install v2 over it without uninstalling. Confirm Android treats it as a same-package/same-signer upgrade and retained-session behavior is intentional.
9. Run the paired synthetic customer/worker smoke matrix:
   - clean and upgrade cold launch;
   - sign-in, restore, retry/offline and logout;
   - discovery/profile ID routes;
   - direct booking and scheduled request lifecycle;
   - worker accept, scope confirmation, six-digit customer start PIN and completion;
   - tracking freshness/foreground qualification;
   - payment, KYC, push, SOS, sharing and background-tracking capability-off behavior;
   - restart/reconnect and terminal listener cleanup;
   - no PII, tokens, exact coordinates or secrets in sanitized logs/evidence.
10. Retain the exact tested APK and its adjacent JSON manifest. Copy both into `%LOCALAPPDATA%\TOGT-Android-Build\artifacts` without overwriting v1, then record device model/OS, source commit, API origin/config class, artifact hash, signer and test result.

Do not publish an `example.invalid`, localhost-only or degraded-backend APK as testable. Do not treat an APK download as production, provider or public-beta approval.

## Remaining build sequence after P0T-07

### P0-Reliability / public-beta gate

- State-machine race, replay, idempotency and restart evidence.
- Current-branch HTTPS/WSS preview environment.
- Durable event/outbox recovery and realtime catch-up.
- Selected provider sandboxes only where approved; every missing provider remains capability-off.
- Operated support, safety, reconciliation, privacy and rollback evidence.
- Representative physical-device matrix and accessible/permission/error-state QA.

### Phase 1 — Grounded Momentum foundations

- Implement the approved cream/ink/emerald design tokens, typography, elevation, spacing and motion.
- Replace provisional assets with the approved brand/app-icon/splash system.
- Build the shared components and role-aware navigation foundation against the concept board.
- Add visual-regression and accessibility gates before expanding screen count.

### Phase 2 — customer flagship plus minimum worker counterpart

- Build the high-end customer journey and the minimum worker fulfilment surface on the stable lifecycle.
- Keep money, background arrival, identity and sharing behind their provider/operations evidence gates.

### Phase 3 — complete worker, trust, safety, earnings and retention

- Durable worker journey, earnings/ledger truth, operated safety and support, verified trust states and retention loops.

### Phase 4 — AI-assisted intake and live platform status

- Add AI/photo/voice assistance only behind deterministic fallbacks, privacy/evaluation evidence and explicit capability flags.
- Add live status only where freshness, recovery and operations contracts are proven.

## Decisions that remain outside this checkpoint

- Public synthetic-preview and later pilot approval.
- Durban/Umhlanga and trade/cohort boundary.
- KYC provider-failure behavior and selfie/manual-review decision.
- Whether cash is a live path.
- Labourer payout provider and ledger/reconciliation contract.
- Selected push/maps/payment provider credentials and custody.
- Legal, privacy, safety, support and finance approval for any real-user or real-money capability.
- Exact PR #9/#10 supersession and landing order.

## Stop boundary

The next operator must not infer authorization for merge, deployment, DNS, secrets, vendor-console changes, production database writes, real-user KYC, real customer/worker data, money movement or public APK distribution. Those require separate evidence and Damian's approval of the exact action.
