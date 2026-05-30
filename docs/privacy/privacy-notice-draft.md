# TOGT Privacy Notice Draft

Status: Internal draft. Not approved for publication.
Date: 2026-05-29
Owner: Damian / TOGT

This draft is for internal review only. It is written for the planned TOGT customer-data-safety posture and must be checked against the final implemented app before publication. It is not legal advice.

## Who We Are

TOGT is a South African marketplace app that connects customers who need practical work done with labourers who offer services such as plumbing, painting, building, tiling, electrical work, and similar jobs.

This draft uses "TOGT", "we", "us", and "our" to refer to the TOGT app operator.

## What We Collect

We collect only the information needed to create accounts, match customers and labourers, manage bookings, support payments, keep the service secure, and meet operational obligations.

### Account Information

We collect:

- Name.
- Email address.
- Phone number.
- Password, stored as a hash.
- Role, such as customer or labourer.
- Profile image or avatar URL, if supplied.
- Device push token, if push notifications are enabled.

### Labourer Profile Information

For labourers, we may collect:

- Skills.
- Hourly rate.
- Short bio/profile description.
- Availability.
- Rating and review history.
- Approximate or exact location, depending on the app state.
- Verification status.

The customer-data-safety target is that public labourer profile views do not show phone number, email address, raw ID number, or exact live location.

### Customer Booking Information

When a customer creates a booking or match request, we may collect:

- Skill needed.
- Job address.
- Job coordinates.
- Scheduled date and time.
- Estimated hours.
- Booking notes.
- Booking status.
- Payment amount and payment status.

The customer always needs access to their own job details. A labourer should see only a broad area before accepting a job, and the exact address only after acceptance or while the job is in progress.

### KYC and Verification Information

For labourer verification, we may ask for an SA ID number and name details. The intended TOGT posture is:

- The raw SA ID number is used only to perform the verification attempt.
- The raw SA ID number is not stored by new app code.
- TOGT stores only minimized verification proof such as status, provider, provider reference, verified timestamp, ID last four digits, and a blind index if needed for duplicate detection.
- Selfie or biometric input is not stored by TOGT unless a separately approved process and legal review is completed.

Until the customer-data-safety implementation is verified, this notice must not be published as a promise that raw ID storage has already been eliminated.

### Payments

TOGT uses hosted or processor-managed payment flows. We may store:

- Booking payment amount.
- Currency.
- Payment status.
- Peach checkout or result references.

TOGT must not store card numbers, CVV, card track data, or full card expiry data. Any future card-field implementation must be treated as a separate PCI and privacy scope.

### Security and Operational Records

We may keep:

- Refresh-token session records.
- Password reset code hashes and expiry timestamps.
- API key hashes and prefixes.
- Webhook subscriptions and delivery records.
- Audit logs for security, agent activity, privileged access, and operational troubleshooting.

These records should not contain raw passwords, raw tokens, raw API keys, webhook secrets, raw ID numbers, full addresses, exact coordinates, or unnecessary contact details.

## Why We Collect It

We collect and use personal information to:

- Create and manage user accounts.
- Authenticate users and protect sessions.
- Let customers find labourers.
- Let labourers offer services.
- Create, match, accept, perform, complete, cancel, and support bookings.
- Calculate estimated and final payment amounts.
- Process hosted payment references and payment status.
- Verify labourer identity and eligibility where required.
- Send password reset emails and operational notifications.
- Prevent fraud, misuse, unauthorized access, and unsafe marketplace behavior.
- Maintain audit records for security and support.
- Comply with legal, accounting, dispute, and security obligations where applicable.

## Mandatory And Optional Information

Some information is required to use TOGT:

- Name, email, phone number, password, and role are required for account creation.
- Labourer skills and rate are required for a useful labourer profile.
- Job address, coordinates, scheduled time, and skill needed are required to create a booking or match request.
- Verification information may be required before a labourer can accept real work.

Some information may be optional or context-specific:

- Profile image.
- Labourer bio.
- Booking notes.
- Push notifications, depending on device permissions and app configuration.

If required information is not provided, TOGT may not be able to create the account, find a match, process a booking, verify a labourer, or deliver the requested service.

## Who We Share Information With

We share personal information only where needed for the service or a lawful operational reason. Current or planned recipients/operators include:

- Hosting and database providers such as Fly.io and Neon.
- Payment processor Peach Payments.
- Mobile platform and push notification services such as Expo.
- Profile image storage such as Cloudinary.
- Email delivery provider Resend.
- KYC provider VerifyNow, if configured.
- GitHub and deployment/engineering systems for source-code and operational change management.
- Authorized TOGT operators and support staff.
- The other booking participant, but only according to booking state reveal rules.

We do not intend to sell personal information.

## Cross-Border Processing

Some operators may process or store data outside South Africa, depending on their infrastructure region and service configuration. Before launch, TOGT must confirm operator locations and ensure that cross-border processing is handled under appropriate contractual and security safeguards.

This draft should not be published until the operator register is reviewed.

## Booking Visibility Rules

TOGT's intended visibility rules are:

- Public labourer profiles show marketplace-safe fields only.
- Customers see their own booking address and location.
- Labourers see broad area information before accepting a match.
- Labourers see exact job address and customer contact only after acceptance or while the booking is in progress.
- Customers see labourer contact and exact live location only after acceptance or while the booking is in progress.
- Webhook and MCP payloads are minimized by default.

These rules must be verified in the final implementation before this notice is used publicly.

## Security Measures

TOGT's intended controls include:

- Password hashing.
- Refresh-token rotation and revocation.
- Rate limits on authentication and match creation flows.
- Hosted payment flow, without storing card data.
- Encrypted webhook secrets.
- API key hashing.
- Audit logging for sensitive access and privileged actions.
- Minimized KYC storage.
- HTTPS-only production API transport.
- Avoiding logs that contain tokens, ID numbers, phone numbers, addresses, or exact coordinates.

Security is a risk-reduction process, not a guarantee. This notice should not claim that TOGT can prevent every unauthorized access or security incident.

## Retention

TOGT should keep personal information only for as long as it is needed for the purpose collected, operational support, security review, legal obligations, accounting, disputes, or fraud prevention.

Current retention items that need final approval before launch:

- Password reset codes should expire quickly and be purged.
- Refresh tokens should expire or be revoked and old revoked records should be purged after the approved retention period.
- Webhook delivery payloads should be redacted or purged after retry/audit windows.
- Labourer live location should not remain visible after it is stale.
- Raw KYC input should be discarded immediately in new code paths.
- Legacy raw ID columns should be scrubbed or dropped only after confirming no real data is present and after an approved runbook.

## Your Rights

Subject to applicable law, users may request:

- Access to their personal information.
- Correction of inaccurate information.
- Deletion or de-identification where TOGT no longer has a lawful reason to keep it.
- An explanation of how their information is used.
- Objection to certain processing, where applicable.

TOGT needs a confirmed privacy contact and Information Officer details before this section can be published.

## Complaints

Users may contact TOGT first so we can investigate and respond. Users may also have the right to complain to the Information Regulator (South Africa).

This draft needs final contact details and legal review before publication.

## Security Compromise Posture

If TOGT has reasonable grounds to believe that personal information has been accessed or acquired by an unauthorized person, TOGT will assess the incident, contain the issue, preserve evidence, and decide whether notification to affected data subjects and the Information Regulator is required.

Notification wording must be reviewed for each incident. TOGT should not send public or customer notices without Damian approval and legal review unless an approved emergency runbook authorizes it.

## Publication Blockers

Do not publish this notice until:

- The customer-data-safety implementation is complete and verified.
- The operator register is reviewed.
- Information Officer/contact details are confirmed.
- Retention periods are approved.
- Legal review is complete.
- Damian explicitly approves publication.
