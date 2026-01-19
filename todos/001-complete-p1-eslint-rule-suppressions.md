---
status: pending
priority: p1
issue_id: PR-20-001
tags: [code-review, quality, react-hooks]
dependencies: []
---

# ESLint Rule Suppressions in Dashboard Components

## Problem Statement

The migrated React components contain `eslint-disable-next-line react-hooks/exhaustive-deps` comments that bypass React's hook dependency checking. This can lead to stale closures and subtle bugs where components don't re-render when dependencies change.

**Why it matters:** ESLint exhaustive-deps rule prevents common React bugs. Suppressing it without proper justification indicates potential issues with hook design.

## Findings

**Locations:**
- `src/components/counselor-dashboard.tsx:72` - useEffect missing dependencies
- `src/components/supervisor-dashboard.tsx:134` - useEffect missing dependencies
- `src/components/supervisor-dashboard.tsx:141` - useEffect missing dependencies

**Evidence:**
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
```

These suppressions are applied to useEffect hooks that likely have missing dependencies.

## Proposed Solutions

### Option 1: Add missing dependencies with useCallback (Recommended)
**Pros:** Follows React best practices, removes lint suppressions
**Cons:** May require refactoring callback functions
**Effort:** Medium
**Risk:** Low

Wrap callbacks in useCallback and add them to dependency arrays.

### Option 2: Document why suppressions are intentional
**Pros:** Quick if truly intentional
**Cons:** Doesn't fix underlying issue
**Effort:** Small
**Risk:** Medium - may hide bugs

### Option 3: Refactor to avoid the pattern
**Pros:** Cleaner architecture
**Cons:** More significant refactor
**Effort:** Large
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/components/counselor-dashboard.tsx`
- `src/components/supervisor-dashboard.tsx`

**Components:** CounselorDashboard, SupervisorDashboard

## Acceptance Criteria

- [ ] All eslint-disable comments removed
- [ ] useEffect hooks have correct dependency arrays
- [ ] Components re-render appropriately when state changes
- [ ] No console warnings about missing dependencies

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #20 review | Found 3 instances across 2 dashboard components |

## Resources

- [PR #20](https://github.com/brad-pendergraft/proto-trainer-next/pull/20)
- [React useEffect docs](https://react.dev/reference/react/useEffect)
- [ESLint react-hooks plugin](https://www.npmjs.com/package/eslint-plugin-react-hooks)
