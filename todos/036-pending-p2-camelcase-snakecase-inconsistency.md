---
status: pending
priority: p2
issue_id: "036"
tags: [code-review, architecture, types]
dependencies: []
---

# Inconsistent camelCase/snake_case Field Naming

## Problem Statement

The codebase uses `getAssignmentField(assignment, "camelCase", "snake_case")` helper ~10 times to handle inconsistent field naming. This uses `any` type assertions, defeating TypeScript's type safety.

**Why it matters**: CLAUDE.md explicitly warns about this. Type errors are silently suppressed, increasing bug risk.

## Findings

**Location**: `src/components/counselor-dashboard.tsx` (lines 14-18, 466-475)

```typescript
// Helper uses any - loses type safety
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAssignmentField(assignment: any, camelCase: string, snakeCase: string) {
  return assignment?.[camelCase] || assignment?.[snakeCase];
}

// Used 10+ times
const sessionId = getAssignmentField(assignment, "sessionId", "session_id");
const evaluationId = getAssignmentField(assignment, "evaluationId", "evaluation_id");
```

**Root Cause**: The `Assignment` type in `src/types/index.ts` uses snake_case (lines 126-146), but the API response uses camelCase (AssignmentResponse lines 210-232).

## Proposed Solutions

### Option A: Update Assignment Type to camelCase (Recommended)
**Pros**: Matches API response, removes need for helper
**Cons**: Requires updating all usages
**Effort**: Medium (1 hour)
**Risk**: Low

Update `Assignment` interface to use camelCase, matching `AssignmentResponse`.

### Option B: Normalize at API Boundary
**Pros**: Single transformation point
**Cons**: Still have two shapes internally
**Effort**: Medium (1 hour)
**Risk**: Low

Transform API response to snake_case when fetching.

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/types/index.ts`
- `src/components/counselor-dashboard.tsx`
- Various other components using Assignment type

## Acceptance Criteria

- [ ] Single consistent field naming convention
- [ ] No `any` type assertions for field access
- [ ] `getAssignmentField` helper removed
- [ ] TypeScript errors caught at compile time

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Architecture and pattern agents flagged |

## Resources

- CLAUDE.md naming conventions section
