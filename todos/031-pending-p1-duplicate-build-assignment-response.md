---
status: pending
priority: p1
issue_id: "031"
tags: [code-review, architecture, dry-violation]
dependencies: []
---

# Duplicate buildAssignmentResponse Function

## Problem Statement

The `buildAssignmentResponse` function (~47 lines) is copy-pasted identically in two files. This violates DRY and creates maintenance burden - any change to the response shape must be made in two places.

**Why it matters**: Already nearly caused a bug when `recordingId` was added. Future changes risk inconsistent API responses between endpoints.

## Findings

**Locations**:
- `src/app/api/assignments/route.ts` (lines 10-57)
- `src/app/api/assignments/[id]/route.ts` (lines 18-65)

Both files contain identical functions:
```typescript
function buildAssignmentResponse(assignment: {
  id: string
  accountId: string | null
  scenarioId: string
  // ... 15+ more fields
  session?: { id: string; recording?: { id: string } | null } | null
  evaluation?: { id: string } | null
}, hasTranscript = false): AssignmentResponse {
  // 30+ lines of transformation logic
}
```

## Proposed Solutions

### Option A: Extract to Shared Utility (Recommended)
**Pros**: Single source of truth, easy to maintain
**Cons**: One more file to import
**Effort**: Small (15 min)
**Risk**: None

Create `src/lib/assignment-utils.ts`:
```typescript
export function buildAssignmentResponse(
  assignment: AssignmentWithRelations,
  hasTranscript = false
): AssignmentResponse { ... }
```

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/app/api/assignments/route.ts` (remove duplicate)
- `src/app/api/assignments/[id]/route.ts` (remove duplicate)
- `src/lib/assignment-utils.ts` (create new)

## Acceptance Criteria

- [ ] Single `buildAssignmentResponse` function exists
- [ ] Both API routes import from shared utility
- [ ] All tests still pass
- [ ] ~45 lines of code removed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Multiple agents flagged this |

## Resources

- PR: uncommitted changes
