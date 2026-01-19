---
status: pending
priority: p1
issue_id: PR-21-001
tags: [code-review, build-blocker, typescript]
dependencies: []
---

# PR #21 Needs Rebase - Missing Types Module

## Problem Statement

PR #21 imports from `@/types` which exists on main but not on the feature branch. The branch was created before the types module was added, causing a TypeScript compilation failure.

**Why it matters:** This is a build blocker. The PR cannot be merged in its current state.

## Findings

**File:** `src/hooks/use-realtime-voice.ts` (lines 17-21)

```typescript
import type {
  ConnectionStatus,
  EvaluationResult,
  TranscriptTurn,
} from "@/types";
```

These types exist on main branch in `src/types/index.ts` but the branch `auto/issue-10` was created before they were added.

## Proposed Solutions

### Option 1: Rebase branch onto main (Recommended)
**Pros:** Gets all latest changes, proper git history
**Cons:** May require conflict resolution
**Effort:** Small
**Risk:** Low

```bash
git checkout auto/issue-10
git rebase main
git push --force-with-lease
```

### Option 2: Merge main into branch
**Pros:** Preserves branch history
**Cons:** Creates merge commit, less clean history
**Effort:** Small
**Risk:** Low

### Option 3: Cherry-pick types commit
**Pros:** Minimal changes
**Cons:** May miss other needed changes
**Effort:** Small
**Risk:** Medium

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/hooks/use-realtime-voice.ts`

**Required Types:**
- `ConnectionStatus`
- `EvaluationResult`
- `TranscriptTurn`

## Acceptance Criteria

- [ ] Branch contains `src/types/index.ts`
- [ ] TypeScript compilation succeeds
- [ ] `npm run build` passes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #21 review | Branch created before types module added to main |

## Resources

- [PR #21](https://github.com/brad-pendergraft/proto-trainer-next/pull/21)
