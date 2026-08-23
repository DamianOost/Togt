# Synthetic public preview deployment runbook

**Status:** Preparation only. No vendor, secret, database, DNS, deployment, or production API-key action is authorized by this document.

**Intended data boundary:** Synthetic data only

**Candidate compute configuration:** `backend/fly.toml`

## 1. Approval boundary

Stop before using this runbook against any external environment until Damian approves one exact package containing:

- the synthetic public preview milestone and access/data boundary;
- compute, database, and monitoring providers;
- compute/database regions and measured latency;
- current prices, budgets, billing owner, and alerts;
- data-processing, access, backup, restore, retention, and incident posture;
- the exact reviewed and merged `origin/main` commit;
- the target app/database identifiers;
- secret names and their approved storage/reference flow, never values;
- migration, smoke, rollback, and cleanup steps;
- confirmation that mobile endpoint unification and any required preview-access control have landed;
- confirmation that no real identity, customer/labourer record, vendor credential, money, or production API key will be used.

Repository preparation and local tests are L1. Provider creation/configuration, credential generation/setting, external schema writes, first deploy, DNS, and production-equivalent identity/API-key work remain L3 under `AGENTS.md`.

## 2. Candidate architecture and constraints

- One Node API Machine in Fly region `jnb`.
- Exactly one application instance until matcher promises, rate limits, and worker coordination are distributed.
- Always running: the webhook dispatcher and maintenance sweepers are in-process and cannot reliably operate with scale-to-zero.
- External PostgreSQL selected only after region, latency, restore, cost, and data-processing review.
- Public HTTPS through the provider hostname; custom DNS is a later approval.
- Synthetic data only, with an explicit cleanup procedure.
- The Mac service remains development state and is neither a deploy source nor a rollback source.

Fly currently defaults a first service deployment to redundant Machines. The approved first deploy must pass `--ha=false`, and the operator must verify the final managed Machine count is exactly one.

## 3. Required code/config prerequisites

The candidate must contain:

- `backend/Dockerfile` using the reviewed pinned Node image;
- `backend/.dockerignore` excluding secrets, tests, logs, VCS, and local artifacts;
- `backend/fly.toml` with HTTPS, the release migration command, single-instance-compatible settings, and `/health/deep` routing readiness;
- immediate startup ticks for both background-worker freshness signals;
- migrations `001` through `016` in lexical order;
- a Docker image revision label and `/app/REVISION` created from the approved Git SHA;
- no release mobile client until every network path uses one HTTPS resolver.

Before any external action, fetch `origin`, confirm the approved PR is merged, and work from a clean checkout whose `HEAD` equals current `origin/main`. Never deploy a feature branch.

## 4. Configuration inventory by name

Never paste values into this repository, PR text, terminal evidence, or screenshots.

### Production-startup requirements

| Name | Contract |
|---|---|
| `DATABASE_URL` | Approved preview database only; never the local `togt` database. |
| `JWT_SECRET` | Fresh secret reference. |
| `JWT_REFRESH_SECRET` | Fresh and distinct secret reference. |
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | Exactly 64 lowercase hexadecimal characters. |
| `PII_BLIND_INDEX_KEY` | Exactly 64 lowercase hexadecimal characters; required by privacy migration 016 behavior. |
| `PEACH_WEBHOOK_SECRET` | Required by current production startup even when real payment execution remains disabled/out of scope. |

### Required non-secret runtime settings

| Name | Preview expectation |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `API_PUBLIC_BASE_URL` | Approved HTTPS origin used for problem-detail type URIs. |
| `API_PUBLIC_HOST` | Same approved HTTPS origin used in OpenAPI servers. |
| `CORS_ORIGINS` | Explicit approved origins only; never `*`. |
| `VERIFYNOW_MODE` | `sandbox` for synthetic-only verification. This does not make current fail-open KYC suitable for real users. |

### Feature/vendor variables

Configure only when the corresponding approved synthetic path is exercised:

- Peach: `PEACH_ENTITY_ID`, `PEACH_ACCESS_TOKEN`, `PEACH_BASE_URL`.
- VerifyNow: `VERIFYNOW_API_KEY`, `VERIFYNOW_BASE_URL`.
- Resend: `RESEND_API_KEY`, `RESEND_FROM`.
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Database tuning: `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`.

`TOGT_USER_ID` is for the local stdio MCP process, not the HTTP deployment. `RATELIMIT_FORCE` and `WEBHOOK_SSRF_FORCE` are test controls and should not be set in preview production mode.

## 5. Local release-candidate validation

Use only the tracked synthetic test configuration and the approved `togt_test` database.

```powershell
cd backend
npm ci
npm test
npm run smoke
```

Prove migration behavior on an empty disposable database:

1. Confirm the target database name is the disposable test name, not `togt`.
2. Apply `npm run migrate` from zero.
3. Apply it a second time to prove the current migration set is replay-safe.
4. Verify all 20 expected tables exist.
5. Verify migration 016 columns exist on `kyc_verifications` and `labourer_profiles`.
6. Verify all identity/customer/payment tables are empty after schema creation.

Build and inspect the image when a Docker-compatible runtime is available:

```powershell
$candidateCommit = git rev-parse HEAD
docker build --pull --build-arg "TOGT_GIT_COMMIT=$candidateCommit" --tag "togt-preview:$candidateCommit" .
docker image inspect "togt-preview:$candidateCommit"
docker run --rm "togt-preview:$candidateCommit" node --version
docker run --rm "togt-preview:$candidateCommit" sh -lc 'test "$(id -u)" -ne 0 && test "$(cat /app/REVISION)" != unknown'
```

Inspect the image filesystem/context for `.env`, tests, docs, logs, credentials, local paths, databases, and generated artifacts. Start the container only with synthetic values and the approved test database. Confirm `SIGTERM` reaches Node and the process logs a clean shutdown.

## 6. Pre-deploy evidence package

Record without secret values:

- remote URL and default branch;
- approved PR URL and approval statement;
- exact current `origin/main` SHA;
- clean checkout and complete diff evidence;
- Node/base-image tag and digest;
- dependency install, unit, smoke, migration-twice, image-build, non-root, and signal results;
- exact expected secret names versus the provider’s secret-name-only listing;
- provider/app/database identifiers and regions;
- restore point identifier and restore verification evidence;
- previous-good release/image for rollback, if one exists;
- open limitations and stop conditions.

## 7. Migration and deploy sequence

These commands are examples for an approved operator session. Do not run them under this task.

1. Fetch and verify the approved commit:

   ```powershell
   git fetch --prune origin
   git switch main
   git pull --ff-only origin main
   $candidateCommit = git rev-parse HEAD
   git status --short --branch
   ```

2. Confirm the target database is empty synthetic preview state or create the approved restore point. Record the target and migration boundary.

3. Confirm secret names only. Never echo or list values.

4. From `backend`, deploy exactly one managed Machine and tag the image with the Git SHA:

   ```powershell
   fly deploy --app togt-api --ha=false --image-label $candidateCommit --build-arg "TOGT_GIT_COMMIT=$candidateCommit"
   ```

   `fly.toml` runs `npm run migrate` in the provider’s release Machine before changing the application Machine. A non-zero migration result must stop the deploy.

5. Verify that the provider manages exactly one application Machine. Stop if it created more than one.

6. Capture `fly releases --app togt-api --image`, `fly image show --app togt-api --json`, `fly status --app togt-api`, and `fly checks list --app togt-api`. Store sanitized output with the release record.

7. Read `/app/REVISION` in the running Machine and confirm it exactly equals the approved `origin/main` SHA. Also record `FLY_IMAGE_REF`; neither value substitutes for the other.

## 8. Cutover verification

All checks use synthetic identities/data only and require any separate API-key/vendor approval before exercising that path.

1. DNS and TLS resolve from a network outside the operator’s private network.
2. `GET /health` returns 200 and `status: ok`.
3. `GET /health/deep` returns 200 with database, dispatcher, and sweeper checks healthy/fresh.
4. `/.well-known/openapi.json` and `/.well-known/agents.json` resolve.
5. Registration/login/refresh/logout works for synthetic users.
6. Migrations 001–016 and the expected privacy fields are present.
7. No raw ID, contact data, address, exact location, payment detail, credential, or vendor payload appears in logs/audit/webhook evidence.
8. Match, booking, webhook, MCP, audit, and payment-sandbox checks run only when their prerequisite tasks and credentials are approved.
9. The mobile build is not called release-ready until all API/socket/upload/chat clients resolve the same approved HTTPS base URL.
10. Logs show clean startup, immediate worker ticks, no unhandled errors, and no secret/PII output.
11. External monitoring observes `/health/deep`; no nonexistent application ping variable is assumed.
12. The release record contains deployed Git SHA, release ID, image reference/digest, migration result, checks, timestamps, operator, approval, and rollback target.

Any failure stops cutover. Do not reinterpret `/health` success as proof that the database, workers, contracts, KYC, payments, or mobile clients are ready.

## 9. Rollback and forward recovery

Application rollback redeploys a recorded previous image; it does not revert schema, configuration, secrets, or data.

```powershell
fly releases --app togt-api --image
fly deploy --app togt-api --ha=false --skip-release-command --image '<recorded-previous-image-ref>'
```

After rollback, verify Machine count, image reference, `/app/REVISION`, `/health`, `/health/deep`, logs, and synthetic critical paths.

Migration 016 is additive and retains legacy columns, so the immediate recovery strategy is forward-compatible application rollback plus a reviewed forward fix. Do not drop privacy columns or restore a database merely to match an older image. A database restore is a separate destructive approval and must use the approved preview restore procedure.

If no previous-good image exists, first-deploy rollback means removing public routing or stopping the preview according to the approved provider procedure while preserving evidence. It does not mean falling back to the Mac feature branch.

## 10. Stop conditions

Stop and report if any of the following occurs:

- checkout SHA differs from the approved current `origin/main`;
- branch/worktree is dirty or contains unexplained work;
- target database identity is ambiguous or production-equivalent;
- required secret name is absent or a value appears in output;
- migration order, repeat application, or migration 016 verification fails;
- more than one application Machine is running;
- `/health/deep` is not green;
- image revision differs from the approved Git SHA;
- real-user data, real KYC, money, production API keys, or unapproved vendor calls would be exercised;
- rollback target/evidence is missing;
- provider cost, region, backup, or data-processing assumptions cannot be verified.

## 11. Current official references

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Fly app configuration](https://fly.io/docs/reference/configuration/)
- [Fly health checks](https://fly.io/docs/reference/health-checks/)
- [Fly deploy behavior and redundancy](https://fly.io/docs/launch/deploy/)
- [Fly deploy CLI options](https://fly.io/docs/flyctl/deploy/)
- [Fly regions](https://fly.io/docs/reference/regions/)
- [Fly pricing](https://fly.io/docs/about/pricing/)
- [Fly rollback guide](https://fly.io/docs/blueprints/rollback-guide/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
