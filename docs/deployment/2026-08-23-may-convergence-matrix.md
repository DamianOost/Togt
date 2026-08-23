# May deployment convergence matrix

**Date:** 2026-08-23

**Status:** Verified planning input for the current-main deployment candidate; not deployment approval

**Compared sources:** PRs #3 and #4, `origin/feat/fly-production-deploy` at `0564153`, and `origin/main` at `389c81d`

## Purpose

The May deployment work contains useful intent, but it predates the audit log, smoke harness, privacy migration 016, the current secret contract, and current platform/runtime facts. Nothing in the May branches is safe to deploy directly.

This matrix records what the current task kept, replaced, or discarded. “Discard” means “do not carry into the live runbook”; Git history remains intact.

## Files and commits

| May source | Decision | Current evidence | Current replacement |
|---|---|---|---|
| `9979616` / `backend/Dockerfile` | Replace | Node 20 is EOL; the file runs as root, copies the whole context, does not preserve the Git revision, and claims a nonexistent `engines` field. | Pinned Node 24 LTS image and digest, explicit source copies, production-only dependencies, non-root `node` user, OCI revision label, and `/app/REVISION`. |
| `d5513bd` / `backend/.dockerignore` | Keep intent; replace contents | Excluding tests, docs, `.env*`, VCS, and local dependencies is still correct. The old image nevertheless relied on broad `COPY . .`. | Narrow Dockerfile copies plus expanded ignores for logs and platform artifacts. |
| `66c5834` / `backend/fly.toml` | Keep format; replace assumptions | `lhr` is no longer the closest listed Fly region; scale-to-zero pauses the in-process dispatcher; `/health` proves only liveness; no migration gate or revision evidence exists; 256 MB is unproven. | Proposed `jnb`, one always-running Machine, `/health/deep` service check, migration release command, 512 MB starting point, and explicit single-Machine deploy verification. |
| `73544db` and `0564153` / May handoff | Discard as an operating guide | It directs work back to a stale feature branch and contains dated private operator/runtime details. Its test and vendor state are historical only. | Current spec, recovery plan, this matrix, the synthetic-preview runbook, and the current handoff. |
| PR #3 deployment design | Replace | Provider, price, region, backup, privacy, KYC, and mobile assumptions have drifted. It omits migration 016 and treats a live public endpoint as the next automatic step. | Conditional synthetic-preview design in the current spec/runbook, with provider and real-data decisions kept as explicit gates. |
| PR #4 implementation plan | Discard as executable instructions | It is stacked on old history, currently not mergeable, uses shared-checkout Git commands, embeds private host assumptions, performs vendor writes too early, and contains obsolete migration/secret/mobile steps. | Repository worktree runbook plus the current deployment runbook, with L1 preparation separated from L3 infrastructure/deployment actions. |

## Assumptions and decisions

| May assumption or decision | Decision | Verified current truth |
|---|---|---|
| Node 20 LTS | Discard | Node 20 is EOL; Node 24 is the current LTS line as of this review. |
| `package.json` already declares an engine | Discard | No engine was declared on current `main`; this branch adds Node 24/npm 11 constraints. |
| London is Fly’s closest region to South Africa | Discard | Fly currently lists `jnb` (Johannesburg). Capacity and database latency still require pre-deploy measurement. |
| Fly compute is free and total fixed cost is R0 | Discard | Current Fly documentation describes usage billing and legacy-only free allowances. The exact account, trial, and cost must be checked before any vendor write. |
| Neon free-tier limits and seven-day PITR are stable facts | Discard | Plan, restore window, snapshots, region, and data-processing posture are time-sensitive and require current console/contract evidence. |
| Fly + Neon + HC.io is an approved production stack | Replace | It remains a candidate only. Compute, database, monitoring, regions, costs, backups, access, and operator terms require Damian’s explicit package approval. |
| Scale to zero is acceptable | Discard | The webhook dispatcher and maintenance sweepers run inside the API process. Stopping the only Machine can delay delivery/maintenance indefinitely. |
| Single application instance | Keep | Matcher promises and rate limits remain process-local. First preview deployment must use exactly one Machine; `fly deploy` must use `--ha=false`, followed by count verification. |
| Fresh empty database | Keep conditionally | Appropriate only for an explicitly approved synthetic preview. It does not authorize provider creation, migration, or any production-equivalent data. |
| Migrations 001–015 create 15 tables | Replace | Current source contains migrations 001–016 and creates 20 tables. Migration 016 adds the privacy columns and location freshness field. |
| Run migration manually from a private Mac checkout | Replace | The candidate image contains migrations and `fly.toml` uses a pre-release migration command. The deploy must stop if migration fails, and target identity must be verified first. |
| Four generated production secrets are sufficient | Discard | Current production startup also requires `PII_BLIND_INDEX_KEY`; six core names are required: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `PII_BLIND_INDEX_KEY`, and `PEACH_WEBHOOK_SECRET`. |
| Peach uses `PEACH_CLIENT_ID`, `PEACH_CLIENT_SECRET`, and related reconciliation URLs | Discard | Current code reads `PEACH_ENTITY_ID`, `PEACH_ACCESS_TOKEN`, `PEACH_BASE_URL`, and `PEACH_WEBHOOK_SECRET`. Vendor contract verification remains a separate payment task. |
| Existing dev vendor credentials can be copied into preview | Discard | Preview/vendor credentials require an approved source and fresh references; values must never be copied into docs, commands, logs, or PR evidence. |
| Hardcode `https://togt-api.fly.dev` in one mobile service | Discard | The mobile app has five independently resolved URL paths. Endpoint unification and release rejection of private/HTTP targets must land as a separate prerequisite task. |
| `/health` is sufficient deployment evidence | Keep only as liveness | `/health/deep` is the readiness gate for DB and worker freshness. This branch makes both workers tick on startup so deep readiness can become green promptly. |
| HC.io active ping variable exists | Discard | No application code reads `HC_TOGT_BACKEND`. Monitoring must poll the public readiness endpoint or be implemented and reviewed separately. |
| Bootstrap a real operator account/API key during first deploy | Discard from this task | Production identity and API-key issuance are explicitly outside the current authority. Synthetic smoke credentials need separate approval and a documented cleanup path. |
| A successful deploy proves the running Git commit | Replace | Deploy with the reviewed SHA as build arg/image label, then record release ID, image ref/digest, `/app/REVISION`, remote-main SHA, migration evidence, and health/smoke timestamps. |
| Redeploying a previous image rolls back everything | Replace | It rolls back application code only. Database/config/secrets require their own compatibility or recovery procedure; migration 016 is additive and should remain forward-compatible. |

## Current platform evidence used

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Fly regions](https://fly.io/docs/reference/regions/)
- [Fly configuration and release commands](https://fly.io/docs/reference/configuration/)
- [Fly health checks](https://fly.io/docs/reference/health-checks/)
- [Fly deploy behavior](https://fly.io/docs/launch/deploy/)
- [Fly rollback guide](https://fly.io/docs/blueprints/rollback-guide/)
- [Fly pricing](https://fly.io/docs/about/pricing/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)

## Promotion consequence

PR #7 is the documentation foundation and must land before this dependent branch. PRs #3 and #4 remain untouched until Damian decides whether the reviewed replacement supersedes them. The old deployment branch must not be fast-forwarded, merged, deployed, or used as a source of credentials/runtime commands.
