## Summary

<!-- What outcome does this PR deliver, and why is it needed? -->

## Scope

<!-- List the intended files/surfaces. -->

## Non-goals

<!-- State what this PR deliberately does not change. -->

## Source and ownership

- Owner:
- Task/worktree:
- Branch:
- Base commit from `origin/main`:
- Current `origin/main` catch-up commit:
- Related issue/spec/plan/handoff:
- Dependencies and required landing order:

## Changes

<!-- Describe behavior, API/schema/mobile/runtime/documentation changes and affected consumers. -->

## Validation evidence

<!-- Record exact commands, pass counts, timing where useful, and environment limitations. -->

| Check | Command | Result |
|---|---|---|
| Focused tests |  |  |
| Backend unit/integration |  |  |
| Smoke |  |  |
| Mobile/build/type/lint |  |  |
| Schema/migration |  |  |
| Diff and sensitive-data review |  |  |

## Data, security, and privacy review

- [ ] No secret, token, credential path, raw identity data, customer/labourer PII, payment data, production export, runtime database, or private vendor detail is included.
- [ ] Auth, authorization, KYC, idempotency, audit, webhook scoping, state-based reveal, and money/earnings invariants were reviewed where relevant.
- [ ] Automated tests used only approved local/test data and never the real `togt` database.
- [ ] Any migration is additive/idempotent where required and has a tested rollback or forward-recovery plan.
- [ ] Logs, errors, fixtures, screenshots, and PR evidence are sanitized.

## Deployment and rollback

<!-- State `No deployment` when out of scope. A merge never authorizes a deploy. -->

- Deployment required:
- Approval gate:
- Secret/vendor/DNS/database changes:
- Migration order:
- Health and smoke checks:
- Rollback point and procedure:
- Deployed commit and runtime evidence:

## Risks, limitations, and follow-ups

<!-- Include known gaps, pre-existing failures, deferred work, and approval needs. -->

## Git/GitHub hygiene checklist

- [ ] I read `AGENTS.md`, `CONTRIBUTING.md`, and `docs/runbooks/git-worktree-promotion.md`.
- [ ] This work has one bounded scope, one owner, one unique branch, and one isolated worktree.
- [ ] The branch was created from a freshly fetched `origin/main`; no task work was committed directly to `main`.
- [ ] Unrelated dirty work was preserved and excluded; no broad reset, clean, restore, anonymous stash, or filesystem worktree deletion was used.
- [ ] I reviewed `git status --short`, `git diff --check`, `git diff --stat`, and the complete diff.
- [ ] `.gitignore`/`.gitattributes` behavior was respected, and I did not rely on ignore rules instead of inspecting staged content.
- [ ] I staged explicit paths only and kept commits coherent; no `git add .`, `git add -A`, force-push, or published-history rewrite was used.
- [ ] Required focused and broader checks are green, or each limitation is explicitly recorded above.
- [ ] The PR contains only intended files and is Draft while work, review, or evidence is incomplete.
- [ ] At landing-queue front, current `origin/main` was merged into this branch without rewriting history and affected gates were rerun.
- [ ] Damian has approved this exact PR for merge.
- [ ] Deployment remains separately authorized and separately evidenced.
