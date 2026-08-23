# Contributing to TOGT

TOGT uses a strict branch, worktree, review, and promotion process because the product touches identity verification, personal data, bookings, payments, and future money movement.

## Mandatory reads

Before making a durable edit, read:

1. `AGENTS.md` for repository authority, safety boundaries, required context, and verification rules.
2. `docs/runbooks/git-worktree-promotion.md` for the complete Git/GitHub procedure.
3. The current product/system spec, recovery plan, and newest handoff under `docs/superpowers/`.
4. The source, migrations, tests, and runtime configuration affected by the task.

## Non-negotiable workflow

- Build in parallel; merge into `main` in sequence.
- Treat `origin/main` as canonical and local `main` as a possibly stale mirror.
- Never perform task work directly on `main`.
- Use one external worktree, one unique task branch, one bounded scope, and one owner per editing task.
- Start from freshly fetched `origin/main`.
- Preserve every dirty or uncertain checkout until unique work is proved safe elsewhere.
- Stage explicit paths only. Do not use broad staging for agent work.
- Respect `.gitignore` and `.gitattributes`; still inspect the staged diff for sensitive or generated material.
- Never force-push or rewrite shared history.
- Push a reviewable branch and use the repository PR template.
- Catch up with the latest `origin/main` and rerun affected validation at the front of the landing queue.
- Merge only through GitHub, only after Damian approves the exact PR, and only when all required evidence is green.
- Treat deployment as a separate action requiring separate authority, rollback, smoke, and runtime evidence.

The detailed runbook is authoritative if this summary omits a step.

## Safety boundary

Never commit secrets, tokens, raw identity data, customer or labourer PII, payment data, production exports, private credential paths, runtime databases, logs, or local configuration. Never use production data or the real `togt` database for automated tests.

Changes affecting real users, KYC behavior, auth primitives, money, vendors, production schema, secrets, or deployment require the approval level defined in `AGENTS.md`.

## Pull requests

Every PR must state:

- scope and explicit non-goals;
- branch base and catch-up state;
- changed behavior and affected consumers;
- exact validation commands and outcomes;
- migration and data impact;
- security, privacy, KYC, auth, payment, and webhook impact where applicable;
- deployment and rollback requirements;
- limitations, dependencies, risks, and approvals still needed.

Keep incomplete work in Draft. A PR without evidence is not ready merely because GitHub reports it as mergeable.
