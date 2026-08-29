# TOGT engineering brief

TOGT is a South African services marketplace with separate Customer and Worker
accounts. Do not describe it as an “Uber for labourers”, fabricate supply, or
infer identity, money, availability, location, safety, rating, payout, or
completion claims from missing evidence.

## Authority

The approved implementation contract is
`docs/superpowers/specs/2026-08-23-togt-grounded-momentum-master-spec.md`.
The visual target is `docs/design/togt-grounded-momentum-concept.png`, interpreted
through `docs/design/grounded-momentum-brand-usage.md`. The concept board controls
tone, hierarchy, palette, and surface treatment; illustrative people, prices,
badges, percentages, and lifecycle combinations are not data contracts.

This repository is an internal synthetic-data build baseline, not permission to
deploy, process real identities or money, enable providers, or migrate production
data. Preview and production stay HTTPS/WSS-only.

## Current architecture

- Mobile: Expo SDK 54 / React Native 0.81, TypeScript plus compatibility
  JavaScript, Redux Toolkit, React Navigation, semantic Grounded Momentum UI.
- Backend: Node.js, Express 4, PostgreSQL, Socket.IO, additive SQL migrations.
- Android identity: `za.togt.app`, version `1.1.0`, versionCode `3`.
- APK delivery: local JDK 17 + Android Gradle is the default. Expo Go, EAS, and
  an Expo account are not required. See `mobile/BUILDING.md`.

The additive Grounded role shells are selected by packaged flags. Customer has
Home, Projects, and Account. Worker has Today, Jobs, Earnings, and Account.
Transactional routes sit above those tabs. The legacy shells and APIs remain
only as compatibility surfaces and may not bypass canonical privacy, readiness,
scope, PIN, fulfilment, payment, or completion gates.

## Product and data rules

- One account has one server-authoritative role: `customer` or internal
  compatibility value `labourer` (displayed as Worker).
- Catalogue service ID + version determine pricing, fulfilment, questions,
  risk, and eligibility. Clients do not invent commercial facts.
- Project transactional status, operational phase, payment, payout, safety,
  dispute, and relationship states remain separate evidence domains.
- Consequential mutations require authenticated ownership, strict input,
  server validation, an idempotency key, and optimistic revision where the
  route contract requires it.
- Exact address/contact reveal, scope agreement, start PIN, work start,
  completion, and payment are server-authoritative. Missing or stale evidence
  fails closed.
- Registration records two separate, current policy acceptances. Marketing
  consent is neither bundled nor implied.
- Analytics and logs use allowlisted, PII-safe fields only.

## Capability truth

Peach checkout, cash settlement recording, production KYC, remote push,
background tracking, public live sharing, operated SOS, payout, AI-assisted
intake, recommendations, and Android live updates remain disabled until their
provider, security, privacy, legal, operational, and device gates are proven.
Code or credentials being present is not approval. UI must show an explicit
unavailable/recovery state and must not simulate success.

Foreground in-app location, sanitised non-live booking-detail sharing, the
device dialler, and implemented canonical Project/Worker/trust APIs remain
bounded by their server and packaged capability contracts.

## Repository map

```text
backend/
  src/db/migrations/       additive schema evolution
  src/routes/              legacy compatibility and canonical HTTP routes
  src/services/grounded*/  canonical domain contracts, stores, projections
  tests/                   Jest unit, integration, privacy and security tests
mobile/
  src/design/              semantic tokens, theme, layout, motion
  src/ui/                  reusable accessible Grounded components
  src/data/grounded/       strict versioned DTO adapters
  src/features/            Customer, Worker, trust and intelligence slices
  src/navigation/          additive role shells and route contracts
  tests/                   Node source, model, adapter and build-policy tests
docs/
  design/                  approved concept and implementation guidance
  legal/                   internal-test policy documents only
  superpowers/             master specification, plans and handoffs
```

## Local verification

Backend integration tests require a disposable PostgreSQL database with all
migrations applied. Never point tests at production.

```powershell
cd backend
npm ci
npm run migrate
npm test

cd ..\\mobile
npm ci
npm run typecheck
npm test
npx expo-doctor
```

Before any APK, follow `mobile/BUILDING.md`. The build refuses a dirty source
tree, verifies package/version/ABI/alignment/signature, and emits an adjacent
manifest. Preserve the immutable v1 rollback artifact and never overwrite an
existing Development artifact.

## Definition of done

A feature is complete only when strict server/client contracts, loading/empty/
error/offline/permission states, privacy and capability boundaries,
accessibility, analytics safety, automated tests, and relevant emulator/device
evidence agree. Automated or emulator acceptance does not substitute for the
specified physical-device, provider, legal, operational, or production gates.
