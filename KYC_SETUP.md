# TOGT KYC setup and launch gates

**Status:** POC implementation with VerifyNow integration. Not approved for real-user production KYC.

## Current flow

1. Mobile validates that the submitted South African ID has a valid 13-digit structure.
2. The backend repeats structural validation, including checksum and minimum-age checks.
3. If `VERIFYNOW_API_KEY` is configured, the backend calls VerifyNow's `said_verification` endpoint.
4. The database stores only the last four digits, a keyed blind index, provider/status metadata, and approved verification fields. The raw ID is discarded.
5. The user completes the selfie screen. The current backend endpoint records a POC/manual-review result; it does not perform biometric matching.

Relevant code:

- `backend/src/routes/kyc.js`
- `backend/src/services/verifynow.js`
- `backend/src/lib/privacy.js`
- `backend/src/db/migrations/016_customer_data_safety.sql`
- `mobile/src/screens/shared/KYCScreen.js`
- `docs/privacy/popia-data-map.md`

## Environment variables

Use environment variables or the approved secret manager. Never commit values.

```text
VERIFYNOW_API_KEY=
VERIFYNOW_MODE=sandbox
VERIFYNOW_BASE_URL=
PII_BLIND_INDEX_KEY=
```

`PII_BLIND_INDEX_KEY` must be 64 lowercase hexadecimal characters. Production startup fails if it is missing or malformed.

## Local or sandbox verification

1. Configure a dedicated development/test database.
2. Set `VERIFYNOW_MODE=sandbox` and provide an approved sandbox key if vendor-path testing is required.
3. Run all migrations through `016_customer_data_safety.sql`.
4. Start the backend and mobile app.
5. Exercise `POST /api/kyc/verify-id`, `POST /api/kyc/selfie-enroll`, and `GET /api/kyc/status` with synthetic test identities only.
6. Confirm that no raw ID number appears in API responses, logs, audit metadata, webhook payloads, or persisted KYC rows.

## Current limitations

- If VerifyNow is unavailable or throws, the current route falls back to structural-only verification and can mark the user verified.
- The selfie endpoint returns a POC/manual-review result and performs no face match or liveness check.
- The mobile screen exposes a demo-selfie path.
- Retention periods, operator review, Information Officer details, privacy-notice approval, and real-user support procedures are not complete.
- Vendor production mode, credentials, cost, terms, and data-processing posture require current verification and Damian approval.

## Production launch gates

Before processing a real person's ID:

- change vendor failure from fail-open verification to `pending_review` or a fail-closed retry state;
- implement and approve the selfie/manual-review policy, or remove the selfie claim from the launch flow;
- remove or compile out demo controls from production builds;
- prove migration 016 on the target production database;
- confirm no raw IDs exist in production data or backups;
- configure a fresh production `PII_BLIND_INDEX_KEY` through the approved secret channel;
- verify VerifyNow production behavior with synthetic/vendor-approved fixtures;
- complete privacy notice, operator, retention, access, incident, and data-subject procedures;
- run privacy, KYC, unit, and smoke tests and record evidence;
- obtain Damian's explicit approval for the production KYC mode change and any real-user test.

Structural validation is a useful typo/fraud screen. It is not sufficient evidence of identity for a live marketplace.
