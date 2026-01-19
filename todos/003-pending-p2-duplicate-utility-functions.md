---
status: pending
priority: p2
issue_id: PR-20-003
tags: [code-review, duplication, maintainability]
dependencies: []
---

# Duplicate Utility Functions

## Problem Statement

The `formatDate` and `getStatusColor` utility functions are duplicated in both counselor-dashboard.tsx and supervisor-dashboard.tsx. This violates DRY principles and risks inconsistent behavior if one copy is updated but not the other.

**Why it matters:** Duplicate code leads to maintenance burden and potential bugs when changes aren't applied consistently.

## Findings

**Duplicated functions:**

1. `getStatusColor(status: AssignmentStatus)`
   - `src/components/counselor-dashboard.tsx:219`
   - `src/components/supervisor-dashboard.tsx:391`

2. `formatDate(dateStr: string | null)`
   - `src/components/counselor-dashboard.tsx:245`
   - `src/components/supervisor-dashboard.tsx:404`

**Evidence:**
Both components define identical utility functions for formatting dates and assignment status colors.

## Proposed Solutions

### Option 1: Extract to src/lib/format.ts (Recommended)
**Pros:** Single source of truth, reusable across app
**Cons:** Extra import
**Effort:** Small
**Risk:** Low

```typescript
// src/lib/format.ts
export function formatDate(dateStr: string | null): string { ... }
export function getStatusColor(status: AssignmentStatus): string { ... }
```

### Option 2: Create shared hooks
**Pros:** Can include React-specific logic if needed
**Cons:** Overkill for pure functions
**Effort:** Small
**Risk:** Low

### Option 3: Leave as-is with documentation
**Pros:** No changes needed
**Cons:** Maintenance burden remains
**Effort:** None
**Risk:** Medium

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/components/counselor-dashboard.tsx`
- `src/components/supervisor-dashboard.tsx`

**New file:**
- `src/lib/format.ts`

## Acceptance Criteria

- [ ] `formatDate` and `getStatusColor` exist in single location
- [ ] Both dashboards import from shared module
- [ ] No duplicate function definitions remain
- [ ] Existing behavior unchanged

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #20 review | Found 2 duplicated utility functions |

## Resources

- [PR #20](https://github.com/brad-pendergraft/proto-trainer-next/pull/20)
