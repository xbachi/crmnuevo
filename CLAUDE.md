# CRM — Project Instructions

Senior-dev workflow. Surgical, reversible changes. Quality before commit.

## Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Prisma 6** + **PostgreSQL** (raw `pg` pool also used in API routes)
- **Vercel** (deploy) + **Vercel Blob** (file storage)
- **Jest** (unit + integration) + **Playwright** (E2E)
- **Husky** pre-commit / pre-push (lint-staged + Prettier)

## Critical project rules
- **pg.Pool MUST be capped at 1 connection per Vercel function instance** (see recent commit `ceaef29`). Do not raise without explicit approval.
- **Never skip git hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, fix the cause.
- **Never read or commit:** `.env*`, `secrets/**`, `public/documents/**` (real customer PDFs/contracts).
- **SQL migrations** live at repo root as `add-*.sql` / `create-*.sql` / `fix-*.sql`. Add new ones following the same naming; don't reorder existing files.
- **Invoicing logic** (`next_number`, facturado flow) is fragile — see commits `02772ec`, `3326e03`. Touch only with a plan and regression tests.
- **API routes** under `src/app/api/**` — keep them stateless; do not cache pg clients across requests.

## Default workflow

**Coordinator:** `@tech-lead` (project-specific, in `.claude/agents/tech-lead.md`).
It auto-delegates to global agents and plugin agents based on the task.

**Skills (slash commands):**
- `/ship-feature` — new feature: research → plan → implement → QA → commit
- `/fix-bug` — bug: reproduce → RCA → minimal fix → regression test → QA → commit
- `/audit-project` — read-only audit (code, security, deps, perf, tests)

**Direct work only for:** typos, 1-line fixes, CSS tweaks, comments. Everything else → tech-lead.

## QA gates (before reporting done)
Run what applies; don't skip:
```bash
npm run typecheck
npm run lint
npm run test:unit
# touch DB?      → npm run test:integration
# touch UI flow? → npm run test:e2e (or smoke)
```
Then review `git diff` before commit.

## Commits
Semantic, single-purpose, no co-author lines from this project (project preference):
```
type(scope): brief description

- bullet 1
- bullet 2
```
Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`. No `--amend` unless explicitly asked.

## Scope discipline
- Touch only files needed for the task.
- No drive-by refactors. No new abstractions for hypothetical futures.
- No new docs files (`*.md`) unless explicitly requested.
- No verbose comments. Comment only non-obvious *why*.

## When in doubt
Ask one short question. Otherwise pick a sensible default and proceed.
