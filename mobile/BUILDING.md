# Mobile internal APK runbook

**Status:** Repository preparation only. Creating or linking an Expo project,
creating/selecting an Android keystore, starting a cloud build, and changing
build-link access remain external actions requiring the approved operator.

## Configuration contract

Every REST request, image upload, and Socket.IO namespace uses one value:

```text
EXPO_PUBLIC_API_BASE_URL
```

- Local Expo Go may use an explicitly configured HTTP development-machine URL.
- An EAS build profile must receive an HTTPS origin with no path, query,
  fragment, or embedded credentials.
- The `preview` profile fails during config evaluation if the value is missing
  or insecure.
- Do not put tokens, API keys, identity data, or vendor credentials in an
  `EXPO_PUBLIC_*` variable; Expo embeds those values in the application.

Copy `.env.example` to the ignored `.env.local` only for local development.
For EAS, configure the non-secret URL in the `preview` environment after the
synthetic backend target is approved.

## Local preflight

From `mobile`:

```powershell
npm ci
npm test
npx expo-doctor

$env:EAS_BUILD_PROFILE = 'preview'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://<approved-synthetic-host>'
npm run export:android
Remove-Item Env:EAS_BUILD_PROFILE
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
```

Expected results:

- all configuration/wiring tests pass;
- Expo Doctor passes every check;
- the Android production bundle exports without a private-network URL;
- running `expo config` with `EAS_BUILD_PROFILE=preview` and no API URL fails;
- `npm audit --omit=dev` is reviewed without using `npm audit fix --force`.

## External build gate

Before creating the first downloadable APK, record approval for:

1. the exact reviewed Git commit and Draft/approved PR;
2. the synthetic HTTPS backend origin and data boundary;
3. the Expo account owner and new/existing EAS project;
4. Android package `za.togt.app`, version code, and keystore ownership/storage;
5. the EAS `preview` environment value for `EXPO_PUBLIC_API_BASE_URL`;
6. whether push notifications are in scope and, if so, the linked EAS project ID;
7. authenticated access to the internal build rather than an unrestricted link;
8. synthetic tester accounts, scenarios, feedback owner, expiry, and cleanup.

After approval, link the project, review the resulting `extra.eas.projectId`
change, and rerun the local preflight. Then create the APK:

```powershell
npm run build:apk:preview
```

The `preview` profile in `eas.json` uses internal distribution and Android
`buildType: apk`, producing a directly installable artifact rather than a Play
Store AAB. Capture the build URL, build ID, Git commit, package/version, signing
credential reference (never private key material), and sanitized build result.

## Current limitations

- A useful standalone APK still requires the separately approved synthetic
  HTTPS backend; the old private-LAN URL is intentionally not embedded.
- Push registration safely skips when the EAS project ID is not linked.
- The 17 remaining production-tree audit findings (9 high, 8 moderate, zero
  critical) are in the SDK 54 Expo/Metro build chain; npm proposes a breaking
  SDK 57 migration. Do not force that upgrade into an APK build without a
  separate compatibility task and full device regression.
- This internal APK is not authorization for real identities, real KYC,
  payment, payout, public-store release, or production data.

## Official references

- [Expo APK builds](https://docs.expo.dev/build-reference/apk/)
- [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [EAS build profiles](https://docs.expo.dev/build/eas-json/)
