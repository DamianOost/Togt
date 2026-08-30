# TOGT APK Candidate, Promotion and Rollback Runbook

- **Status:** Required for all Android builds from 2026-08-30 onward
- **Scope:** Development, internal-beta, preview, and production candidates
- **Legacy/current internal baseline:** `1.1.0` / `versionCode 3` / source `4401ef8a0f19c7a2f8615a4f9abc781746577d39`
- **Next planned candidate:** `1.2.0` / `versionCode 4`

## 1. Operating rule

Building an APK does not lock in a change.

Every APK is a release candidate until the exact tested bytes are explicitly promoted. Source stays on an isolated candidate branch/Draft PR while inspection runs. A clean candidate commit is an immutable test checkpoint, not an approval or merge decision.

The existing `versionCode 3` APK predates this policy. It remains the installed/rollback baseline for upgrade testing, but it is not retroactively claimed to have a complete promotion record.

Bootstrap upgrade identity:

- ARM64 APK SHA-256: `18B7ACDB88689A10F1C407715C2553577C1ED431BB62E5062C2E122A16B6B14E`
- x86_64 APK SHA-256: `04E161CC494B1238C90D3F97AC7EB0832CAFD72EE102AEEB32287F8D31BEF33D`

These hashes identify the only `versionCode 3` artifacts used as upgrade baselines. They are a bootstrap identity record, not retroactive approval; other `versionCode 3` artifacts in the flat historical folder are not interchangeable.

```text
working branch
  → clean candidate commit
  → signed candidate APK + immutable build manifest
  → independent static inspection
  → emulator clean/upgrade tests
  → exact ARM64 APK on physical phone
  → user approval against exact SHA-256
  → promote those exact bytes
  → merge/tag accepted source
```

If any gate fails, reject or supersede the candidate, repair on a new commit, allocate a new candidate identity/version code where required, and repeat. Never rebuild after approval and call the new bytes the same release.

If TOGT simply does not like vc4 before promotion, reject it and keep vc3; no release rollback occurs. If vc4 is already installed, returning to the retained lower-code APK requires uninstall/reinstall and loses app-local data. The data-preserving alternative is the last-known-good code rebuilt with the next higher version code and the same signer.

## 2. What the existing pipeline already proves

`mobile/scripts/android-build.cjs` already provides a strong base:

- refuses a dirty source tree;
- records the exact source commit;
- creates deterministic artifact names;
- checks package, version, SDK, ABI, permissions, and runtime configuration;
- verifies zip alignment and Android v2/v3 signatures;
- verifies the signing-certificate SHA-256;
- checks hardcoded origins and the packaged runtime contract; and
- emits an adjacent manifest with APK SHA-256 and build evidence.

These are artifact-integrity checks. They do not replace independent inspection, emulator/device testing, visual approval, or promotion state.

## 3. Candidate states

Each candidate has one authoritative state:

| State | Meaning |
|---|---|
| `built` | APK and immutable build manifest exist; no independent acceptance yet. |
| `static_verified` | Package, signature, permissions, contents, runtime, and build-manifest checks pass. |
| `emulator_passed` | Required clean/upgrade and automated emulator checks pass. |
| `device_candidate` | Exact ARM64 bytes are ready for physical testing. |
| `user_approved` | User accepted the exact ARM64 SHA-256 and recorded limitations. |
| `promoted` | Exact approved bytes are the current baseline in the promoted store. |
| `rejected` | Candidate failed a gate and cannot be promoted. |
| `superseded` | A newer candidate replaces it; retain evidence but do not install by mistake. |

No state is inferred from a filename, successful build, commit, push, pull request, or merge.
Current state is derived from the latest valid append-only transition record. A mutable convenience index may cache it but cannot authorize promotion.

## 4. Version and identity policy

### 4.1 Android identity

- Keep package `za.togt.app`.
- Keep the approved signer for every same-install upgrade and forward rollback.
- The internal signer certificate is currently:
  - SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
  - SHA-256: `FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C`
- Production signing identity may differ and must be recorded separately; never assume the development signer is production authority.

The SHA-1 is required for the Google Android application restriction. The SHA-256 remains the primary signer-continuity identity.

Version allocation and rollback continuity belong to an explicit `(applicationId, signer SHA-256, distribution track)` stream. Tracks intended to cross-install with the same package/signer must share one monotonic stream. A different signer cannot upgrade the installed internal app merely by using a higher code; signer transition requires a clean install with an approved data-migration plan or an explicitly approved platform signing-key transition.

### 4.2 Version allocation

- Current internal baseline: `1.1.0`, `versionCode 3`.
- Address-pin candidate: `1.2.0`, `versionCode 4`.
- Keep `versionName` numeric. Candidate status belongs in evidence records, not a suffix such as `-rc1`.
- A candidate release set may contain x86_64/emulator and ARM64/device variants, but they share the same source and version code and each has its own runtime hash and APK hash.
- Every candidate release set distributed to or installed on a physical tester consumes a unique monotonically increasing version code. Never reuse one after rejection. Gaps are harmless.
- Any source, Maps-key fingerprint, API origin, packaged-provider flag, signer, or ABI/runtime-contract change creates new bytes and a new build manifest. A physically redistributed change receives a new version code.

Until the legacy baseline has a migrated bootstrap record, the internal allocator floor is `versionCode 3`. The build tool should scan build/promotion/reservation records in the applicable identity stream and reject allocation at or below the highest consumed or reserved physical-candidate version code.

## 5. Artifact storage

Authoritative candidate, evidence, and promoted artifacts stay outside the repository. The builder may continue using ignored `mobile/dist/apk` as replaceable staging output; nothing there is authoritative until independently verified and copied into the immutable external layout:

```text
%LOCALAPPDATA%\TOGT-Android-Build\
  artifacts\
    candidates\<candidate-id>\
    promoted\internal\<version-code>\
    promoted\production\<version-code>\
    rejected\<candidate-id>\
    superseded\<candidate-id>\
  test-evidence\<candidate-id>\
```

Candidate ID:

```text
<track>-<signer-sha256-12>-vc<version-code>-<source-commit-12>-rt<runtime-hash-12>-mk<maps-key-fingerprint-12|disabled>
```

The Maps-key fingerprint is explicit until the build tool cryptographically folds it into the runtime hash. Rotating the packaged Android key therefore cannot collide with another candidate identity from the same source/runtime flags.

Rules:

- never overwrite an APK, build manifest, transition record, or test-evidence file;
- retain the prior promoted APK and source reference;
- promotion copies the exact approved APK/build-manifest bytes without rebuilding;
- re-hash source and destination after copy;
- rejected/superseded folders are retained but clearly non-installable by default; and
- the known unsafe `c907423…` artifact must be classified as `superseded`, not left beside active install candidates.

## 6. Immutable evidence records

Do not mutate one self-hashing receipt as a candidate advances. Use separate append-only records and a non-authoritative mutable index:

1. an immutable build manifest hashes the APK and records build identity;
2. immutable static/emulator/device evidence records hash the build manifest and their evidence;
3. an immutable approval record hashes the APK and build manifest and references the accepted evidence;
4. an immutable promotion record hashes all prior authoritative records; and
5. an optional mutable index exposes the current candidate state for convenience but is never release evidence.

No record contains or attempts to calculate its own hash. Its SHA-256 is calculated after the file is finalized and is stored by the next record or immutable index entry.

### Build manifest

### Artifact identity

- candidate ID;
- APK filename, size, and SHA-256;
- package, `versionName`, and `versionCode`;
- ABI, min/target/compile SDK;
- signing certificate SHA-1 and SHA-256;
- zip-alignment and signature-scheme evidence;
- source commit and parent/baseline commit;
- source tree cleanliness; and
- build command/tool version.

### Runtime and provider identity

- configuration class and API/realtime origins;
- runtime-contract hash;
- packaged feature/provider flags;
- non-secret fingerprint of the packaged Android Maps key;
- final-manifest assertion that Maps metadata is present or absent as expected, without exposing the key;
- permission, exported-component, intent-filter, provider, network-security, and native-library inventory/diff; and
- explicit assertion that `ACCESS_BACKGROUND_LOCATION` is absent unless a separately approved tracking release requires it.

The Maps-key fingerprint is necessary because rotating the key can change APK bytes while source and `maps: google` remain unchanged. It must identify the credential without revealing it.

### Service/data identity

- compatible backend commit/build;
- database migration head or ordered migration digest;
- capability snapshot/policy revision and hash;
- development JWT-secret continuity class, never the secret;
- previous promoted candidate; and
- recovery base commit and reviewed recovery-build commit/recipe;
- recovery configuration class, exact API/realtime origins, packaged provider flags and Maps enabled/disabled state;
- compatible backend build, migration head/digest and local-storage contract; and
- recovery version-code status: unallocated, reserved or consumed.

### Evidence records

- automated check summary;
- emulator/device identifiers and Android versions;
- clean-install and upgrade-install results;
- screenshot/accessibility evidence index;
- crash/logcat result;
- known limitations; and
- hash of the build manifest and any evidence files referenced.

### Approval record

- `approvalScope`: `internal`, `preview`, or `production`;
- candidate ID, exact APK SHA-256, and build-manifest SHA-256;
- accepted evidence-record hashes and known limitations;
- approver and timestamp; and
- task/message reference containing the affirmative approval.

Internal approval is necessary for internal promotion only. It is never sufficient for preview or production. Production additionally requires the named security, privacy, operations, signing, provider, store, and release authorities.

### Promotion or rejection record

- candidate ID and destination/rejection state;
- hashes of the APK, build manifest, evidence, and approval records;
- previous promoted candidate and rollback source;
- immutable destination and post-copy hashes; and
- promotion/rejection reason and timestamp.

## 7. Candidate gate

### Gate A — source and contract

1. Work on the isolated candidate branch/Draft PR.
2. Review the source diff and user-visible capability changes.
3. Run applicable mobile and backend tests, typecheck, lint, Expo Doctor, bundle/export, and contract checks.
4. Confirm no unreviewed migration, permission, native module, provider, signing, or origin change exists.
5. Create a clean candidate commit and record its full hash.

**Pass:** source is reproducible, scoped, reviewed, and green. It is not merged or promoted.

### Gate B — local signed build

1. Allocate the next version code.
2. Build x86_64 and ARM64 variants through the documented local Gradle path.
3. Emit immutable build manifests and filenames.
4. Copy them only into the candidate folder.

**Pass:** deterministic candidate artifacts exist with no overwrite.

### Gate C — independent static inspection

Inspect the built APK rather than trusting only the build process:

- APK hash and build-manifest hash;
- package/version/SDK/ABI;
- alignment, v2/v3 signatures, signer SHA-1/SHA-256;
- permissions, especially location, camera, media, notification, and background location;
- manifest components, exported status, intent filters, providers, schemes, and network-security config;
- 16 KiB ZIP-entry alignment;
- separate ELF `LOAD`-segment/page-size compatibility for every packaged native library, plus Android 16 execution evidence where applicable;
- packaged API/realtime origins and feature/provider flags;
- hardcoded secret/origin scan;
- Maps metadata presence/absence and non-secret key fingerprint; and
- delta from the previous promoted build manifest/promotion record.

The repository should expose a standalone `verify existing APK` command so this check can run without rebuilding.

**Pass:** static evidence matches the intended candidate and no unexplained delta remains.

### Gate D — emulator

1. Clean-install x86_64 against a deterministic synthetic database.
2. Upgrade from the last promoted x86_64 APK, or the recorded grandfathered x86_64 baseline until one exists, with populated local app state.
3. Run the selected critical path, offline/recovery, process death, cold start, auth restore, and crash/logcat checks.
4. Verify previous APK ↔ candidate backend and candidate APK ↔ previous-compatible backend where backend contracts changed.
5. Capture normal and 200% screenshots for affected screens.

**Pass:** functional, compatibility, persistence, accessibility, and visual checks pass on emulator.

### Gate E — physical Android candidate

1. Move the exact statically verified ARM64 candidate into `device_candidate` state.
2. Re-hash it before installation.
3. Same-signer upgrade the user's current promoted APK, or the recorded grandfathered ARM64 baseline until one exists, where preservation is under test.
4. Also clean-install on a separate/reset device when clean-state behaviour matters.
5. Test the affected critical path plus OEM-native behaviour unavailable in emulator.
6. Capture sanitized logs/screenshots and re-hash after evidence collection.

**Pass:** the exact ARM64 SHA-256 is ready for user acceptance.

### Gate F — user approval

Present:

- candidate version and exact APK SHA-256;
- source commit;
- test result and visual evidence;
- known limitations;
- configuration/API target;
- signer continuity; and
- rollback base/recipe, recovery runtime contract, and next available version-code rule.

Record the candidate ID, `approvalScope`, exact hash, limitations, timestamp, and task/message reference.

**Pass:** the user explicitly approves that exact SHA-256 for the named scope. Approval of a screenshot, source branch, earlier APK, or internal build does not approve different bytes or a broader release scope.

### Gate G — promotion

1. Assert `approvalScope` matches the destination and all additional production authorities exist when applicable.
2. Copy the exact user-approved APK and build manifest into the promoted folder without overwrite.
3. Verify source/destination hashes match.
4. Write the immutable promotion record.
5. Tag/merge the accepted source according to repository policy.
6. Update the current-baseline pointer/release notes.
7. Retain the previous promoted APK and rollback source.

Default-branch merge does not itself deploy or promote an APK.

## 8. Location-candidate acceptance (`1.2.0` / `versionCode 4`)

In addition to the standard gate, verify:

- Google Android key is restricted to `za.togt.app` plus the recorded internal signer SHA-1;
- no server key or raw Maps key appears in logs, screenshots, evidence records, or mobile responses;
- independently inspected build evidence reports `groundedMomentumShell: true` and `customerFlagship: true` for the vc4 candidate profile;
- Grounded Address is reachable, legacy `RequestMatch`/`BookingForm` are not registered, and the valid-form legacy link `togt://customer/workers/00000000-0000-4000-8000-000000000001/book` is rejected;
- `ACCESS_BACKGROUND_LOCATION` is absent;
- precise, approximate, denied, and later-granted foreground-location paths;
- GPS centres but does not resolve or confirm;
- tap/drag/accessible placement plus `Use this pin` creates `map_pin`;
- a fresh customer reaches Address → Schedule → Review;
- a six-field edit invalidates the old pin and explains why;
- landmark/access edits preserve coordinates;
- Adjust Pin → Cancel preserves the previous safe address;
- draft/session state survives process death and the `versionCode 3` → `4` upgrade;
- canonical vc4 quote `map_pin` provenance survives booking conversion; match/MCP/direct-booking `NULL`, unsafe or server-issued evidence propagates without allowing those surfaces to manufacture `map_pin`; absent vc3 provenance remains `NULL`/unverified;
- `address_provenance_recording` off/absent causes truthful draft preservation with no incompatible field sent; fresh/on records the vc4 source;
- maps capability-off and expired capability snapshots fail closed truthfully;
- a controlled `maps_display` disable → refresh/expiry → restore drill records before/after snapshot hashes, blocks new picker mounts and pin commits while off, and recovers without losing the draft;
- worker-facing exact-address privacy remains unchanged;
- normal, 200% text, keyboard, Back, and TalkBack paths pass; and
- screenshots match the Grounded Momentum concept board.

## 9. Rollback ladder

Android does not normally install a lower `versionCode` over a higher one. There are therefore three useful rollback layers and one destructive recovery option.

### Layer 1 — capability rollback

Disable the affected runtime feature first:

- `maps_display`
- `address_search`
- `address_resolution`
- `address_provenance_recording` when final vc4 submission itself must stop

This layer contains provider, data-contract and booking-safety incidents. It cannot restore disliked packaged visuals or navigation; those go directly to a same-signer APK forward rollback.

The capability snapshot advertises a 300-second TTL. Wave 1 refreshes on screen focus and app foreground, schedules expiry invalidation, and revalidates `maps_display` immediately before picker open/new pin binding. Confirm revalidates source/revision/fingerprint and any separate address-submission gate; an existing fingerprint-matching `map_pin` is not revoked merely because map display is off. Today a registry change also requires a controlled backend redeploy/restart; a future operated admin kill switch may shorten this while preserving auditability.

This contains feature risk quickly but may truthfully block the affected booking step until a replacement APK is available.

### Layer 2 — backend rollback/forward fix

Redeploy the last compatible backend or a forward fix while retaining additive database structures. Keep both the previous promoted APK and candidate APK contracts supported for at least one release.

Never destructively reverse a migration after new-version writes have occurred.

### Layer 3 — same-signer APK forward rollback

Create an isolated recovery branch from the last known-good base, then add one reviewed recovery commit that changes only the required release identity/configuration compatibility surface. The clean recovery commit—not a dirty checkout of the historical commit—is the reproducible build source.

The recovery commit updates and tests all version-bearing files, including `app.json`, `package.json`/lock metadata where applicable, and build-identity assertions. Build it with:

- the same package;
- the same signer;
- the next higher `versionCode`; and
- a numeric `versionName` that identifies the recovery release.

Example when `versionCode 4` is still the highest consumed/reserved code:

```text
problem candidate: 1.2.0 / versionCode 4
recovery source: accepted 4401ef8 baseline
recovery build commit: reviewed version/config-only commit based on 4401ef8
recovery APK: 1.2.1 / versionCode 5
```

Android treats the recovery build as an upgrade, so application data is preserved if the local storage contract remains backward compatible.

The recovery recipe records its configuration class, exact API/realtime origin, packaged provider flags/Maps state, compatible backend/migration head, local-storage compatibility, base commit and intended version-only diff. For the higher-risk map candidate, rehearse branch creation, the reviewed version/config diff, compatibility checks and the build command before promotion, but do not pre-allocate a fixed recovery version. At incident time allocate `max(consumed or reserved versionCode) + 1`. If TOGT deliberately prebuilds a signed recovery APK instead, its version code is immediately reserved/consumed, its build manifest enters the allocator scan, and the next candidate starts above it even if it was never distributed.

### Layer 4 — clean recovery

Uninstall and install an older retained APK only on an internal test device with explicit acceptance that app-local login, drafts, caches, and preferences will be erased.

Do not use `adb install -d` as the release rollback strategy.

## 10. App-data and session continuity

A same-package, same-signer, higher-version upgrade normally preserves SecureStore and AsyncStorage. That does not by itself prove the app can interpret the preserved data.

Rules:

- keep local schemas backward compatible for at least one promoted release;
- Wave 1 keeps the existing mobile address/draft schema compatible and uses only an additive nullable backend provenance migration; it requires no destructive migration;
- introduce a new storage key or non-destructive copy migration when a schema must change;
- upgrade-test real populated drafts and both role sessions;
- ensure a rollback build can read data written by the candidate; and
- never replay previously completed consequential commands after restore.

The local development backend must use a persistent JWT signing secret stored outside Git for session-continuity testing. A regenerated backend JWT secret can invalidate the phone login even though APK data was preserved; that is a backend-session reset, not an APK migration failure.

## 11. Database and API safety

- Wave 1 adds nullable checked `coordinate_source` columns to `match_requests` and `bookings`, plus optional quote-request snapshot provenance. Historical rows remain `NULL`; no backfill claims verification.
- Match/quote provenance is copied atomically into the resulting booking.
- `saved_verified_place` and `provider_geocode` are server-reserved sources and cannot be naked client assertions.
- Strict source admission is not enforced in Wave 1; a future separately operated gate defaults unavailable/off during the vc3/recovery compatibility window. Audit/recording mode is never represented as universal server verification.
- Deploy the nullable migration and compatible backend first with `address_provenance_recording` off, verify propagation, then enable it for vc4. Against an older/missing capability, vc4 preserves its draft, sends no unknown location field and blocks final submission truthfully.
- Deploy additive backend/API support before the APK where needed.
- Keep the old app compatible for at least one promoted release.
- Saved Places ships separately with an additive, user-scoped schema and protected CRUD.
- Record an ordered migration digest/head in each release record.
- Replace replay-all migrations with a migration ledger and transactional locking before non-synthetic rollout.
- Never down-migrate a database containing post-migration writes; use a forward fix.
- Snapshot restore is for isolated synthetic test environments unless a separately approved incident plan says otherwise.

Compatibility matrix when contracts change:

| APK | Backend | Required result |
|---|---|---|
| previous promoted | candidate | Supported |
| candidate | previous compatible | Supported or explicitly capability-off |
| candidate | candidate | Supported |

## 12. Minimum evidence bundle

```text
immutable build manifest
append-only gate/state records
source diff/commit evidence
automated test summary
static APK inspection
previous-manifest delta
emulator clean-install result
emulator upgrade result
physical-device result
normal and 200% screenshots
TalkBack/permission notes
sanitized crash/logcat result
known limitations
scope-limited user approval record tied to candidate ID and APK SHA-256
promotion record or rejection reason
rollback source and command
```

Evidence should be sufficient to answer:

1. What exact bytes were tested?
2. What source/configuration produced them?
3. What changed from the current baseline?
4. Which automated and physical checks passed?
5. Who approved the exact hash?
6. How do we disable or recover without losing app data?

## 13. Build-tool status and follow-up

Implemented for the location candidate:

- signer SHA-1 in addition to SHA-256;
- immutable internal signer-continuity enforcement so an operator override cannot silently redefine the baseline; a different signer starts an explicit clean-install/signing-transition stream;
- non-secret Maps-key fingerprint in artifact identity;
- final-manifest Maps metadata assertion;
- an explicit post-merge block on unintended `ACCESS_BACKGROUND_LOCATION`; and
- quarantined signing and inspection before final APK/manifest publication.

Still required before promotion, either as pipeline automation or explicitly gathered immutable evidence:

- independent `verify existing APK` mode;
- previous-promoted build-manifest/promotion-record diff;
- append-only gate, approval, rejection and promotion record support; and
- monotonically increasing physical-candidate version allocation.

The remaining controls automate the runbook; until implemented, the same evidence must be gathered explicitly and recorded.

## 14. Definition of a promoted build

An APK is promoted only when:

- the exact bytes passed static, emulator, upgrade, physical-device, visual, and accessibility gates appropriate to the change;
- their SHA-256 matches the immutable build manifest and scope-limited approval record;
- known limitations and runtime configuration are recorded;
- rollback source and next higher version code are prepared;
- destination hashes match after immutable copy; and
- the promotion record names the previous baseline.

Anything else is a candidate, rejected artifact, or superseded artifact—not the release baseline.
