# TOGT Android internal APK runbook

**Release target:** `za.togt.app`, `versionName 1.0.1`, `versionCode 2`,
`arm64-v8a`.

Local Gradle is the default internal-APK route. Expo Go, an Expo account, and
EAS cloud build are not required. EAS remains an optional provider and does not
block a local build when EAS/Expo Push is disabled.

This runbook creates internal synthetic-data artifacts only. It does not
authorize production data, real KYC, payment, payout, provider activation, or
deployment.

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
- Development builds are labelled `Togt Development` and recorded as
  `development-local`, `development-lan`, or `development-secure` in the
  artifact manifest.
- `EXPO_PUBLIC_PUSH_PROVIDER` defaults to `disabled`. `expo` requires
  `EAS_PROJECT_ID`; `fcm` requires `GOOGLE_SERVICES_JSON` pointing to the
  approved native configuration file.
- `EXPO_PUBLIC_MAPS_PROVIDER=google` requires a package/signature-restricted
  `GOOGLE_MAPS_ANDROID_API_KEY`. The default is `disabled`.
- `EXPO_PUBLIC_ENABLE_PEACH` defaults to `false`. Enabling the client allow-list
  still does not override the server capability gate.
- Secrets, keystore material, provider tokens, personal data, and backend
  credentials must never use `EXPO_PUBLIC_*` or be committed.

## Toolchain

Install or point the shell at:

- Node.js compatible with Expo SDK 54, then install exactly from
  `package-lock.json` with `npm ci`;
- JDK 17 through `JAVA_HOME`;
- Android SDK through `ANDROID_SDK_ROOT` (or matching `ANDROID_HOME`);
- platform `android-36`, build-tools `36.0.0`, and NDK `27.1.12297006`.

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
and ABI set:

```text
TOGT-<config-class>-1.0.1-vc2-<12-char-commit>-arm64-v8a.apk
```

The adjacent manifest records the package, version name/code, source commit,
configuration class, Android cleartext policy, build provider, ABI set, SDKs,
signer SHA-256, artifact SHA-256, size, alignment, and signature-verification
result. `dist` and the generated native project remain ignored; copy only a
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
signing is rejected.

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

The `preview` profile produces an internal APK. Its existence is not proof of
provider configuration, remote push delivery, physical-device success, or
release approval.

## P0 release evidence still required

Repository automation proves configuration and artifact identity. P0T-07 still
owns representative physical-device clean install, cold launch, same-signer
upgrade over v1, paired synthetic-role smoke, sanitized ADB evidence, immutable
artifact publication, and rollback verification.
