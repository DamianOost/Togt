# TOGT Grounded Momentum — full-build handoff

| Field | Value |
|---|---|
| Date | 2026-08-23 |
| Status | Ready for P0 implementation; review, merge and release evidence pending |
| Owner/release authority | Damian Oosthuyzen |
| Documentation branch | `codex/docs/grounded-momentum-full-build-2026-08-23` |
| Documentation worktree | `Togt-grounded-momentum-full-build-2026-08-23` |
| Canonical base | `origin/main` at `389c81dcf21829472dfd174fadaff00a2cbf0721` |
| Approved docs commit | `9de7962e50dbc8dfdee396dbf700bc203f806637` |
| Review | Draft PR [#10](https://github.com/DamianOost/Togt/pull/10) |
| Master specification | `docs/superpowers/specs/2026-08-23-togt-grounded-momentum-master-spec.md` |
| Executable plan | `docs/superpowers/plans/2026-08-23-togt-grounded-momentum-full-build-plan.md` |

## 1. Outcome handed over

The Phase 0–4 Grounded Momentum programme is fully specified and converted into an accelerated implementation sequence. It starts from the existing working Android APK and reviewed readiness source; it does not restart the app, decompile the APK, require Expo Go, or require an Expo account/EAS cloud build.

The work is organized as four parallel implementation lanes across Waves 0–5. Progress is controlled by acceptance evidence, shared-contract landing order and real external blockers—not artificial day or week estimates.

This documentation task changed no application, backend, infrastructure, schema, secret, vendor or production configuration.

## 2. Locked baseline

### Source

| Item | Value |
|---|---|
| APK-readiness branch | `codex/mobile/internal-apk-readiness-2026-08-23` |
| APK-readiness commit | `66cd45822e4958edc5be97af418bc4f674ce932f` |
| APK-readiness review | Draft PR [#9](https://github.com/DamianOost/Togt/pull/9); not assumed merged |
| Convergence rule | Create the P0 code branch from then-current `origin/main`; deliberately port the reviewed readiness delta if PR #9 has not landed |

### Installed-test artifact

| Item | Value |
|---|---|
| Filename | `TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk` |
| Package/version | `za.togt.app`, `versionName 1.0.0`, `versionCode 1` |
| Android target | minimum SDK 24, target/compile SDK 36, `arm64-v8a` |
| Artifact SHA-256 | `604E6F1F7E6518F5F430745E2ED63260FD70E2716EA0D8FFB70CB4E28B8228E2` |
| Signer SHA-256 | `FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C` |
| Distribution | Approved Development artifact store |
| Confidence boundary | Internal synthetic/private-LAN test only; physical-device launch and upgrade smoke still required |

Preserve this APK as the regression and rollback baseline. The P0 successor target is `versionCode 2`; if another approved artifact consumes that code first, use the next higher unused code. An in-place upgrade requires the same signer. A changed signer requires a clean uninstall and must be labelled as a clean-install build, not an upgrade.

## 3. Decisions that must not be reopened during P0

- Local Android Gradle is the default internal APK route. Expo Go, an Expo account and EAS are not required.
- EAS remains an optional future build/push provider only when TOGT explicitly selects it.
- One resolver owns REST, realtime, chat, matching and upload endpoints.
- Internal private-LAN HTTP is allowed only in a clearly labelled development build. Preview and production require HTTPS/WSS.
- Unsupported Peach, push, KYC, SOS, public-share, background-tracking and payout claims stay off behind server-authoritative capability flags.
- The launch account has one server-authoritative role. Customer and worker testing uses separate accounts/devices.
- Fulfilment after a legitimate start ends as `completed` or `terminated_after_start`, never as a fake pre-start cancellation.
- Booking fulfilment, payment obligation, assurance, attempts, cash confirmation, refund, chargeback, payout, work dispute and safety incident remain separate domains.
- Customer and worker lifecycle changes land as paired slices when one side depends on the other being real.
- The concept board controls tone, palette and hierarchy. Its device chrome, fee, labels, verification marks and example state combinations are illustrative.
- No production deployment, real identity, real customer data, money movement or vendor activation is authorized by the specification or PR.

## 4. Exact next implementation sequence

### P0T-00 — convergence and release lock

1. Fetch/prune `origin` and create a fresh isolated `codex/mobile/...` task branch from current `origin/main`.
2. Review PR #9/`66cd458` against that base. Port only the reviewed readiness delta if it has not landed; record whether PR #9 remains a dependency or is explicitly superseded.
3. Record the implementation base SHA, readiness SHA, lockfiles, JDK/Android SDK/Gradle versions, backend runtime/fixture boundary and target physical devices.
4. Preserve the v1 APK and verify access to its signing identity before relying on an upgrade test.
5. Target `versionCode 2` and record the chosen `versionName`, ABI set, deterministic filename and artifact manifest fields.
6. Freeze the P0 capability defaults and synthetic customer/worker fixtures.

### P0T-01 through P0T-05 — parallel repair lanes

- Make the local APK command repository-reproducible and provider-aware.
- Stabilize startup, auth restoration and bounded offline/error states.
- Type and repair the critical navigation matrix, including the known `labourerId`/`labourer` mismatch.
- Remove confirmed crashes and unintended mutations: payment-on-mount, unary cash-paid state, 30-second scheduled auto-decline, missing change-order handlers, scope skipping and unsafe queued mutations.
- Add truth-first capability fences for payments, KYC, SOS, sharing, tracking, push and related unavailable states.

Parallel work uses separate worktrees. Shared navigation roots, DTO/schema versions, lifecycle state machines and migration numbers have one integration owner.

### P0T-06 and P0T-07 — integrate, prove and deliver

1. Run the automated regression and bounded paired-role smoke matrix.
2. Build the successor with the documented local Gradle route.
3. Record package, version, source SHA, configuration class, ABI, signer and checksum.
4. Verify alignment and signature, then perform physical-device clean-install and same-signer upgrade-install tests.
5. Exercise customer and worker fixtures against the labelled synthetic development backend and capture sanitized evidence.
6. Upload the verified APK and manifest to the approved Development artifact store without overwriting the v1 baseline.

P0-Triage exits only when every P0T ticket has evidence. Remaining provider-scale and race/restart evidence continues in P0-Reliability; it does not justify making unsupported capabilities appear live.

## 5. P0 gate evidence

The P0 successor is ready for internal testing only when all of the following are recorded:

- source/base SHA and a clean task diff;
- same package and signer with `versionCode > 1`;
- deterministic local build command and artifact manifest;
- `npm ci`, focused regression tests, Expo Doctor, export and Gradle assembly results;
- aligned/signature-verified APK with checksum and ABI metadata;
- physical-device clean-install, cold-launch and upgrade-install evidence;
- separate synthetic customer and worker fixtures completing the bounded smoke flow;
- no crash or unintended mutation from the confirmed P0 defects;
- truthful unavailable/disabled treatment for every unsupported high-risk capability;
- sanitized logs and the immutable Development artifact location.

The wider public-beta reliability gate additionally requires restart/replay/race evidence, idempotent lifecycle and money transitions, transactional outbox recovery, realtime/push catch-up, HTTPS/WSS preview, restricted provider keys, operated safety/payment evidence and the acceptance matrices in the master specification.

## 6. External gates

The following can block only their affected capability and must not stall unrelated implementation:

- representative physical Android devices and same-signer upgrade access;
- public preview TLS/WSS and provider-restricted Maps/Places keys;
- a selected push provider and its credentials, if push is enabled;
- Peach sandbox Hosted Checkout, webhook and signed status access;
- KYC mode/vendor decision and lawful data-retention configuration;
- operated SOS/escalation ownership and availability language;
- finance/legal decisions for fees, tax, refunds, chargebacks, payout and marketplace role;
- a real curated worker cohort before public matching claims.

Missing inputs set the capability to off and create a named approval/evidence gate.

## 7. Validation completed for this handoff

| Check | Result |
|---|---|
| Fresh `origin/main` comparison | Documentation branch was `0` behind and `0` ahead before the docs commit |
| Intended scope | Three baseline assets committed in `9de7962`; this handoff is the fourth PR file |
| Markdown structure | Required files and cross-references present; code fences balanced; no trailing whitespace |
| Concept integrity | SHA-256 `598F9E80010674FB26970708D4E8A356232A019758D5705941768E724DE889A0`, 1,786,306 bytes |
| Sensitive/private-path review | No secret-like value, private filesystem path, Drive URL or personal email match |
| Application tests | Not run; application source is untouched by this docs task |
| Deployment | None |

## 8. Repository state and ownership

- Draft PR #10 is review-only. It is not merge or deployment authorization.
- The canonical checkout's original untracked spec and concept copies were preserved and not reset, cleaned, deleted or overwritten.
- The committed files live on the isolated documentation branch and are the reviewable source of truth for this task.
- At the landing-queue front, fetch/prune, merge current `origin/main` without rewriting history, rerun affected checks, and obtain Damian's explicit approval for the exact PR.
- The next code task owns implementation evidence and the successor APK. This docs task owns no runtime or release state.
