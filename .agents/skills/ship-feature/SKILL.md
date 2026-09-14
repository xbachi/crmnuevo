---
name: ship-feature
description: End-to-end new feature workflow for this CRM. Coordinates research → plan → implement → QA → commit. Use when adding any non-trivial feature, integration, or multi-file change.
---

# /ship-feature

Coordinator: **`@tech-lead`**.

## Flow

1. **Clarify** the feature in one sentence. If scope is ambiguous, ask ONE question; otherwise pick a default and continue.
2. **Research** (only if the feature touches an external lib/API/plugin):
   - Delegate to `@docs-researcher` → ResearchPack
3. **Plan**:
   - Delegate to `@implementation-planner` → step-by-step plan with rollback
   - Plan must list every file to touch and the QA checks to run
4. **Implement**:
   - Delegate to `@code-implementer` with ResearchPack (if any) + Plan
   - Self-correction allowed (up to 3 retries)
5. **Domain review** (parallel, on the diff):
   - Backend/API changes → `backend-development:backend-architect` or `code-review-ai:architect-review`
   - Frontend changes → `frontend-mobile-development:frontend-developer` (review)
   - DB/Prisma/SQL changes → `database-cloud-optimization:database-optimizer`
   - Auth/security-sensitive → `full-stack-orchestration:security-auditor`
6. **QA gates** (run what applies):
   ```bash
   npm run typecheck
   npm run lint
   npm run test:unit
   npm run test:integration   # if DB touched
   npm run test:e2e           # or :smoke, if UI flow touched
   ```
7. **Diff review** — read `git diff` end-to-end yourself before declaring done.
8. **Report** (concise):
   - Files changed
   - Checks run + result
   - Risks / follow-ups
   - Suggested commit message (semantic format, no co-author line)

## Hard limits
- No drive-by refactors.
- No new `*.md` files unless requested.
- Never raise pg pool cap above 1.
- Never skip hooks.
- If a QA gate fails: fix and re-run, don't bypass.
