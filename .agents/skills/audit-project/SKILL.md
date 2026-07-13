---
name: audit-project
description: Read-only full audit of this CRM. Parallel review of code quality, security, dependencies, performance, tests, and architecture. Use to get a health snapshot before a release, after a long hiatus, or when onboarding.
---

# /audit-project

Coordinator: **`@tech-lead`**. **Read-only — does NOT modify code.**

## Flow

1. **Scope** in one sentence (full repo / specific area / since last release). Default: full repo.
2. **Snapshot context** (fast, sequential):
   - `git log -20 --oneline` + current branch state
   - `package.json` (deps, scripts) + Node engine
   - `prisma/schema.prisma` + SQL migrations at repo root
   - High-level tree of `src/app`, `src/lib`, `src/components`
3. **Parallel specialist passes** (spawn together, each scoped to read-only):
   - `code-review-ai:architect-review` — architecture integrity, layering, boundaries
   - `code-documentation:code-reviewer` — code quality, smells, dead code, comment hygiene
   - `full-stack-orchestration:security-auditor` — OWASP, secrets, auth, input validation, file uploads (Vercel Blob, `public/documents/**`)
   - `application-performance:performance-engineer` — N+1s, pg pool usage, bundle/render hotspots
   - `database-cloud-optimization:database-optimizer` — Prisma schema, indexes, query patterns, migration order
   - `unit-testing:test-automator` — test coverage gaps, flaky/slow tests, missing regression tests
4. **Synthesize** (you, tech-lead):
   - Top 5 issues by impact × effort
   - Quick wins (≤1 hour each)
   - Medium-term risks (1–2 days)
   - Strategic concerns (architectural)
5. **Report** (one screen max):
   ```
   ## Audit summary
   - Stack: <one line>
   - Recent activity: <one line>

   ## Top findings (ranked)
   1. [severity] finding — fix sketch — effort
   2. ...

   ## Quick wins
   - ...

   ## Strategic concerns
   - ...

   ## Test/coverage gaps
   - ...
   ```

## Hard limits
- **READ ONLY.** No edits. No new files. No commits.
- Do not run mutating scripts (`db:migrate`, `db:push`, `clear-data`, etc.).
- Do not read `.env*`, `secrets/**`, `public/documents/**`.
- Keep the final report under one screen — link to file:line for details.
