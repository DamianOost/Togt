# TOGT — project brief

Read `AGENTS.md` first. This file is the concise orientation; current code, migrations, tests, `origin/main`, and the newest handoff are authoritative.

## Product

TOGT is a South African marketplace for booking verified skilled labourers such as plumbers, electricians, painters, tilers, builders, and carpenters. It supports:

- customers who discover or auto-match with a labourer, book work, track progress, pay, and rate;
- labourers who create a verified profile, publish availability, accept work, complete jobs, and view earnings;
- AI agents that discover TOGT, estimate cost, match/book safely, follow state, receive webhooks, and audit their activity.

The strategic differentiator is the agent-native surface, but the marketplace only works when the human trust, payment, payout, and operational loops work end to end.

## Current posture — 2026-08-23

TOGT is an advanced POC, not a production-ready live marketplace.

Built on `main`:

- customer and labourer registration, login, refresh-token rotation, logout, and password reset;
- labourer profiles, services, availability, location, discovery, ratings, earnings, and images;
- direct bookings plus automatic match dispatch;
- booking lifecycle, change orders/scope confirmation, chat, safety/SOS, notifications, and live location sockets;
- Peach checkout/webhook code plus cash fallback;
- structural SA ID validation and optional VerifyNow DHA checks;
- RFC 9457 errors, idempotency keys, scoped API keys, MCP, OpenAPI/agent discovery, webhooks, and audit logs;
- privacy serializers, KYC blind indexes, state-based reveal rules, and POPIA draft documentation;
- Jest unit/integration tests and seven end-to-end smoke declarations.

Not ready for real users or money:

- no public production endpoint currently resolves;
- the Mac service is running an older deployment branch rather than current `main`;
- KYC fails open to structural-only verification if VerifyNow is unavailable;
- selfie enrolment is a POC/manual-review stub, not biometric verification;
- labourer payouts are not implemented;
- public privacy/legal/operator and retention gates remain open;
- mobile API configuration is duplicated and still points to a private-LAN HTTP address in `app.json`;
- the REST OpenAPI description is incomplete and the agent manifest omits the audit query tool;
- no production app-store build, controlled pilot evidence, or support/dispute operating loop exists.

See the current specification and plan:

- `docs/superpowers/specs/2026-08-23-current-state-product-system-spec.md`
- `docs/superpowers/plans/2026-08-23-recovery-to-pilot-plan.md`
- `docs/superpowers/plans/2026-08-23-handoff.md`

## Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.81, React 19, Expo SDK 54 |
| Backend | Node.js, Express 4, Socket.io |
| Database | PostgreSQL with numbered SQL migrations |
| State | Redux Toolkit, SecureStore for tokens, AsyncStorage for selected offline state |
| Payments | Peach Payments customer checkout; labourer payout not implemented |
| Identity | Structural SA ID validation plus VerifyNow integration |
| Media | Cloudinary |
| Notifications | Expo Push; Resend for password-reset email |
| Agent surface | OpenAPI 3.1, MCP Streamable HTTP/stdio, scoped API keys, webhooks, audit log |

## Repository structure

```text
Togt/
├── AGENTS.md
├── CLAUDE.md
├── backend/
│   ├── mcp-server/
│   ├── src/
│   │   ├── config/
│   │   ├── db/migrations/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── sockets/
│   └── tests/
├── mobile/
│   ├── src/components/
│   ├── src/navigation/
│   ├── src/screens/
│   ├── src/services/
│   └── src/store/
└── docs/
    ├── privacy/
    └── superpowers/{plans,research,specs}/
```

## State machines

Booking:

```text
pending -> accepted -> in_progress -> completed
pending|accepted -> cancelled
```

Match request:

```text
pending -> matched
pending -> expired|cancelled
```

Payment:

```text
pending -> paid|failed|refunded
```

There is no labourer payout state machine yet.

## Local commands

Backend:

```text
cd backend
npm ci
npm run migrate
npm run dev
npm test
npm run smoke
```

Mobile:

```text
cd mobile
npm ci
npx expo-doctor
npx expo start
```

Use a dedicated test database for automated tests. Do not run destructive tests against real or production-equivalent data.

## Current primary next move

Review and validate the fresh current-main deployment-convergence candidate, land the documentation foundation first, then close the separate KYC, mobile endpoint, agent-contract, payment, and preview-access gates. Only after those branches and a complete approval package are reviewed should TOGT seek authority for a synthetic public preview. Do not resume the old deployment plan at its secret-generation step.
