# TOGT Operator Register

Status: Internal draft. Not approved for publication.
Date: 2026-05-29
Owner: Damian / TOGT

This register lists current and planned third-party operators or adjacent service providers used by TOGT. It is a working draft for review, not a signed legal register. Confirm actual production providers, regions, contracts, and data-processing terms before launch.

## Review Legend

| Status | Meaning |
|---|---|
| In repo | Evidence exists in current TOGT code/config/docs. |
| Planned | Included in the customer-data-safety or deployment plan but must be verified before production. |
| Needs review | Contract, region, retention, or security terms need review before real data use. |
| Not configured | Code supports it but production use is not confirmed. |

## Operators And Service Providers

| Provider | Current status | Role | Personal information involved | Secrets/config | Cross-border note | Minimum review before launch |
|---|---|---|---|---|---|---|
| Fly.io | Planned | Backend application hosting for TOGT API | API traffic, auth tokens in transit, booking data processed by app runtime | Fly app secrets, production env vars | Region must be confirmed in deployment config | Confirm region, TLS, logs, access controls, incident process, and DPA/data-processing terms. |
| Neon | Planned | Managed PostgreSQL database | Main TOGT database: users, bookings, KYC proof fields, payments, audit logs, webhooks | `DATABASE_URL`, pool settings | Region must be confirmed | Confirm region, backups, encryption, access controls, retention, restore process, and DPA/data-processing terms. |
| Peach Payments | In repo | Hosted payment checkout and payment status verification | Payment amount, currency, booking/payment references; no card data should be stored by TOGT | `PEACH_ENTITY_ID`, `PEACH_ACCESS_TOKEN`, `PEACH_BASE_URL`, `PEACH_WEBHOOK_SECRET` | Peach infrastructure/processing region must be confirmed | Confirm hosted checkout/card-data boundary, webhook signature scheme, PCI responsibility, retention, and support process. |
| Expo | In repo | Mobile runtime ecosystem and push notification delivery | Push tokens and push notification payload metadata | Expo project/app config; push token stored in `users.push_token` | Expo push service may process outside South Africa | Confirm push payload minimization, production build config, push-token retention, and HTTPS-only API guard. |
| Cloudinary | In repo | Profile image upload/storage | Profile images, generated image URLs, public IDs | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Storage/processing region must be confirmed | Confirm folder controls, deletion process, URL exposure, moderation needs, and DPA/data-processing terms. |
| Resend | In repo | Password reset email delivery | Recipient email address, reset email content, delivery metadata | `RESEND_API_KEY`, `RESEND_FROM` | Email processing region must be confirmed | Confirm sender domain, logs, retention, breach support, and DPA/data-processing terms. |
| VerifyNow | In repo, not necessarily configured | SA ID verification provider | Submitted ID number and name details during verification attempt; provider response/reference | `VERIFYNOW_API_KEY`, `VERIFYNOW_MODE` | Provider location and subprocessors must be confirmed | Confirm production contract, lawful basis, retention, response minimization, provider request IDs, and no selfie storage unless separately approved. |
| GitHub | In repo | Source-code hosting and collaboration | Code, issues/PRs if used; should not contain secrets or real customer data | GitHub credentials, repository access | GitHub may process outside South Africa | Confirm private repo permissions, branch protection, secret scanning, no real PII in commits/issues, and incident access process. |
| Expo/Apple/Google app distribution | Planned | Mobile app build/distribution | App metadata, crash/build logs depending on tooling | Store credentials/build config | Regions and logs depend on store/build tooling | Confirm whether EAS or store consoles receive logs containing PII; ensure release API URL is HTTPS. |
| SMS provider | Not configured | Future OTP/customer notifications if added | Phone number and message content | TBD | TBD | Select provider and review DPA, retention, routing, consent, opt-out, and message minimization before use. |
| MCP clients / agents | In repo | Agentic booking/search/webhook workflows | Booking/search data returned through authorized tools | API keys with scopes, audit logs | Depends on caller runtime | Enforce scopes, minimized serializers, audit events, and no raw secrets/PII in tool outputs. |
| Webhook receivers | In repo | User-owned outbound integrations | Event payloads for booking/match/payment lifecycle | Subscription URL, encrypted webhook secret | Receiver-controlled | Default payloads must be PII-minimized. PII-bearing payloads need future explicit scope and approval. |

## Internal Access Roles

| Role | Expected access | Notes |
|---|---|---|
| Damian / TOGT owner | Repository, deployment, database/admin, provider consoles as needed | Final approval required for publication, production secrets, and launch. |
| Developers/agents | Local code, tests, draft docs, PRs | Must not process real customer/labourer data unless explicitly approved. |
| Support/operator | Future support views and incident triage | Must be limited by role and audited before launch. |
| External legal/compliance reviewer | Draft privacy notice, operator register, runbook | Should receive only needed docs, not raw credentials or production data. |

## Operator Review Checklist

Before real data use, confirm for each active operator:

- Legal name and service role.
- Production region and cross-border transfer position.
- Data-processing agreement or equivalent terms.
- Security controls and encryption posture.
- Subprocessor list, if applicable.
- Retention and deletion process.
- Breach notification/support contact.
- Access control and admin-user list.
- Whether logs may contain personal information.
- Whether TOGT can export/delete data if needed.

## Current Code Evidence

The current repository references these provider surfaces:

- Peach Payments in `backend/src/routes/payments.js` and `backend/.env.example`.
- Expo push notifications in `backend/src/services/notifications.js` and `mobile/app.json`.
- Cloudinary profile-image upload in `backend/src/config/cloudinary.js` and `backend/src/routes/upload.js`.
- Resend password reset email in `backend/src/services/email.js`.
- VerifyNow KYC in `backend/src/routes/kyc.js` and `backend/src/services/verifynow.js`.
- Webhook subscriptions/deliveries in `backend/src/db/migrations/014_webhooks.sql`.
- API keys and MCP tools in `backend/src/db/migrations/013_api_keys.sql` and `backend/mcp-server/tools.js`.
- Audit logs in `backend/src/db/migrations/015_audit_log.sql`.

## Launch Blockers

- Confirm the production operator set. Remove providers not used in production.
- Confirm Fly and Neon if the Fly.io/Neon deployment plan is used.
- Confirm whether Expo push notifications are enabled for launch.
- Confirm whether Cloudinary profile images are enabled for launch.
- Confirm whether VerifyNow is sandbox-only or production.
- Add the chosen SMS provider if SMS/OTP is introduced.
- Confirm there is no real customer/labourer data in GitHub issues, commits, docs, logs, or test fixtures.
- Confirm all public privacy-notice claims match the implemented code, not only the target design.
