# Togt Grounded Momentum — P0 Checkpoint Handoff

**Checkpoint date:** 2026-08-29

**Implementation branch:** `codex/mobile/grounded-momentum-p0-2026-08-29`

**Canonical base:** `origin/main` at `389c81dcf21829472dfd174fadaff00a2cbf0721`

**Reviewed artifact source checkpoint:** `c90742361216035fe8531df7720acc0f449b1546`

**Scope:** P0T-00 through P0T-06 complete in source and automated evidence. P0T-07 static build, verification and Development-folder handoff are complete; physical-device upgrade and paired smoke remain.

This is an internal-test checkpoint, not a deployment or public-beta release. No branch was merged, no production system or provider was changed, and no real identity or payment flow was enabled. A labelled synthetic-data v2 candidate was copied to the local Development artifact store; it was not publicly distributed.

## Governing design and plan

The complete Phase 0–4 product/design contract remains in Draft PR [#10](https://github.com/DamianOost/Togt/pull/10):

- [Grounded Momentum master specification](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/specs/2026-08-23-togt-grounded-momentum-master-spec.md)
- [Accelerated full-build plan](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-plan.md)
- [Exact implementation handoff](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-handoff.md)
- [Approved Grounded Momentum visual target](https://github.com/DamianOost/Togt/blob/codex/docs/grounded-momentum-full-build-2026-08-23/docs/design/togt-grounded-momentum-concept.png)

Phase 1 visual implementation has deliberately not started. The concept board and the master specification remain the visual source of truth for the next wave.

## Artifact source commit stack

The reviewed artifact source at `c907423` is based on current `origin/main` and contains these bounded commits:

```text
553792a feat(mobile): prepare internal Android APK builds
e3ab48b feat(mobile): make local APK builds reproducible
e4897e4 fix(mobile): keep prebuild source deterministic
59c068e fix(mobile): stabilize auth restore and navigation contracts
2981a02 fix(p0): fail closed on unproven trust flows
d123acb test(backend): make env checks portable on Windows
2231aca fix(p0): close navigation and capability truth gaps
91f818f fix(mobile): enforce Android network and permission policy
c907423 docs(p0): record checkpoint and APK handoff
```

The first commit converges the reviewed APK-readiness source from Draft PR #9. Do not close or merge PR #9 or PR #10 solely because this implementation PR exists; Damian must approve the exact landing sequence.

## P0 checkpoint status

| Ticket | Status at checkpoint | Evidence |
|---|---|---|
| P0T-00 — base and identity lock | Complete | Current-main base; package `za.togt.app`; `versionName 1.0.1`; `versionCode 2`; ARM64; v1 signer recorded and reverified. |
| P0T-01 — reproducible local APK pipeline | Complete | Local Gradle built the exact reviewed source; Expo Go, Expo account and EAS were not required; deterministic artifact/manifest/signing verification passed. |
| P0T-02 — startup/auth | Complete for triage | Authoritative bounded restore, one refresh, offline/retry/sign-in states, single-flight refresh and cleanup are covered. |
| P0T-03 — navigation | Complete for triage | Stable ID routes, unique transactional routes, nested returns and the labourer incoming-offer root context are covered. |
| P0T-04 — crashes/mutations | Complete for triage | Scheduled requests no longer mutate on a client timer; critical screens use explicit state and fail-closed behavior. |
| P0T-05 — truth-first capability fences | Complete for triage | Payments, KYC, SOS, push, background tracking, live/public sharing and consequential offline mutations are off or truthfully qualified. |
| P0T-06 — automated smoke matrix | Complete | Mobile, backend, config, export and generated-native checks below are green. |
| P0T-07 — build/install/distribute | Static artifact complete; device gate pending | APK built and passed independent package/version/ABI/alignment/signature/hash checks, then APK + manifest were copied beside v1 without overwrite. No Android device was connected, so clean install, same-signer upgrade and paired smoke remain. |

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
| Local Gradle release build | **BUILD SUCCESSFUL; 465 tasks; 9m18s** |
| Independent APK identity | `za.togt.app`; `1.0.1`; version code `2`; `arm64-v8a` only |
| Independent signature/alignment | APK v2/v3 signatures valid; one signer matching v1; 16 KiB-compatible alignment passed |
| Published v2 SHA-256 | `791EDBCA952C6A2D398706238EB36664606B0FA5D317D963E7FBFEF919B8DD97` |
| Packaged runtime origin | expected `http://192.168.10.126:3003` present; stale localhost/Mac/placeholder origins absent |
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

The exact static-verified candidate is now retained beside v1:

```text
APK:      %LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-development-lan-1.0.1-vc2-c90742361216-arm64-v8a.apk
manifest: %LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-development-lan-1.0.1-vc2-c90742361216-arm64-v8a.manifest.json
size:     27270778 bytes
SHA-256:  791EDBCA952C6A2D398706238EB36664606B0FA5D317D963E7FBFEF919B8DD97
config:   development-lan
origin:   http://192.168.10.126:3003
```

The retained signing key was independently checked against the v1 signer. A mismatch must fail the build and be reported as clean-install-only; it must never be presented as an upgrade.

## P0T-07 artifact outcome

The repository preflight, Expo prebuild and bundle export passed. The portable JDK 17 initially failed this host-level probe before Gradle could configure:

```text
java.nio.channels.Pipe.open()
→ java.io.IOException: Unable to establish loopback connection
→ java.net.SocketException: Invalid argument: connect
```

The cause was the JDK's AF_UNIX preference inside both `PipeImpl` and the Windows selector wakeup pipe on this execution host. A temporary host-only Java provider/agent forced the JDK's existing TCP-backed pipe path. Separate `Pipe.open()` and `Selector.open()` probes passed before the final bounded Gradle retry. The shim lived under `C:\tp`, never touched repository source and is not packaged in the APK.

Gradle then completed successfully. The repository pipeline aligned, signed and verified the candidate; an independent pass repeated `aapt`, `apksigner`, `zipalign`, SHA-256 and archive ABI checks. The v1 baseline hash and signer were reverified unchanged before copying v2 and its manifest into the Development artifact store.

The temporary API and exact isolated PostgreSQL cluster used during build preparation were stopped after publication. No temporary listener remains on ports 3003 or 55432.

The dated Mac LAN backend is also not an acceptable P0T-07 target at checkpoint time:

```text
GET http://192.168.10.69:3002/health              → 200
GET http://192.168.10.69:3002/health/deep         → 503 (database failed; dispatcher stale)
GET http://192.168.10.69:3002/api/capabilities    → 404
```

Do not embed that origin in the distributed candidate until the matching current-branch synthetic backend is green and exposes the capability contract.

## Exact P0T-07 physical continuation

The self-contained operator sequence is [2026-08-29-p0t07-device-smoke-runbook.md](./2026-08-29-p0t07-device-smoke-runbook.md).

1. Do not rebuild for the current physical gate. Use the exact retained v2 APK and manifest so tested bytes match the recorded hash. If the host no longer owns `192.168.10.126`, create a new labelled candidate because the API origin is embedded.
2. Connect at least one ARM64 Android device with accepted USB-debugging authorization. Require ADB state `device`; no device was available at this checkpoint.
3. Prepare a current-branch synthetic backend on `http://192.168.10.126:3003`. Bind the API only to that reviewed LAN address, keep PostgreSQL loopback-only, use a phone-IP-scoped firewall rule and require:
   - `/health/deep` status `ok` with database and worker checks green;
   - `/api/capabilities` HTTP 200 with the supported schema version;
   - no real customer, worker, KYC or payment data;
   - real dispatcher and maintenance freshness; never `NODE_ENV=test`.
4. Clean-install exact v1 and require a stable truthful offline launch; its embedded legacy origin `http://192.168.10.69:3002` is degraded, so do not claim authenticated-session migration. Install v2 with `adb install -r` without uninstalling and require the same Android UID/first-install time, a newer update time, version code 2 and successful cold launch against the current backend.
5. Clean-install v2 once, then run the paired synthetic customer/worker smoke matrix on two simultaneous clients:
   - clean and upgrade cold launch;
   - sign-in, restore, retry/offline and logout;
   - discovery/profile ID routes;
   - direct booking and scheduled request lifecycle;
   - worker accept, scope confirmation, six-digit customer start PIN and completion;
   - tracking freshness/foreground qualification;
   - payment, KYC, push, SOS, sharing and background-tracking capability-off behavior;
   - restart/reconnect and terminal listener cleanup;
   - no PII, tokens, exact coordinates or secrets in sanitized logs/evidence.
6. Record redacted device model/OS/ABI, clean-install result, upgrade evidence and paired-smoke result against the exact hash above. Retain no PII, tokens, ADB serials, exact coordinates or secrets.
7. Shut down the synthetic API, drop only the uniquely named synthetic database, stop the exact PostgreSQL cluster, remove only the temporary firewall rule and restore only firewall rules recorded as previously enabled.

Authenticated v1-to-v2 session migration is explicitly unproven because exact
v1 embeds the degraded legacy `.69:3002` origin. The device gate may prove
Android package/signer upgrade semantics and v2 authentication against the
current backend, but it must not overstate legacy-session evidence.

Do not publish an `example.invalid`, localhost-only or degraded-backend APK as testable. Do not treat an APK download as production, provider or public-beta approval.

## Remaining build sequence after P0T-07

### P0-Reliability / public-beta gate

- State-machine race, replay, idempotency and restart evidence.
- Current-branch HTTPS/WSS preview environment.
- Durable event/outbox recovery and realtime catch-up.
- Selected provider sandboxes only where approved; every missing provider remains capability-off.
- Minimize the generated release permission set for provider-off builds; explicitly review legacy storage, audio, overlay and notification/badge declarations before public beta.
- Operated support, safety, reconciliation, privacy and rollback evidence.
- Representative physical-device matrix and accessible/permission/error-state QA.
- Controlled legacy-origin fixture or another reviewed method for authenticated
  v1-to-v2 session-migration evidence, if that behavior is part of the pilot contract.

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
