# Git, Worktree, and GitHub Promotion Runbook

## Purpose and authority

This is the mandatory Git/GitHub operating procedure for humans and coding agents working in TOGT. It governs task startup, isolated editing, validation, PR review, sequential promotion, cleanup, and the boundary between merge and deployment.

The governing rule is:

> Build in parallel; merge into the default branch in sequence.

`AGENTS.md` contains the short safety and authority contract. This runbook supplies the detailed procedure and may be strengthened by a task-specific plan, but may not be weakened or bypassed by one.

## Verified repository baseline

Verified on 2026-08-23:

| Capability | Evidence | Operating consequence |
|---|---|---|
| Repository | `DamianOost/Togt`, public personal repository | Do not assume organization-only controls. |
| Default branch | `main`; remote HEAD resolves to `origin/main` | `origin/main` is canonical. |
| GitHub Actions | No workflow files or registered workflows were visible | Test and review evidence must be recorded manually in every PR. |
| Rules/protection | Full authenticated settings could not be verified from this Windows session | Never rely on an assumed protection, required check, or merge queue. Manual gates remain mandatory even if GitHub-side controls are later added. |
| Landing | No formal queue is evidenced | Damian or an explicitly appointed integration controller serializes merges. |

Reverify the baseline after a repository transfer, visibility or plan change, CI rollout, ruleset change, or merge-queue setup. GitHub controls are defense in depth; they do not replace this procedure.

## Source-of-truth hierarchy

- GitHub `origin/main` is the canonical code history.
- Local `main` is a mirror and may be stale until fetched.
- A branch named `main` is not proof that it matches the remote.
- An open, cleanly mergeable PR is not proof that its tests pass or its behavior is compatible.
- A merged PR is not proof that the Mac mini, preview, mobile build, database, or any public runtime is current.
- Runtime health on a feature branch is not proof that current `origin/main` works.

Use `main` only for read-only inspection, controlled fast-forward synchronization, and confirmation of merged results. Never commit task work directly to it.

## One task, one worktree, one branch, one owner

Every editing task requires:

- one isolated external worktree;
- one unique temporary task branch;
- one bounded scope and explicit non-goals;
- one owner or integration controller;
- one durable handoff when work crosses sessions;
- one PR against `main` when promotion is requested.

Do not allow two agents to edit the same worktree or branch concurrently. Do not reuse an old feature branch for unrelated work. Do not create permanent agent or functional branches.

Preferred branch pattern:

```text
codex/<area>/<short-task>
```

Examples:

```text
codex/backend/fail-closed-kyc
codex/mobile/api-config
codex/deployment/current-main-preview
codex/docs/pilot-gates
```

External worktrees belong beside, not inside, the canonical clone. A typical Windows path is:

```text
C:\Users\PadelZone\Documents\GitHub\_worktrees\Togt-<short-task>
```

Nested harness worktrees are ephemeral runtime state. They must remain ignored, must never be staged, and must be removed using Git-aware commands.

## Starting an editing task

Before the first durable edit:

1. Confirm the intended repository and remote URL.
2. Read `AGENTS.md`, this runbook, the current spec/plan/handoff, and the applicable source/runtime truth.
3. Inventory the canonical checkout with `git status --short --branch` and `git worktree list --porcelain`.
4. Fetch and prune `origin`.
5. Resolve the remote default branch; do not assume it if repository settings changed.
6. Confirm the proposed branch does not exist locally or remotely.
7. Confirm the proposed external worktree path does not exist.
8. Create the branch and worktree directly from current `origin/main`.
9. Confirm the worktree is clean and its `HEAD` equals the intended base commit.
10. Record repository, worktree, branch, owner, base commit, scope, non-goals, and approval boundary in the task or handoff.

Reference PowerShell flow:

```powershell
$togtRepo = 'C:\Users\PadelZone\Documents\GitHub\Togt'
$togtWorktree = 'C:\Users\PadelZone\Documents\GitHub\_worktrees\Togt-<short-task>'
$togtBranch = 'codex/<area>/<short-task>'

git -C $togtRepo status --short --branch
git -C $togtRepo worktree list --porcelain
git -C $togtRepo fetch --prune origin
git -C $togtRepo show-ref --verify --quiet "refs/heads/$togtBranch"
git -C $togtRepo ls-remote --exit-code --heads origin $togtBranch
git -C $togtRepo worktree add -b $togtBranch $togtWorktree origin/main
git -C $togtWorktree status --short --branch
git -C $togtWorktree rev-parse HEAD
git -C $togtWorktree rev-parse origin/main
```

The branch-existence checks are expected to return non-zero when the name is available. If the canonical checkout is dirty or on another branch, do not change it merely to create the worktree.

## Dirty or uncertain checkout preservation

A dirty or uncertain checkout is a preservation boundary, not a cleanup opportunity.

Never run a broad reset, clean, restore, checkout, stash deletion, branch deletion, worktree deletion, or history rewrite simply to make Git status look clean. First:

1. identify every modified and untracked path;
2. identify its branch, worktree, task, and owner if possible;
3. determine whether it is generated state or unique work;
4. prove unique work is preserved on an appropriately named branch and protected remote ref;
5. record the evidence before any cleanup decision.

For a detached worktree with unique commits, create and push a rescue branch before cleanup. For a clean registered worktree, use `git worktree remove`; never delete the directory directly.

## Scope and WIP discipline

- Touch only files required by the stated outcome.
- Do not absorb unrelated refactors, formatting churn, generated files, or another task's edits.
- Do not silently change shared contracts. Identify and test affected API, mobile, agent, webhook, schema, and runtime consumers.
- Keep caches, dependency directories, logs, coverage, local databases, backups, `.env` files, private paths, and local runtime configuration out of commits.
- Respect `.gitignore` and `.gitattributes`, including LF normalization for portable source/runtime text. Ignore rules reduce accidents but never replace staged-diff and sensitive-data inspection.
- Do not use anonymous stashes as normal task storage. Stashes are repository-shared and easy to orphan.
- Prefer a scoped WIP commit and pushed task branch when work must cross sessions.
- If a stash is unavoidable, give it a unique task/owner message and record it in the handoff. Never pop, drop, or rewrite another task's stash.

## Pre-staging review

Before every commit:

```powershell
git status --short
git diff --check
git diff --stat
git diff
```

Then scan intended files and added lines for:

- secrets, tokens, private keys, credentials, or raw credential paths;
- customer or labourer PII;
- raw identity, KYC, payment, address, location, or booking data;
- private vendor/account details;
- production exports, runtime databases, logs, fixtures, screenshots, or generated artifacts;
- unrelated edits and accidental line-ending churn.

Stage only explicit paths:

```powershell
git add -- AGENTS.md docs/runbooks/git-worktree-promotion.md
```

Never use `git add .` or `git add -A` for agent work.

## Validation requirements

Run focused checks for every changed behavior, then broader checks for shared or cross-cutting surfaces. Distinguish pre-existing failures from failures introduced by the task; do not hide either.

| Changed surface | Minimum evidence before review |
|---|---|
| Documentation only | `git diff --check`; link/path/command verification; sensitive-data scan; complete diff inspection |
| Backend-local behavior | Focused tests plus relevant lint/type/build checks where configured |
| Shared backend/API/auth/schema | Focused tests, full backend unit/integration suite, smoke suite, affected OpenAPI/MCP/webhook clients |
| SQL migration | Test database only; forward application; idempotency where required; rollback or forward-recovery plan; schema-dependent tests |
| Mobile | Focused tests where present, `npm ci`, Expo Doctor, type/build/config verification, affected API contract checks |
| KYC/auth/privacy/payments/webhooks | Boundary and negative-path tests, audit/log/PII review, state-transition and retry/idempotency evidence |
| Deployment/runtime config | Local build, synthetic configuration, migration order, health/deep-health, smoke, secrets inventory by name only, rollback rehearsal or evidence |

The current repository commands and environment boundaries live in `AGENTS.md`. Never point automated tests at the real `togt` database.

Record exact commands, pass counts, timing where material, environment limitations, and any skipped gate in the PR. A declaration count or prior run is not a current green result.

## Commits

- Each commit should represent one coherent concern.
- Use explicit staged paths and inspect the staged diff with `git diff --cached`.
- Use a clear imperative message that describes the outcome.
- Do not amend, squash, rebase, or force-push published/shared work unless a separate reviewed recovery procedure explicitly authorizes it. The normal catch-up method is a merge from current `origin/main`.
- Push the task branch after recoverable milestones when allowed.

## Pull request requirements

After local validation:

1. Push the task branch.
2. Open a PR against `main` using `.github/pull_request_template.md`.
3. Keep it in Draft while implementation, evidence, review, or dependencies are incomplete.
4. Confirm the PR contains only intended commits and files.
5. Record scope, non-goals, source/base state, exact validation evidence, limitations, dependencies, security/privacy review, migration impact, deployment requirements, and rollback.
6. Link the governing spec, plan, handoff, issue, and dependent PRs.
7. Resolve blocking review findings before entering the landing queue.

GitHub's `mergeable` or `clean` label means only that Git can combine the branches at that moment. It does not satisfy behavioral, security, privacy, migration, review, or approval gates.

## Parallel work and the landing queue

Task branches may build, validate, and open Draft PRs in parallel. Default-branch merges are serialized:

```text
isolated task worktrees
        -> reviewed PRs
        -> one landing candidate
        -> catch up and revalidate
        -> one approved GitHub merge
        -> updated origin/main
        -> next candidate
```

Damian or an explicitly appointed integration controller owns the landing order. Shared foundations and contracts land before dependent backend, mobile, documentation, or deployment work. A textual non-conflict does not prove behavioral compatibility.

Avoid stacked PRs. When unavoidable, document each base, dependency, merge order, recovery path, and how the child will catch up after the parent lands.

## Catch-up at landing-queue front

When a PR reaches the front:

1. Stop new unrelated writes to that task branch.
2. Fetch and prune `origin`.
3. Review what changed in `origin/main` since the branch's last proven base.
4. Merge current `origin/main` into the task branch without rewriting published history.
5. Resolve conflicts deliberately in the owning worktree.
6. Rerun focused tests and every affected broader gate.
7. Re-run diff, sensitive-data, schema, security/privacy, deployment, and rollback review as applicable.
8. Inspect the complete final diff against current `origin/main`.
9. Push the catch-up commit and confirm the PR remains scoped.
10. Record the current main commit and fresh results in the PR.

If catch-up exposes a conflict or regression, remove the PR from the queue, return it to its owner, repair it, and re-enter only after validation.

## Merge requirements

A PR may merge only when all of the following are true:

- its scope is clear, complete, and limited to the approved outcome;
- required focused, broad, schema, mobile, build, and smoke checks pass;
- no new failure is hidden behind a pre-existing failure;
- blocking review findings are resolved;
- dependencies have landed in the documented order;
- the branch is caught up and validated against the latest required `origin/main`;
- security, privacy, KYC, auth, payment, webhook, and customer-data implications are resolved where relevant;
- deployment, migration, rollback, and operator steps are documented when runtime behavior changes;
- the PR contains no secrets, credentials, PII, private vendor data, generated runtime artifacts, or unrelated edits;
- Damian has explicitly approved that exact PR for merge;
- the merge is performed through GitHub without rewriting shared history.

No missing GitHub-side enforcement weakens these requirements. Until CI exists, the integration controller must verify and record them manually.

## After merge

After GitHub reports the PR merged:

1. Fetch `origin/main` and verify the PR result is present in the remote default branch.
2. Confirm the task worktree is clean and contains no uncommitted unique work.
3. Confirm the PR, not merely a local branch, is in `MERGED` state.
4. Record the merge commit or resulting `origin/main` commit.
5. Remove the registered worktree using `git worktree remove <path>`.
6. Delete the local task branch. Forced local deletion is acceptable after a squash merge only when the merged PR and clean worktree prove preservation.
7. Delete the remote task branch if appropriate and not removed by GitHub.
8. Run `git worktree prune` and verify the remaining worktree inventory.
9. Update the newest handoff/task state and archive the completed task when appropriate.

Never remove a registered worktree with a recursive filesystem delete.

## Deployment is separate

A successful merge changes GitHub. It does not authorize or prove deployment.

When deployment is explicitly in scope and approved:

1. verify the approved merged commit on `origin/main`;
2. identify the target environment, current deployed commit, owner, maintenance/rollback boundary, and real-data exposure;
3. confirm the target checkout and database state are clean or deliberately preserved;
4. back up or establish the approved rollback point before irreversible steps;
5. use fresh secret references without printing values;
6. apply migrations in the proven order and only to the approved target;
7. rebuild/restart only the affected services;
8. run health, deep-health, smoke, log, mobile/API, and critical-path checks;
9. record the deployed commit, migration state, checks, operator, and rollback point;
10. roll back or stop according to the approved plan if a gate fails.

Production must never silently run from a feature branch. Preview environments must be explicitly labeled and must use synthetic data unless Damian separately approves real-user data.

## Multi-repository work

If a change spans TOGT and another repository, use a separate worktree, branch, commits, validation, and PR in each repository. Cross-link the PRs and state both merge order and deployment order. Never treat a merged foundation PR as proof that a dependent repository or runtime was updated.

## Completion report

Every completed editing task reports:

- repository and remote;
- worktree, branch, owner, scope, and base commit;
- commit hashes and pushed state;
- PR URL and Draft/Open/Merged state;
- exact tests, builds, schema checks, smokes, and limitations;
- review findings and resolutions;
- catch-up/main commit used for final validation;
- merge result or reason promotion remains pending;
- worktree/branch cleanup state;
- deployment state, target, deployed commit, and runtime evidence when applicable;
- remaining risks, approvals, and next exact action.

Do not call work complete while it exists only as uncommitted files, only locally, only on an unmerged branch, or on an undocumented runtime feature branch.

## Hard prohibitions

- No task commits directly to `main`.
- No force-push or shared-history rewrite.
- No broad staging for agent work.
- No reliance on ignore rules as a substitute for reviewing staged content.
- No destructive cleanup of dirty or uncertain work.
- No filesystem deletion of registered worktrees.
- No secret, credential, PII, raw identity/payment data, production export, or private vendor material in Git or PR evidence.
- No automated tests against the real `togt` database.
- No merge without current validation and Damian's exact-PR approval.
- No deployment inferred from merge authority.
- No production, real-user, money, vendor, KYC-mode, auth-secret, or schema action without the approval tier in `AGENTS.md`.
