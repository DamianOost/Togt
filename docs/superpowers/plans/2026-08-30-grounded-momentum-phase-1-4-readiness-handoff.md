# Grounded Momentum Phase 1–4 readiness handoff

## Outcome

The Grounded Momentum Phase 1–4 implementation is ready for internal Android beta testing. The accepted application source is commit `4401ef8a0f19c7a2f8615a4f9abc781746577d39` on `codex/mobile/grounded-momentum-full-build-2026-08-29`.

This is not a production rollout build. It is a development-signed, local/LAN-connected APK with unsupported production providers truthfully disabled.

## Phase result

- Phase 0: release identity, signer continuity, fail-closed provider policy, APK verification and reliability gates pass.
- Phase 1: approved Grounded Momentum tokens, typography, component foundations, icons and customer/Worker navigation are mounted.
- Phase 2: the customer flagship intake and Project lifecycle, plus the minimum paired Worker path, are implemented against canonical evidence.
- Phase 3: Worker Today, Jobs, quote requests, lifecycle, earnings, account readiness, trust, safety, relationships and retention surfaces are implemented.
- Phase 4: assisted intake, explainable recommendations, contextual safety education and live status are mounted behind packaged and server capability gates.

## Delivered APKs

### ARM64 physical-device candidate

- APK: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-development-lan-1.1.0-vc3-4401ef8a0f19-rtafabb8d9fbf6-arm64-v8a.apk`
- Manifest: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-development-lan-1.1.0-vc3-4401ef8a0f19-rtafabb8d9fbf6-arm64-v8a.manifest.json`
- SHA-256: `18B7ACDB88689A10F1C407715C2553577C1ED431BB62E5062C2E122A16B6B14E`
- API origin: `http://192.168.10.126:3003`

### x86_64 emulator candidate

- APK: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-development-local-1.1.0-vc3-4401ef8a0f19-rt67c702198fe7-x86_64.apk`
- Manifest: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-development-local-1.1.0-vc3-4401ef8a0f19-rt67c702198fe7-x86_64.manifest.json`
- SHA-256: `04E161CC494B1238C90D3F97AC7EB0832CAFD72EE102AEEB32287F8D31BEF33D`
- API origin: `http://127.0.0.1:3003`

Both APKs are `za.togt.app` version `1.1.0` (`versionCode 3`), min SDK 24, target/compile SDK 36, single-ABI, 16 KiB aligned, v2/v3 signature verified, and signed by SHA-256 certificate `FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C`. Each destination APK hash matches its adjacent manifest.

## Verification evidence

- Mobile: 397/397 tests pass.
- TypeScript: `tsc --noEmit` passes.
- Expo Doctor: 18/18 checks pass.
- Backend: 66/66 suites and 485/485 tests pass with open-handle detection.
- Exact x86_64 APK installed on Android API 35 and reported version 1.1.0, versionCode 3 and x86_64 primary ABI.
- Full emulator acceptance passed: clean launch, customer authentication/home/catalogue, Projects list/hub, chat deep link, open quote requests, role/ID guards, truthful backend-unavailable and recovery states, 200% font scaling, sign-out, Worker Today/readiness, Worker Projects/detail, quote request detail, earnings/account/chat guards, and no TOGT crash, ANR or uncaught JavaScript error.
- APK metadata, ABI, signature, signer, 16 KiB alignment and manifest hash were independently rechecked after copying to the Development artifact folder.

## Visual self-review

The final normal customer, 200% customer and Worker screenshots preserve the approved cream/emerald visual system, hierarchy, rounded surfaces, honest disabled states and readable scrolling layout. The self-review found and fixed bottom-tab content entering Android's gesture region. At both 100% and 200% font scale, final tab-label bounds end at pixel 2336 while the system navigation region begins at pixel 2337.

- Customer: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-vc3-customer-home-20260830-052658.png`
- Customer 200%: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-vc3-customer-home-font-200-20260830-052658.png`
- Worker: `C:\Users\PadelZone\AppData\Local\TOGT-Android-Build\artifacts\TOGT-vc3-worker-today-20260830-052658.png`

## Remaining production gates

- Replace the development/local API origins with an approved public HTTPS production API.
- Use the approved release keystore and complete store/distribution signing controls.
- Supply and validate real Peach credentials, signed webhooks, reconciliation and controlled real-money testing before enabling checkout.
- Approve and integrate real KYC, push, maps/location, protected media and assisted-intake providers before enabling their packaged flags.
- Install/upgrade the ARM64 candidate on physical devices and complete OEM, camera/media, GPS, notification, TalkBack and Android 16 runtime checks.
- Complete operational privacy, support, incident-response and store-release approvals.

Until those gates pass, the correct classification is **internal beta ready**, not production ready.
