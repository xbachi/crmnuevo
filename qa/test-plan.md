# QA Test Plan - Refactoring Branch

**Branch**: `refactor/qa-hardening-2025-11-02`  
**Date**: 2025-11-02

---

## Pre-Testing Checklist

- [ ] Branch checked out
- [ ] Dependencies installed (`npm install`)
- [ ] Database connection configured
- [ ] Environment variables set

---

## 1. Type Checking

### Command

```bash
npm run typecheck
```

### Expected Result

- Zero TypeScript errors (excluding `.next/types/validator.ts` which is auto-generated)
- May show warnings in test files (acceptable)

### Success Criteria

- ✅ No errors in `src/` directory
- ✅ No errors in `src/app/` API routes
- ✅ No errors in `src/components/` components

---

## 2. Linting

### Command

```bash
npm run lint
```

### Expected Result

- Zero linting errors
- Warnings are acceptable but should be noted

### Success Criteria

- ✅ ESLint passes without errors
- ✅ All files follow project style guide

---

## 3. Unit Tests

### Command

```bash
npm run test:unit
```

### Expected Result

- All unit tests pass
- No regressions in existing functionality

### Success Criteria

- ✅ All tests in `__tests__/` pass
- ✅ Coverage remains at or above baseline

---

## 4. Integration Tests

### Command

```bash
npm run test:integration
```

### Expected Result

- Integration tests pass
- API endpoints respond correctly

### Success Criteria

- ✅ Database operations work correctly
- ✅ API routes return expected responses

---

## 5. Build Verification

### Command

```bash
npm run build
```

### Expected Result

- Build completes successfully
- No build-time errors or warnings

### Success Criteria

- ✅ Production build succeeds
- ✅ No bundle size regressions (check if possible)

---

## 6. Smoke Test - Manual

### Test Scenarios

#### A. Investor Dashboard

1. Navigate to `/inversores/[id]`
2. Verify cards display correctly
3. Expand accordion in one card
4. **Verify**: Other cards maintain their height (don't stretch)
5. Check "Rendimiento" block shows correct values
6. Verify "CN y Garantía" input is editable

### Test Scenarios

#### B. Vehicle List

1. Navigate to `/vehiculos`
2. Filter vehicles
3. Edit a vehicle
4. Save changes
5. **Verify**: Changes persist correctly

#### C. API Routes

1. Test vehicle update: `PUT /api/vehiculos/[id]`
2. **Verify**: Error handling works (try invalid data)
3. Check error messages are meaningful

---

## 7. Accessibility Quick Check

### Manual Review

- [ ] All images have `alt` attributes
- [ ] Form inputs have associated labels
- [ ] Buttons have accessible names
- [ ] Keyboard navigation works (Tab key)

### Tools

- Browser DevTools Accessibility panel
- Screen reader (if available)

---

## 8. Performance Check

### Commands

```bash
npm run build
# Check build output for bundle sizes
```

### Metrics to Note

- Initial bundle size
- Number of chunks
- Build time

---

## 9. Regression Testing

### Critical Paths

1. **Investor Flow**
   - View investor dashboard
   - Edit investor vehicle
   - Add files to vehicle
   - Calculate metrics

2. **Vehicle Flow**
   - List vehicles
   - Filter vehicles
   - Edit vehicle
   - Create deal

3. **Deal Flow**
   - Create deal
   - Generate documents
   - Mark as sold

---

## 10. Error Scenarios

### Test Cases

1. **Invalid Input**
   - Submit form with missing required fields
   - Enter invalid data types
   - **Expected**: Clear error messages, no crashes

2. **Network Errors**
   - Simulate offline mode
   - Slow network connection
   - **Expected**: Graceful degradation

3. **Database Errors**
   - Try to delete non-existent record
   - **Expected**: Appropriate error handling

---

## Success Criteria

### Must Pass

- ✅ Typecheck: 0 errors
- ✅ Lint: 0 errors
- ✅ Unit tests: All pass
- ✅ Build: Successful
- ✅ Manual smoke test: All scenarios pass

### Should Pass

- ⚠️ Integration tests: All pass
- ⚠️ Performance: No regression
- ⚠️ Accessibility: Basic compliance

---

## Rollback Plan

If issues are found:

1. **Immediate**: Revert to `main` branch

   ```bash
   git checkout main
   ```

2. **Selective**: Revert specific commits

   ```bash
   git revert <commit-hash>
   ```

3. **Cherry-pick**: Keep only safe changes
   ```bash
   git cherry-pick <commit-hash>
   ```

---

## Notes

- Test in development mode first
- Then test production build
- Verify in staging before merging to main
- All changes are backward compatible

---

## Test Execution Log

**Tester**: ********\_********  
**Date**: ********\_********  
**Environment**: ********\_********

| Test              | Status | Notes |
| ----------------- | ------ | ----- |
| Typecheck         | ⬜     |       |
| Lint              | ⬜     |       |
| Unit Tests        | ⬜     |       |
| Integration Tests | ⬜     |       |
| Build             | ⬜     |       |
| Manual Smoke Test | ⬜     |       |
| Accessibility     | ⬜     |       |
| Performance       | ⬜     |       |

---

**Overall Result**: ⬜ Pass | ⬜ Fail | ⬜ Conditional Pass

**Notes**:

---

---

---
