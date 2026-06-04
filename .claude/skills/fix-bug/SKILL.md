---
name: fix-bug
description: Bug-fix workflow for this CRM. Coordinates reproduce → RCA → minimal fix → regression test → QA → commit. Use for any non-trivial bug, prod incident, or unexpected behavior.
---

# /fix-bug

Coordinator: **`@tech-lead`**.

## Flow

1. **Capture symptoms**: error message, repro steps, environment (dev / prod / Vercel / local).
2. **Reproduce** locally if possible. If not reproducible, note it explicitly.
3. **Root-cause analysis** — delegate to `@brahma-investigator`:
   - Trace code paths, related commits (`git log`, `git blame`), recent changes
   - Output: RCA report with the actual cause (not just the symptom) and fix design
4. **Plan the fix** — minimal surface area:
   - If single-file and obvious → fix directly
   - If multi-file or risky → `@implementation-planner`
5. **Implement**:
   - Direct edit (simple) or `@code-implementer` (complex)
6. **Regression test** — mandatory unless trivial:
   - Add a unit/integration/e2e test that fails on the old code and passes on the new
   - Delegate to `unit-testing:test-automator` or `performance-testing-review:test-automator` if non-trivial
7. **QA gates**:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:unit
   npm run test:integration   # if DB touched
   npm run test:e2e           # if UI flow touched
   ```
8. **Diff review** — confirm the change is *only* the fix + the new test.
9. **Report**:
   - Root cause (1–2 sentences)
   - Fix (files touched)
   - Regression test added
   - Checks run + result
   - Suggested commit message: `fix(scope): ...`

## Hard limits
- Fix the cause, not just the symptom.
- No refactors bundled with the fix.
- No silent reverts of unrelated code.
- Never skip hooks.
- If RCA can't pin the cause, say so and stop — don't ship a guess.
