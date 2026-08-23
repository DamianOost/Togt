# AGENTS.md — TOGT repository contract

## Purpose and ownership

TOGT is Damian Oosthuyzen's South African skilled-labour marketplace. It serves two human roles (customer and labourer) and an agent-native integration channel (REST/OpenAPI, MCP, webhooks, and scoped API keys).

Damian is the sole product owner and release authority. The separate `george-brain/business/togt/` department contract remains the cross-repository authority for business context, external-system permissions, and durable task routing.

## Required context

Before changing this repository, read in this order:

1. This file.
2. `docs/runbooks/git-worktree-promotion.md` before any editing, branch, PR, merge, cleanup, or deployment work.
3. `CLAUDE.md` for the concise project brief.
4. The newest applicable file in `docs/superpowers/specs/`.
5. The newest applicable file in `docs/superpowers/plans/`.
6. The newest dated handoff in `docs/superpowers/plans/`.
7. The actual routes, migrations, tests, mobile configuration, and Git state touched by the task.

Historical reports describe their date, not current truth. Code, migrations, current tests, `origin/main`, and the newest handoff win when older documents disagree.

Current orientation documents:

- `docs/superpowers/specs/2026-08-23-current-state-product-system-spec.md`
- `docs/superpowers/plans/2026-08-23-recovery-to-pilot-plan.md`
- `docs/superpowers/plans/2026-08-23-handoff.md`

## Safety and authority

- L0: read code, Git metadata, documentation, logs, health endpoints, and read-only database evidence.
- L1: change code, tests, migrations not yet applied, and documentation on an isolated task branch/worktree; run local or test-database checks; commit and push a scoped branch; open a PR.
- L2: merge only after Damian approves the exact PR and the required tests are green. A merge does not authorize deployment.
- L3: require Damian's explicit in-conversation approval for production deployment, production schema migration, real customer/labourer data, money movement, vendor settings, production API keys, KYC mode changes, or production secrets.
- L4: never delete production marketplace records, bypass live KYC, disable security controls, commit credentials, expose raw identity/payment data, force-push shared history, or rewrite `main`.

If production or real-user work is not explicitly approved, prepare the branch, test evidence, plan, rollback steps, or reviewable diff and stop at the gate.

## Git workflow

- The full mandatory procedure is `docs/runbooks/git-worktree-promotion.md`. This section is only the short contract and may not be used to bypass the runbook.
- Build in parallel; merge into the default branch in sequence through a single landing queue.
- `origin/main` is canonical.
- Never commit task work directly to `main`.
- One editing task uses one external worktree, one unique `codex/...` branch, and one owner.
- Fetch and prune before task creation; start the branch and worktree directly from current `origin/main`, not from a possibly stale local `main`.
- Record the repository, worktree path, branch, owner, base commit, and bounded scope in the task or handoff.
- Preserve unrelated or uncertain work. Do not reset, clean, restore, drop a stash, or delete a worktree to make a checkout look clean.
- Do not use anonymous stashes as task storage. Prefer a scoped WIP commit and pushed task branch with a recorded handoff.
- Before staging, inspect `git status --short`, `git diff --check`, `git diff --stat`, and the complete diff.
- Stage explicit paths only; never use `git add .` or `git add -A` for agent work.
- Keep commits coherent and reviewable. Record exact tests, pass counts, limitations, security/privacy review, migration impact, deployment requirements, and rollback notes in the PR.
- Respect `.gitignore` and `.gitattributes`, but never treat ignore rules as a substitute for staged-diff and sensitive-data inspection.
- Use `.github/pull_request_template.md`; keep the PR in Draft while work or evidence is incomplete.
- Never force-push or rewrite published history.
- At the front of the landing queue, merge current `origin/main` into the task branch without rewriting history, rerun affected gates, inspect the final diff, and push the catch-up commit.
- Merge through GitHub only after Damian approves the exact PR and every required gate is green. A textually conflict-free PR is not proof of behavioral compatibility.
- After merge, verify the remote result before removing the worktree and branches through Git-aware commands. Never delete a registered worktree directory directly.
- Deployment is a separate approval and evidence gate. A merged PR is not proof that any runtime is current or healthy.
- Do not call work complete while unique changes exist only in a working tree, only locally, on an unreviewed PR, or on an undocumented runtime feature branch.

## Repository map

- `backend/`: Node.js, Express, PostgreSQL, Socket.io, MCP HTTP transport, webhooks, audit log, matching, payments, and KYC.
- `backend/src/db/migrations/`: numbered, additive database migrations applied in order.
- `backend/tests/`: Jest unit/integration suite.
- `backend/tests/smoke/`: end-to-end smoke harness.
- `mobile/`: React Native and Expo customer/labourer application.
- `docs/privacy/`: POPIA data map, operator register, privacy-notice draft, and incident runbook.
- `docs/superpowers/specs/`: approved or proposed system/product designs.
- `docs/superpowers/plans/`: implementation plans and session handoffs.
- `docs/superpowers/research/`: durable product/API research.

## Product invariants

- Labourer earnings and payment state must never be silently corrupted.
- KYC is a trust boundary. A structural ID check is not production identity verification.
- Every mutating agent/API operation must be safe to retry through idempotency or terminal-state handling.
- Privileged and agent activity must remain auditable without writing PII or credentials into audit metadata.
- Public and pre-acceptance responses must not expose raw IDs, contact details, exact live location, full customer address, or raw booking notes outside the documented reveal rules.
- Webhook subscriptions are tenant-scoped and secrets are shown only once, encrypted at rest, and never logged.
- Customer price expectations must be visible before booking; scope and price changes require an explicit accepted change order.

## Verification

Backend prerequisites include Node.js and the `togt_test` PostgreSQL database. Never point automated tests at the real `togt` database.

```text
cd backend
npm ci
npm test
npm run smoke
```

For mobile dependency/configuration checks:

```text
cd mobile
npm ci
npx expo-doctor
```

Before declaring a branch ready:

- run focused checks for the changed surface;
- run the full backend unit and smoke suites for shared backend/API/schema changes;
- inspect `git diff --check`, `git status --short`, and the complete diff;
- scan changed files for credentials, tokens, PII, private paths, and generated artifacts;
- record exact commands, pass counts, timing, and any environment limitation.

The static 2026-08-23 inventory is 218 unit/integration test declarations plus 7 smoke declarations. That is not a green-run claim; run the suites before relying on it.

## Deployment posture

- The Mac mini service on port 3002 is a development/runtime mirror, not proof of public production readiness.
- A healthy feature-branch runtime is not proof that `origin/main` is deployed.
- The May 2026 Fly/Neon deployment documents and branches are planning inputs. They must be reconciled with current `origin/main`, privacy migration 016, current secret inventory, mobile configuration, vendor state, and pricing before execution.
- Production requires explicit approval, a rollback point, current migrations, fresh secret handling, HTTPS, health checks, log verification, smoke tests, and a recorded deployed commit.

## Documentation rules

- Put stable product/system decisions in `docs/superpowers/specs/`.
- Put executable, ordered work in `docs/superpowers/plans/`.
- Put session state, branch/commit evidence, blockers, and the next exact action in the newest dated handoff.
- Label old reports as historical instead of treating them as live runbooks.
- Do not copy credentials, raw IDs, customer data, or private vendor-account details into Markdown.
- Update `CLAUDE.md` when the stack, current operating posture, canonical commands, or primary next step changes.

## Completion report

Return the repository, worktree, branch, commits, PR state, validation evidence, merge/deploy status, remaining risks, approval gates, and next action. Do not call work complete when unique changes are uncommitted, unpushed without explanation, or missing a handoff.
