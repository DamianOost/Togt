# TOGT POPIA Data Map

Status: Internal draft. Not approved for publication.
Date: 2026-05-29
Owner: Damian / TOGT

This is a working data map for the customer-data-safety branch. It is not legal advice and must be reviewed before TOGT invites real customers or verified labourers.

## Scope

This map covers the current TOGT marketplace flows:

- Customer and labourer account registration and login.
- Labourer profile setup, availability, location updates, ratings, and profile images.
- Customer booking requests, auto-match requests, booking state changes, and live job tracking.
- KYC ID verification, including the customer-data-safety target to avoid raw SA ID storage.
- Password reset, refresh-token sessions, Expo push notifications, Peach payment references, Cloudinary uploads, webhooks, API keys, MCP tools, and audit logs.

It does not cover production data migration, public policy publication, live credential rotation, payroll, tax records, or future in-app messaging beyond the existing `messages` table.

## Data Classes

| Class | Examples | Default posture |
|---|---|---|
| Public marketplace data | Labourer display name, skills, hourly rate, bio, avatar, rating average, rating count | May be shown in marketplace views when needed. |
| Basic personal information | Name, email, phone, role, avatar URL | Store for account operation. Expose only to the account owner or by state-gated booking rules. |
| Operational sensitive data | Booking address, exact job coordinates, booking notes, scheduled time, exact labourer location | Store for fulfilment. Reveal only to participants and only when operationally needed. |
| KYC high-risk data | SA ID number, parsed DOB, sex, citizenship, provider verification result, selfie input | Avoid raw storage in new flows. Store status/proof fields only. |
| Security data | Password hash, refresh-token JTI rows, reset-code hashes, API key hashes, webhook encrypted secrets, audit records | Store hashed, encrypted, or minimized. Never expose raw secrets. |
| Payment data | Booking amount, payment status, Peach checkout ID, Peach result code | Store processor references and status only. Do not store card data. |
| Device and notification data | Expo push token, notification payload metadata | Store only for delivery. Payloads should not contain unnecessary PII. |

## Data Inventory

| Data category | Purpose | Source | Storage table/service | Exposure surface | Retention intent | Deletion or scrub note |
|---|---|---|---|---|---|---|
| Account name | Identify users in the app and marketplace | User registration and profile account flows | `users.name` | Account owner, booking participant views, public labourer display | Keep while account is active | Remove or anonymize as part of future account deletion workflow. |
| Email address | Login, account contact, password reset | User registration | `users.email`, Resend email delivery metadata | Account owner, auth responses, Resend password reset flow | Keep while account is active | Remove or anonymize in account deletion; keep minimal audit trail where legally justified. |
| Phone number | Account contact and state-gated booking contact | User registration | `users.phone` | Account owner; target design reveals to booking participant only after accepted or in progress | Keep while account is active | Remove or anonymize in account deletion; do not expose in public labourer endpoints. |
| Password hash | Authenticate account | User registration and password reset | `users.password_hash` | Never exposed | Keep until changed or account removed | Delete with account; never log. |
| Refresh-token session record | Session rotation, logout, replay detection | Login, refresh, logout | `refresh_tokens` | Internal auth only | Keep until expired plus operational retention window | Purge expired/revoked rows under maintenance sweeper. |
| Password reset code hash | Password recovery | Forgot-password request | `password_resets.code_hash` | Internal auth only | Short TTL, currently 15 minutes | Purge expired and used rows under maintenance sweeper. |
| Role | Route customer/labourer behavior | Registration | `users.role` | Authenticated user and authorization checks | Keep while account is active | Delete or anonymize with account. |
| Avatar URL | Profile display | Upload/profile update | `users.avatar_url`, Cloudinary hosted asset | Public labourer cards/details where applicable | Keep while profile is active | Delete Cloudinary asset when profile/account deletion workflow is approved. |
| Labourer skills | Marketplace discovery | Labourer profile setup | `labourer_profiles.skills`, optional `labourer_services.skill` | Public labourer listing/detail and matching | Keep while profile is active | Delete with profile/account. |
| Labourer hourly rate | Quote and booking amount | Labourer profile setup | `labourer_profiles.hourly_rate`, optional `labourer_services.rate_per_hour` | Public labourer listing/detail, booking/match quote | Keep while profile is active | Delete with profile/account. |
| Labourer bio | Marketplace profile | Labourer profile setup | `labourer_profiles.bio`, optional service descriptions | Public labourer listing/detail | Keep while profile is active | Delete with profile/account. |
| Legacy labourer profile ID number | Historical current-schema field, target is unused | Labourer profile setup in current code | `labourer_profiles.id_number`; also legacy `users.id_number` | Target design: never expose or write in new code | Do not use for new flows | Follow-up scrub/drop after confirming no real data was stored. |
| KYC ID input | Verify labourer identity/age eligibility | KYC screen/API request | Target: not persisted raw; current schema has `kyc_verifications.id_number` | Target design: never returned raw | Discard immediately after verification attempt | Store `id_last4`, blind index, provider reference/status only. Legacy raw column needs verified scrub/drop. |
| KYC derived fields | Verification proof and support | KYC provider/structural parser | Current `kyc_verifications.parsed_dob`, `parsed_sex`, `parsed_is_citizen`; target minimizes exposure | Target design: do not expose via status APIs | Keep only if there is a confirmed business/legal reason | Prefer not to store derived DOB/sex/citizenship in new app responses. |
| KYC provider status | Know whether a labourer is verified | VerifyNow or structural check | `kyc_verifications.status`, `provider`, `verified_name`, `verified_at`, target `id_last4`, `provider_request_id` | User's KYC status; public views may show only a verified label | Keep while verification remains relevant | Remove/anonymize with account unless legal retention requires otherwise. |
| Selfie input | POC manual review signal | KYC selfie endpoint | Current route returns POC response; target is non-persistent | Not exposed | Do not persist | If future biometric storage is introduced, require separate approval and legal review. |
| Labourer availability | Marketplace matching | Labourer app | `labourer_profiles.is_available` | Public marketplace search and matching | Keep latest state | Delete with profile/account. |
| Labourer exact current location | Matching and active job tracking | Labourer app location updates/socket | `labourer_profiles.current_lat`, `current_lng`; socket `location:update` | Target design: approximate public; exact only for accepted/in-progress participant use | Keep latest, treat as ephemeral | Add stale timestamp and hide stale values; purge or null old location where feasible. |
| Customer booking address | Job fulfilment | Customer booking or match request | `bookings.address`, `match_requests.address` | Customer always; labourer only after acceptance/in-progress in target design | Keep as operational booking record | Redact/anonymize after retention window or account deletion if no dispute/tax need. |
| Booking exact coordinates | Job fulfilment and navigation | Customer booking or match request | `bookings.location_lat`, `location_lng`, `match_requests.location_lat`, `location_lng` | Customer always; labourer only after acceptance/in-progress in target design | Keep as operational booking record | Redact/anonymize after retention window where feasible. |
| Booking notes | Job instructions | Customer booking or match request | `bookings.notes`, `match_requests.notes` | Booking participants; target avoids pre-acceptance labourer exposure | Keep as operational booking record | Avoid sensitive unrelated details; redact in old records where required. |
| Booking status and timestamps | Fulfilment and support | App state changes | `bookings.status`, `created_at`, `scheduled_at`, `completed_at`, match state tables | Booking participants, webhooks/MCP summaries | Keep for operational/audit reporting | Keep minimized even if personal fields are later scrubbed. |
| Payment references | Payment reconciliation | Peach hosted checkout and webhook | `payments.peach_checkout_id`, `peach_result_code`, amount/currency/status | Booking participants and internal payment flow | Keep for payment support and finance records | Do not store PAN, CVV, expiry, or cardholder card data. |
| Ratings and comments | Marketplace trust | Post-booking review | `ratings.score`, `comment`, reviewer/reviewee IDs | Public/recent profile reviews as implemented | Keep while marketplace trust record is active | Moderate/remove unlawful or sensitive comments; anonymize on account deletion where required. |
| Chat messages | Participant communication | Existing schema/future messaging | `messages.body`, booking/sender metadata | Booking participants only when feature is enabled | TBD before launch | Must be included in retention/deletion policy before public messaging launches. |
| Push token | Notification delivery | Mobile app registration | `users.push_token`; legacy `push_tokens` table | Internal notification service, Expo | Keep latest token while user is logged in | Clear on logout and account deletion. |
| Profile image upload | Labourer/customer avatar display | Mobile upload route | Cloudinary asset; app stores URL/public ID | Public where avatar is shown | Keep while profile is active | Delete Cloudinary asset when account/profile deletion process exists. |
| Webhook subscriptions | Agent/operator integrations | API/MCP subscription creation | `webhook_subscriptions`, encrypted secret fields | Subscription owner; no raw secret after creation | Keep until revoked/deleted | Delete disabled/unneeded subscriptions; rotate secret on compromise. |
| Webhook delivery payloads | Outbound event delivery/retry | Event emission | `webhook_deliveries.payload` | Subscription owner endpoint; internal retry/audit | Keep only retry/audit window | Target design must minimize payloads and redact/purge old payloads. |
| API keys | Agent/MCP access | API key creation | `api_keys.key_hash`, prefix, scopes | Prefix shown to owner; raw key shown once only | Keep until revoked plus audit retention | Revoke on compromise; never log raw key. |
| MCP tool requests/results | Agent booking/search workflows | MCP server | Tool code, audit log, resource tables | Authorized API key caller | Keep minimized operational/audit records | Target design must use same serializers as REST. |
| Audit log | Accountability, incident review, support | Middleware/routes/MCP/webhook dispatch | `audit_log` | Internal authorized audit review | Retention TBD | Metadata must be redacted before write, not only before read. |

## Exposure Rules To Enforce Before Real Users

### Public labourer search and detail

Allowed:

- ID, display name, avatar URL, skills, hourly rate, bio, availability, rating average, rating count.
- Distance when the customer supplies location.
- Approximate location only if needed for map display.
- Verified label only, not KYC source fields.

Forbidden:

- Phone, email, raw ID number, exact current latitude/longitude, and KYC details.

### Customer booking view

Allowed:

- Customer's own job address, coordinates, notes, scheduled time, booking status, and payment status.
- Labourer display details.
- Labourer phone and exact live location only when the booking is accepted or in progress.

Forbidden:

- Labourer raw ID number, KYC source fields, or exact labourer location before accepted.

### Labourer booking and match view

Before acceptance, show only:

- Skill needed, scheduled time, hours estimate, approximate/broad area, and estimated amount.

After acceptance or while in progress, allow:

- Exact job address, job coordinates, customer display name, and customer phone.

Forbidden before acceptance:

- Full address, exact coordinates, customer phone/email, and raw notes if not needed for acceptance.

### Webhooks and MCP

Default payloads should include resource IDs, event type, status, timestamps, amount/currency where relevant, and non-sensitive summaries. They should not include phone numbers, email addresses, full addresses, exact coordinates, raw booking notes, ID numbers, tokens, API keys, or webhook secrets unless a future approved scope documents a specific reason.

## Retention Intent

The following retention controls still need final approval and implementation evidence:

- Purge expired password reset rows.
- Purge or archive old revoked refresh tokens after the session retention window.
- Redact or purge old webhook delivery payloads after retry/audit windows.
- Hide stale exact labourer location and avoid treating old GPS as live.
- Retain payment references only as needed for support, chargebacks, accounting, and dispute handling.
- Keep audit logs long enough for security review while ensuring audit metadata is minimized.
- Scrub/drop legacy raw ID fields after confirming no real customer/labourer data was written.

## Open Items Before Publication

- Legal review of the public privacy notice.
- Information Officer registration/confirmation.
- Operator agreement review for Fly, Neon, Peach, Expo, Cloudinary, Resend, VerifyNow, GitHub, and any SMS provider.
- Production confirmation that no raw SA ID numbers exist in the database.
- Production confirmation that `PII_BLIND_INDEX_KEY` and other secrets are configured without exposing values.
- Final retention periods approved by Damian.
