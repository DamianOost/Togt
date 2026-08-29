# TOGT Android internal APK runbook

**Release target:** `za.togt.app`, `versionName 1.1.0`, `versionCode 3`,
`arm64-v8a`.

Local Gradle is the default internal-APK route. Expo Go, an Expo account, and
EAS cloud build are not required. EAS remains an optional provider and does not
block a local build when EAS/Expo Push is disabled.

This runbook creates internal synthetic-data artifacts only. It does not
authorize production data, real KYC, payment, payout, provider activation, or
deployment.

The stable application/deep-link scheme is `togt://`. Both the checked-in base
manifest and generated configuration lock this value; changing it is a release
contract change.

## Runtime and provider contract

All REST, realtime, chat, matching, and upload traffic resolves from one origin:

```text
EXPO_PUBLIC_API_BASE_URL
```

The URL must be an origin with no path, query, fragment, or credentials.

- `EXPO_PUBLIC_APP_ENV=development` may use explicit HTTP only for localhost or
  a private-LAN host. A physical device needs the development machine's reachable
  LAN address; there is no embedded localhost fallback.
- The generated release manifest permits cleartext traffic only for the labelled
  `development-local` and `development-lan` configuration classes. This narrow
  exception supports internal LAN testing; use it only on a trusted network with
  synthetic data.
- `development-secure`, `preview`, and `production` generated release manifests
  explicitly disable cleartext traffic. Their HTTPS requirement remains fail
  closed even if a later Android or Expo default changes.
- `preview` and `production` require HTTPS and reject localhost/private-LAN
  origins, including explicit values.
- Development builds are labelled `TOGT Development` and recorded as
  `development-local`, `development-lan`, or `development-secure` in the
  artifact manifest.
- `EXPO_PUBLIC_PUSH_PROVIDER` defaults to `disabled`. `expo` requires
  `EAS_PROJECT_ID`; `fcm` requires `GOOGLE_SERVICES_JSON` pointing to the
  approved native configuration file.
- `EXPO_PUBLIC_MAPS_PROVIDER=google` requires a package/signature-restricted
  `GOOGLE_MAPS_ANDROID_API_KEY`. The default is `disabled`.
- `EXPO_PUBLIC_ENABLE_PEACH` defaults to `false`. Enabling the client allow-list
  still does not override the server capability gate.
- `TOGT_GROUNDED_MOMENTUM` packages the new role shells and defaults to `true`
  only for development. Preview/production defaults remain `false` until the
  exact release explicitly enables the reviewed UI; setting it to `false`
  provides the packaged shell rollback path.
- `TOGT_CUSTOMER_FLAGSHIP` and `TOGT_WORKER_EXPERIENCE` default to the master
  shell value only in development. `TOGT_RELATIONSHIPS`,
  `TOGT_AI_ASSISTED_INTAKE`, `TOGT_EXPLAINABLE_RECOMMENDATIONS`,
  `TOGT_LIVE_PLATFORM_STATUS`, `TOGT_CONTEXTUAL_SAFETY_EDUCATION`, and
  `TOGT_DARK_THEME` default to `false`
  everywhere. Every child flag is forced off when the master shell is off.
  Packaging assisted intake, recommendation explanations, or live status only
  makes its reviewed UI/fallback available: the action still requires a fresh,
  matching server capability. Package-only or stale evidence always fails
  closed with an explanatory state.
- The internal full-lane profiles package relationships and all Phase 4
  surfaces so the navigation and disabled states can be tested. The current
  server capability contract keeps their provider paths unavailable until the
  corresponding provider/privacy/operations evidence is approved. Camera
  intake, Fast Match, Compare Workers and Diagnostic Visit also remain disabled
  in the mounted intake; Receive Quotes is the only enabled fulfilment path.
- Secrets, keystore material, provider tokens, personal data, and backend
  credentials must never use `EXPO_PUBLIC_*` or be committed.

## Android permission boundary

The application selects an existing profile photo through the operating-system
photo library. It does not record audio, launch a camera, draw overlays, or use
legacy shared-storage access. Prebuild therefore blocks `RECORD_AUDIO`,
`CAMERA`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, and
`WRITE_EXTERNAL_STORAGE` even when a transitive native library declares one.
The APK verifier reads the merged permission set from the signed artifact and
rejects the build if any blocked permission survives manifest merging.

`POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and `VIBRATE` remain because the
reviewed notifications module needs them for user-approved delivery, restore,
and notification-channel vibration. Its merged native dependencies may also
retain `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE`, network-state,
and OEM launcher-badge permissions; the exact merged list is written to every
artifact manifest for review. Their presence does not activate remote push: the
packaged push provider defaults to `disabled`, the server capability must be
current and enabled, and Android notification permission is requested only
inside that capability-gated registration flow. Foreground location and
Internet permissions remain for the documented matching/job and API paths;
background location is not requested.

## Toolchain

Install or point the shell at:

- Node.js compatible with Expo SDK 54, then install exactly from
  `package-lock.json` with `npm ci`;
- JDK 17 through `JAVA_HOME`;
- Android SDK through `ANDROID_SDK_ROOT` (or matching `ANDROID_HOME`);
- platform `android-36`, build-tools `36.0.0`, and NDK `27.1.12297006`.

The locked Android SDK contract is `minSdk 24`, `targetSdk 36`, and
`compileSdk 36`. Minimum and target SDK values are checked from the final APK.
Compile SDK is not claimed from APK badging: preflight checks the generated
React Native version catalog (`node_modules/react-native/gradle/libs.versions.toml`)
against the installed `android-36` platform/build-tools, passes the four locked
SDK/build-tools values to Gradle explicitly, and records that
generated/toolchain/enforced-property evidence in the artifact manifest.

The repository preflight checks every item before prebuild or Gradle runs. It
does not download a JDK/SDK, mutate global settings, or read production secrets.

## Local development build

From `mobile`, set reviewed values in the current PowerShell session. Replace
angle-bracket placeholders; do not put signing passwords in `.env.local`.

```powershell
$env:JAVA_HOME = '<path-to-jdk-17>'
$env:ANDROID_SDK_ROOT = '<path-to-android-sdk>'
$env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
$env:ANDROID_BUILD_PROVIDER = 'local_gradle'
$env:EXPO_PUBLIC_APP_ENV = 'development'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://<private-lan-host>:3000'
$env:EXPO_PUBLIC_ENABLE_PEACH = 'false'
$env:EXPO_PUBLIC_PUSH_PROVIDER = 'disabled'
$env:EXPO_PUBLIC_MAPS_PROVIDER = 'disabled'
$env:TOGT_GROUNDED_MOMENTUM = 'true'
$env:TOGT_CUSTOMER_FLAGSHIP = 'true'
$env:TOGT_WORKER_EXPERIENCE = 'true'
$env:TOGT_RELATIONSHIPS = 'true'
$env:TOGT_AI_ASSISTED_INTAKE = 'true'
$env:TOGT_EXPLAINABLE_RECOMMENDATIONS = 'true'
$env:TOGT_LIVE_PLATFORM_STATUS = 'true'
$env:TOGT_CONTEXTUAL_SAFETY_EDUCATION = 'true'
$env:TOGT_DARK_THEME = 'false'
$env:TOGT_ANDROID_ABIS = 'arm64-v8a'
$env:TOGT_ANDROID_SIGNING_MODE = 'generated-debug'
$env:TOGT_ANDROID_EXPECTED_SIGNER_SHA256 = 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C'

npm ci
npm test
npx expo-doctor
npm run preflight:apk:local
npm run export:android
npm run build:apk:local
```

`prebuild:android:local` is available when the generated native project alone
is needed for inspection. It runs a clean Expo Android prebuild and leaves the
ignored `mobile/android` directory in place. After every prebuild, the repository
asserts that the generated main `AndroidManifest.xml` explicitly matches the
configuration's cleartext policy; a missing or mismatched value fails before
Gradle. `build:apk:local` performs the same preflight/prebuild and then:

1. builds `:app:assembleRelease` with the selected ABI set;
2. applies 16 KiB-compatible zip alignment;
3. signs through the selected signing input without printing passwords;
4. verifies alignment, signature, package, version, SDK, and actual ABI metadata;
5. rejects a signer that differs from the recorded expected fingerprint;
6. writes the deterministically named APK and JSON manifest under
   `mobile/dist/apk`.

The filename is deterministic for the configuration, version, source commit,
exact safe runtime contract, and ABI set. `rt<12>` is the first 12 characters
of the runtime-contract SHA-256:

```text
TOGT-<config-class>-1.1.0-vc3-<12-char-commit>-rt<12>-arm64-v8a.apk
```

The adjacent manifest records the package, version name/code, source commit,
configuration class, Android cleartext policy, build provider, ABI set, SDKs,
actual merged permission set, packaged feature flags, signer SHA-256, artifact
SHA-256, size, alignment, and signature-verification result. It also records the
exact safe API origin, maps/Peach/push selections, and feature flags as a
versioned runtime contract plus its full SHA-256. Provider keys, service files,
passwords, and other secrets are never included. Different API endpoints or
provider/flag selections therefore cannot produce the same artifact identity.
The bundle scan permits the exact configured API origin and a small explicit
set of reviewed dependency documentation, asset-CDN, font-metadata, NetInfo
reachability, and Axios placeholder origins. An unknown hard-coded HTTP or
HTTPS origin—including a standard-port HTTPS origin—fails the build.

`dist` and the generated native project remain ignored; copy only a
verified artifact and manifest to the approved Development artifact store
without overwriting v1.

The build command refuses a dirty source tree so the recorded commit is
authoritative. Commit reviewed source changes before producing a distributable
artifact.

## Signing and upgrade identity

The v1 rollback baseline is:

```text
TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk
package: za.togt.app
versionCode: 1
signer SHA-256: FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C
```

For the labelled development successor, Expo's generated internal debug key is
allowed only because the pipeline verifies that it matches this recorded v1
fingerprint. A mismatch fails before an artifact is accepted and must be
reported as a clean-install build, never an upgrade.

To use a controlled keystore outside the repository, set:

```powershell
$env:TOGT_ANDROID_SIGNING_MODE = 'keystore'
$env:TOGT_ANDROID_KEYSTORE_PATH = '<approved-keystore-outside-repository>'
$env:TOGT_ANDROID_KEY_ALIAS = '<approved-alias>'
$env:TOGT_ANDROID_KEYSTORE_PASSWORD = '<secret-from-approved-store>'
$env:TOGT_ANDROID_KEY_PASSWORD = '<secret-from-approved-store>'
$env:TOGT_ANDROID_EXPECTED_SIGNER_SHA256 = '<approved-certificate-sha256>'
```

Keep passwords in the operator process/approved secret store only. Do not add a
keystore, password, private path, or secret-bearing Gradle properties file to
Git. Preview/production configurations require `keystore` mode; generated debug
signing is rejected. The build resolves both the requested and canonical
keystore paths and refuses any release keystore located anywhere inside the
repository (including `mobile`). Repository ignore rules cover non-example env
files, keystores, signing-property files, `google-services.json`, and
`GoogleService-Info.plist`; deliberately named example files remain trackable.

An Android downgrade cannot install over a higher `versionCode`. Rollback means
retaining v1 for clean-install recovery or rebuilding the prior compatible
source with a new higher code and the same signer. Feature/capability flags are
the immediate runtime rollback mechanism.

## Optional EAS path

EAS is not the default and is not needed for the local pipeline. If TOGT later
selects it, the operator must provide an Expo account/project, `EAS_PROJECT_ID`,
an approved HTTPS preview endpoint, and reviewed EAS Android signing custody.
The optional command remains:

```powershell
npm run build:apk:preview
```

The checked-in `preview` profile is explicitly an internal, full-lane Grounded
Momentum APK: customer, Worker, relationships, assisted-intake,
recommendation-explanation and live-status UI are packaged, while Peach, maps
and push providers remain disabled. Contextual safety education is also
packaged but remains package-and-server gated, locally capped at three displays
with a 14-day cooldown, and dismissible. The Phase 4 actions still require the same
fresh server capability evidence as a local build, so the current backend shows
truthful unavailable notices rather than enabling them from package flags.
Its existence is not proof of provider configuration, remote push delivery,
physical-device success, or release approval.

## P0 release evidence still required

Repository automation proves configuration and artifact identity. P0T-07 still
owns representative physical-device clean install, cold launch, same-signer
upgrade over v1, paired synthetic-role smoke, sanitized ADB evidence, immutable
artifact publication, and rollback verification.
