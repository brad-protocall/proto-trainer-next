---
status: pending
priority: p1
issue_id: "024"
tags: [code-review, typescript, types]
dependencies: []
---

# Missing skills Field in Scenario TypeScript Interface

## Problem Statement

The `Scenario` interface in `src/types/index.ts` is missing the `skills: string[]` field that now exists in the database schema and is used in the external API route handler.

**Why it matters**: TypeScript cannot validate code that accesses `s.skills`, leading to potential runtime errors and reduced type safety.

## Findings

**Location**: `src/types/index.ts` (Scenario interface)

The API route at `src/app/api/external/scenarios/route.ts:47` queries `skills: true` and uses `s.skills[0]` at line 65, but the TypeScript interface doesn't include this field.

**Current interface** (missing skills):
```typescript
export interface Scenario {
  id: string;
  title: string;
  // ... other fields
  skill?: string;  // exists
  // skills: string[];  // MISSING!
  difficulty?: string;
  estimatedTime?: number;
}
```

## Proposed Solutions

### Option A: Add skills field (Recommended)
**Pros**: Simple, direct fix
**Cons**: None
**Effort**: Small (2 min)
**Risk**: None

```typescript
export interface Scenario {
  // ... existing fields
  skill?: string;  // DEPRECATED
  skills: string[];  // Add this
  difficulty?: string;
  estimatedTime?: number;
}
```

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/types/index.ts`

## Acceptance Criteria

- [ ] `skills: string[]` added to Scenario interface
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] External API route has full type coverage

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Pattern recognition specialist found gap |

## Resources

- PR: commit 31b743e
- File: src/app/api/external/scenarios/route.ts:65
