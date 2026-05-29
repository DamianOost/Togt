# TOGT Security Compromise Runbook

Status: Internal draft. Not approved for publication.
Date: 2026-05-29
Owner: Damian / TOGT

This is an internal runbook for suspected or confirmed security compromise involving TOGT personal information, credentials, operators, app infrastructure, webhooks, MCP/API keys, or mobile clients. It is not legal advice. Do not send regulator, customer, labourer, vendor, or public notices from this draft without Damian approval and legal review unless a later approved emergency procedure says otherwise.

## Definition

For this runbook, a security compromise means there are reasonable grounds to believe personal information was accessed or acquired by an unauthorized person, or that a system containing personal information was exposed in a way that could enable unauthorized access.

Examples:

- Database credentials or JWT secrets exposed.
- GitHub commit, issue, log, or artifact contains tokens, ID numbers, phone numbers, addresses, exact coordinates, or real booking data.
- API endpoint returns personal information to the wrong user.
- Webhook payload leaks phone, email, full address, exact coordinates, raw notes, or ID numbers to the wrong receiver.
- MCP tool bypasses normal reveal rules.
- Cloudinary, Resend, Peach, VerifyNow, Expo, Fly, Neon, or GitHub reports unauthorized access or data exposure.
- Production API uses non-HTTPS transport for real users.
- A lost/stolen operator device has access to production consoles or secrets.
- Suspicious audit-log entries show unauthorized data reads or privileged actions.

## Severity Triage

| Severity | Examples | Initial posture |
|---|---|---|
| Critical | Confirmed production data exfiltration, live secret compromise, card-data boundary breach, raw SA IDs exposed, active attacker | Contain immediately, preserve evidence, prepare notification assessment. |
| High | Endpoint leaks phone/address/location across users, webhook sends PII to wrong receiver, production DB access suspicious | Disable affected path or key, preserve evidence, assess notification. |
| Medium | Real PII in logs/artifacts with limited access, stale exact location exposed, accidental internal overexposure | Restrict access, redact, document, assess risk. |
| Low | No real data, local fake-data issue, blocked attack with no exposure | Fix and record; notification likely not required. |

## First 30 Minutes

1. Name an incident lead.
2. Open an internal incident note with date/time, reporter, systems involved, and current facts.
3. Do not delete evidence.
4. Stop the bleeding using the narrowest effective containment.
5. Record every containment action and timestamp.
6. Preserve relevant logs, audit rows, webhook delivery IDs, PR/commit IDs, provider alerts, screenshots, and commands run.
7. Decide whether legal/compliance review is needed immediately.

## Detection Inputs

Check these sources based on the suspected issue:

- App/API logs.
- `audit_log` rows around the suspected time window.
- `webhook_deliveries` payloads and delivery status.
- `webhook_subscriptions` owner and URL records.
- API key records, scopes, prefixes, `last_used_at`, and revocation status.
- Auth logs, refresh-token rows, and password reset rows.
- Booking/match records involved in the exposure.
- KYC verification rows.
- Git commit history and PR diffs.
- GitHub secret scanning and repository access history.
- Fly app logs and secret/version history, if Fly is used.
- Neon database access, backups, query logs, and connection history, if Neon is used.
- Cloudinary asset history and access logs, if available.
- Resend email logs.
- VerifyNow request logs.
- Peach payment/webhook logs.
- Expo push notification logs.
- Mobile release/build configuration.

## Containment

Choose the smallest containment action that stops further exposure.

Possible containment actions:

- Revoke or disable a compromised API key.
- Disable a webhook subscription.
- Disable webhook dispatcher if payload leakage is ongoing.
- Disable an affected MCP tool or scope.
- Block or patch a leaking API route.
- Remove a public artifact that contains personal information, while preserving an internal evidence copy.
- Rotate a compromised secret after preserving evidence of where it was exposed.
- Invalidate refresh tokens for an affected account.
- Disable push notifications if payloads are leaking data.
- Set a maintenance banner or temporarily disable booking/match creation if needed.

Do not:

- Force-push or rewrite shared git history.
- Delete production records as a first response.
- Rotate credentials without recording what changed and why.
- Send customer/regulator/vendor/public messages before approval, unless a later approved emergency runbook authorizes it.

## Evidence Capture Checklist

Capture:

- Incident timeline in Africa/Johannesburg time.
- Date/time first detected.
- Date/time exposure likely started.
- Date/time exposure stopped.
- Reporter and systems involved.
- Affected endpoint, job, webhook, MCP tool, operator, or provider.
- Affected data categories.
- Number of potentially affected users, if known.
- User IDs, booking IDs, match IDs, webhook delivery IDs, API key prefixes, and audit IDs. Avoid copying raw PII into the incident note.
- Relevant commit hashes, PR links, deploy IDs, provider alert IDs, and log references.
- Screenshots only when needed, with sensitive values redacted in working copies.
- Exact containment actions taken.

Keep raw evidence in a restricted location. The working incident note should use IDs and redacted snippets.

## Assessment

Answer these questions before deciding notification posture:

- Was real customer or labourer data involved?
- Was the data accessed or only at risk?
- What categories were involved: account, contact, address, exact location, notes, KYC, payment reference, security secret?
- Did raw SA ID numbers, selfie/biometric data, or exact live location appear?
- Was payment card data involved? TOGT should not store it; if card data appears, treat as critical and reassess PCI scope immediately.
- How many data subjects may be affected?
- Who received or could access the data?
- Was the receiver authorized, internal, external, public, or unknown?
- Was the data encrypted, hashed, tokenized, or otherwise protected?
- Can the recipient be compelled to delete it?
- Is there risk of harm, fraud, identity theft, physical safety issue, discrimination, or reputational harm?
- Is the vulnerability fully contained?
- Are operators or subprocessors involved?

## Notification Decision Checklist

Use this checklist to prepare the legal/compliance decision. Do not treat it as a final legal conclusion.

- Is there reasonable belief that personal information was accessed or acquired by an unauthorized person?
- Are affected data subjects identifiable?
- Is notification to the Information Regulator required?
- Is notification to affected data subjects required?
- Should any operator, payment processor, app platform, or provider be notified under contract?
- Should law enforcement or cyber incident support be engaged?
- Does notification create additional risk by revealing exploitable details?
- Has Damian approved the notification path?
- Has legal review approved wording where practical?

## Draft Regulator Notification Inputs

Prepare these facts for review:

- TOGT contact person and contact details.
- Description of the incident.
- Date/time discovered.
- Date/time contained.
- Likely date/time of compromise.
- Categories of personal information involved.
- Number or estimate of affected data subjects.
- Systems/operators involved.
- Measures already taken.
- Measures planned.
- Whether data subjects have been notified.
- Recommended protective steps for data subjects.
- Open uncertainties.

## Draft Data Subject Notification Inputs

Prepare plain-language wording for review:

- What happened.
- When it happened or when TOGT discovered it.
- What information may be involved.
- What TOGT has done to contain it.
- What TOGT is doing next.
- What the user can do to protect themselves.
- How to contact TOGT.
- How to complain to the Information Regulator, if applicable.

Avoid:

- Speculation.
- Blame.
- Overclaiming that all risk is eliminated.
- Sharing technical exploit detail that could worsen the incident.
- Including other users' personal information.

## Technical Remediation

Depending on root cause, remediation may include:

- Add or fix serializer/reveal-rule tests.
- Patch route authorization.
- Sanitize webhook/MCP payloads.
- Redact audit metadata before write.
- Add log redaction.
- Revoke and reissue API keys.
- Rotate JWT, webhook, provider, database, or deployment secrets.
- Update mobile production API URL guard.
- Patch Cloudinary upload controls.
- Reduce push notification payloads.
- Add retention sweeper for old webhook payloads, reset rows, revoked refresh tokens, or stale location.
- Add monitoring for repeated access-denied or unexpected high-volume reads.

Every remediation PR should include:

- Root cause.
- Files changed.
- Tests added.
- Commands run.
- Residual risk.
- Follow-up owner.

## Post-Incident Review

Complete this within a reasonable time after containment:

- Final timeline.
- Root cause.
- What data was confirmed affected.
- What data was ruled out.
- What controls worked.
- What controls failed.
- Whether notification was made and when.
- Customer/support follow-up needed.
- Provider/operator follow-up needed.
- Tests or monitoring added.
- Runbook changes needed.
- Open risks and owners.

## Minimum Incident Log Template

```text
Incident ID:
Status:
Severity:
Lead:
Opened at:
Detected by:
Systems involved:
Summary:
Potential data categories:
Potential affected users:
Contained at:
Evidence references:
Actions taken:
Notification decision:
Open questions:
Next review time:
```

## Immediate Contacts To Fill Before Launch

- TOGT incident lead:
- Damian approval channel:
- Legal/compliance reviewer:
- Information Officer contact:
- Fly support/contact:
- Neon support/contact:
- Peach support/contact:
- Expo support/contact:
- Cloudinary support/contact:
- Resend support/contact:
- VerifyNow support/contact:
- GitHub owner/admin:

## Launch Blockers

- Fill incident contacts.
- Confirm where raw incident evidence is stored.
- Confirm who can access production logs and database.
- Confirm provider breach contacts and contractual notice windows.
- Confirm production secrets rotation procedure.
- Confirm customer-data-safety reveal-rule tests are green.
- Confirm no public/customer messages can be sent without approved wording.
