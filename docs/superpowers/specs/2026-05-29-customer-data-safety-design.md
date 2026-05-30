# Customer Data Safety Design

**Date:** 2026-05-29
**Status:** Draft for autonomous implementation planning
**Owner:** Damian
**Execution intent:** Subagent-driven, auto-approved repository build

## Authority Source

This design is owned by TOGT. If a later executor finds a conflict, use this order:

1. `george-brain/business/togt/IDENTITY.md`
2. `george-brain/business/togt/SCOPE.md`
3. TOGT repo implementation plans under `docs/superpowers/plans/`
4. This spec

Damian's 2026-05-29 instruction for the implementation plan is: execute autonomously with auto approval and subagents at each step.

Interpretation for this spec:

- Auto approval covers local repository work, tests, docs, branch creation, commits, and PR preparation.
- This plan intentionally avoids live external writes, production credential rotation, public/customer communication, and processing real customer/labourer data.
- Auto approval does not include merging the PR; Damian reviews and merges manually.
- If a task discovers it needs one of those excluded actions, the executor writes a follow-up runbook item and continues with local-safe work.

## Goal

Make TOGT safe enough to invite real customers and verified labourers by reducing the personal data stored, preventing excess data exposure through APIs, and establishing POPIA-aligned operating controls before the first real booking.

The core shift is:

> Store less. Reveal later. Audit sensitive access. Keep card data out. Keep KYC raw identifiers out.

## Non-Goals

- No production deployment in this plan.
- No real customer/labourer data migration.
- No live KYC vendor account changes.
- No public privacy policy publication.
- No payment processor configuration changes.
- No credential rotation.
- No deletion of historical production records.

## Primary References

- POPIA Act 4 of 2013: `https://www.justice.gov.za/legislation/acts/2013-004.pdf`
- OWASP API Security Top 10 2023: `https://owasp.org/API-Security/editions/2023/en/0x00-header/`
- OWASP MASVS: `https://mas.owasp.org/MASVS/`
- Expo SecureStore: `https://docs.expo.dev/versions/latest/sdk/securestore/`
- OWASP Password Storage Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`
- PCI DSS SAQ A: `https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf`
- Neon connection pooling: `https://neon.com/docs/connect/connection-pooling`
- Fly secrets: `https://fly.io/docs/apps/secrets/`

## Current TOGT Data Surface

### User account data

Current schema stores `name`, `email`, `phone`, `password_hash`, `role`, `avatar_url`, and `kyc_status`.

Risk:

- Basic personal information is required for marketplace operation.
- Phone numbers are currently returned in more places than necessary.

Design target:

- Keep account data.
- Never return phone/email through public marketplace APIs.
- Use role-specific serializers for all user-bearing responses.

### Labourer profile data

Current schema stores `skills`, `hourly_rate`, `bio`, `id_number`, availability, exact current latitude/longitude, and ratings.

Risk:

- `id_number` should not live on the labourer profile.
- Exact labourer location should not be visible to browsing customers.
- Phone number should not be visible before an accepted job.

Design target:

- Public labourer profile exposes only display-safe fields.
- Public location is approximate, or omitted unless needed for search ranking.
- Exact live location is visible only during an accepted/in-progress booking to the booking customer.
- Remove `id_number` from labourer profile write/read paths.

### Booking and match data

Current schema stores exact address, exact lat/lng, scheduled time, notes, customer, labourer, and status.

Risk:

- Labourers can receive exact address before acceptance through match pings.
- Booking list/detail queries include both sides' phone numbers.
- Webhook/MCP payloads can leak booking PII if event payloads are not minimized.

Design target:

- Customer always sees their own job address.
- Labourer sees broad area before accepting.
- Labourer sees exact address only after accepting and while the job is operationally active.
- Phone reveal is state-based, not automatic.
- Webhook/MCP payloads use sanitized resource summaries by default.

### KYC data

Current KYC flow accepts SA ID number, stores raw `id_number`, parses DOB/sex/citizenship, and can return `id_number` from status.

Risk:

- SA ID numbers are high-risk personal information.
- Parsed DOB/sex/citizenship should not be exposed unless there is a specific operational need.
- Selfie/biometric flows are special personal information territory under POPIA.

Design target:

- Do not store raw ID numbers by default.
- Send ID to the KYC provider, then discard raw input.
- Store `id_last4`, provider, provider reference/request id, status, verified timestamp, and optionally an HMAC blind index for duplicate detection.
- Do not store selfie images in TOGT.
- KYC status response never returns raw ID, DOB, sex, or citizenship.

### Payment data

Current design stores payment amount/status and Peach checkout/result identifiers.

Risk:

- TOGT must never store, process, or transmit card numbers, CVV, track data, or expiry data.

Design target:

- Keep Peach hosted checkout/tokenized flow.
- Store only processor references and TOGT booking/payment status.
- Treat any future card-field implementation as out of scope unless PCI scope is reassessed.

### Mobile data

Current mobile auth uses Expo SecureStore for access and refresh tokens.

Risk:

- SecureStore is appropriate for tokens but is not a substitute for server-side session truth.
- Dev Expo Go uses HTTP LAN URLs, which is acceptable only for fake data.

Design target:

- Keep SecureStore.
- Keep refresh-token rotation/revocation.
- Add a production guard that refuses non-HTTPS API base URLs in release/prod builds.
- Do not log tokens, ID numbers, phone numbers, addresses, or exact coordinates.

## Data Classification

| Class | Examples | Default storage | Default API exposure |
|---|---|---|---|
| Public marketplace | skills, hourly rate, rating, display name, avatar | Yes | Yes |
| Basic personal information | name, email, phone | Yes | Owner only; phone state-gated |
| Operational sensitive | job address, exact GPS, booking notes, chat | Yes, purpose-bound | Booking participant only; state-gated |
| KYC high-risk | SA ID, DOB, sex, citizenship, biometric selfie | Avoid raw storage | Never raw |
| Secrets | passwords, refresh tokens, API keys, webhook secrets, env secrets | Hashed/encrypted only | Never |
| Payment account data | PAN, CVV, expiry, track data | Never | Never |

## Reveal Rules

### Public labourer listing

Allowed:

- `id`
- `name`
- `avatar_url`
- `skills`
- `hourly_rate`
- `bio`
- `is_available`
- `rating_avg`
- `rating_count`
- `distance_km` when the customer supplies their location
- approximate coordinates only if needed for map display

Forbidden:

- `phone`
- `email`
- `id_number`
- exact `current_lat`
- exact `current_lng`
- KYC details beyond a boolean/label such as `verified`

### Customer booking view

Allowed:

- Customer's own address/location/notes.
- Labourer display details.
- Labourer phone only while the booking is `accepted` or `in_progress`.
- Labourer live location only while accepted/in-progress and only when the socket/location flow is active.

Forbidden:

- Labourer raw profile ID number.
- Labourer exact location before accepted.
- Any KYC source fields.

### Labourer booking/match view

Allowed before acceptance:

- Skill needed.
- Scheduled time.
- Hours estimate.
- Broad/approximate area.
- Estimated amount.

Allowed after acceptance and while in progress:

- Exact job address.
- Exact job coordinates.
- Customer phone.
- Customer first/display name.

Forbidden before acceptance:

- Full address.
- Exact coordinates.
- Customer phone/email.
- Raw booking notes if they include sensitive information unrelated to job acceptance.

### Webhooks and MCP

Allowed by default:

- Resource IDs.
- Status.
- Timestamps.
- Amount/currency.
- Non-sensitive public summaries.

Forbidden by default:

- Raw ID numbers.
- Phone numbers.
- Email addresses.
- Full addresses.
- Exact coordinates.
- Raw booking notes.
- Raw chat messages.

PII-bearing webhook/MCP responses require an explicit future scope and a specific reason. This plan does not add that scope.

## Storage Design

### KYC

Add columns:

- `kyc_verifications.id_last4`
- `kyc_verifications.id_blind_index`
- `kyc_verifications.provider_request_id`
- `kyc_verifications.raw_input_discarded_at`

Add a production-required env var:

- `PII_BLIND_INDEX_KEY` - 32 random bytes as 64 lowercase hex chars.

Rules:

- Normalize ID numbers before validation and HMAC.
- Store last 4 digits for user support display only.
- Store HMAC-SHA256 blind index if duplicate detection is needed.
- Never store raw ID in new code paths.
- Leave legacy `id_number` columns unused for one release; schedule a separate verified scrub/drop once no real data has ever entered those columns.

### Location

Rules:

- Labourer exact location can be stored for matching and active-job tracking.
- Public responses round/blur labourer location.
- Labourer location updates should include `location_updated_at` so stale location is not shown as live.
- Stale precise location should be hidden after a short TTL.

### Retention

Minimum retention policy for code:

- Password reset codes: expire quickly; purge expired rows.
- Refresh tokens: revoke/expire and purge old revoked tokens after retention window.
- Match requests: keep operational record, but hide exact address from non-customer after the job is no longer active.
- Webhook deliveries: purge or redact old payloads after retry/audit window.
- KYC raw input: discard immediately; retain only status/provider proof fields.
- Labourer live location: treat as ephemeral and never expose if stale.

## Audit Design

Audit these actions:

- KYC verify attempt.
- KYC status read.
- Phone reveal.
- Exact address reveal to labourer.
- Exact labourer location reveal to customer.
- API key creation/revocation.
- MCP request that accesses user/booking data.
- Webhook delivery generated for a PII-adjacent resource.

If the audit-log primitive from PR #1 has landed, use it. If not, add a minimal compatibility adapter so the plan can proceed without blocking.

Audit payloads must not contain raw ID numbers, full addresses, exact coordinates, phone numbers, tokens, API keys, or webhook secrets.

## API Design

Introduce serializers instead of returning raw SQL rows:

- `serializeUserPrivate(user)`
- `serializeLabourerPublic(row, opts)`
- `serializeLabourerOwnProfile(row)`
- `serializeBookingForUser(row, viewer)`
- `serializeMatchForCustomer(row)`
- `serializeMatchForLabourerCandidate(row)`
- `serializeKycStatus(row)`
- `sanitizeEventPayload(eventType, payload, opts)`

No route should `res.json({ ... result.rows[0] })` with tables containing personal information unless it passes through a serializer.

## Mobile Design

Mobile changes:

- Remove SA ID entry from labourer profile setup; KYC owns ID capture.
- KYC screen shows a concise collection notice before ID entry.
- KYC status shows only verified/pending/failed and optional `id_last4`.
- Labourer job request modal displays broad area until accepted.
- Customer map uses approximate labourer pins before booking and exact live position only once operationally active.
- Production API URL guard rejects `http://` in production/release config.

## Documentation Design

Create draft documents:

- `docs/privacy/popia-data-map.md`
- `docs/privacy/privacy-notice-draft.md`
- `docs/privacy/operator-register.md`
- `docs/privacy/security-compromise-runbook.md`

These are draft internal artifacts until Damian explicitly approves publication.

## Acceptance Criteria

The build is complete when:

- Raw SA ID numbers are no longer written or returned by new app code.
- Public labourer endpoints do not return phone/email/raw exact location.
- Booking responses reveal phone/address/location only by viewer role and booking state.
- Match pings do not expose exact address before acceptance.
- Webhook/MCP event payloads are PII-minimized.
- Mobile UI no longer asks for labourer ID number outside KYC.
- Mobile production config cannot use HTTP.
- Tests cover each reveal rule.
- A full backend test run passes.
- Expo bundle compiles.
- Draft POPIA docs exist and match the implemented data flows.

## Follow-Up After This Build

- Legal review of privacy notice before publication.
- Information Officer registration/confirmation.
- Operator/data-processing term review for Fly, Neon, Peach, Expo, Cloudinary, Resend, VerifyNow, and any SMS provider.
- Production secrets update to include `PII_BLIND_INDEX_KEY`.
- Verified one-time scrub/drop of legacy `id_number` columns after confirming no real data was ever stored there.
