---
status: pending
priority: p2
issue_id: "048"
tags: [code-review, consistency, security]
dependencies: []
---

# Modal uses raw fetch instead of authFetch

## Problem Statement
The `generate-scenario-modal.tsx` component constructs auth headers manually in two separate fetch calls (lines 90-93 and 140-143), duplicating the `x-user-id` header construction. CLAUDE.md explicitly documents this as a known pitfall: "Components using raw fetch() instead of authFetch." The parent dashboard already creates `authFetch` via the `useAuth()` hook, but it is not passed down to or used by the modal.

## Findings
- Lines 90-93: Manual header construction for `POST /api/scenarios/generate`
- Lines 140-143: Manual header construction for `POST /api/scenarios`
- Both use the same pattern: `{ 'Content-Type': 'application/json', 'x-user-id': userId }`
- `BulkImportModal` has the same pre-existing pattern (not introduced by this branch)
- The `useAuth()` hook or `createAuthFetch()` utility handles this centrally
- If auth header format changes, these manual constructions would need to be found and updated individually

## Proposed Solutions
### Option A: Accept authFetch as prop
- Parent component passes `authFetch` from `useAuth()` as a prop to the modal
- Pros: Consistent with codebase pattern, single auth construction point
- Cons: Adds a prop to the component interface
- Effort: Small
- Risk: Low

### Option B: Use createAuthFetch internally
- Import `createAuthFetch` from `src/lib/fetch.ts` and create locally with `userId`
- Pros: No prop drilling, self-contained
- Cons: Creates a second auth fetch instance (minor)
- Effort: Small
- Risk: Low

### Option C: Fix systemically across all modals
- Fix both `GenerateScenarioModal` and `BulkImportModal` at once
- Pros: Eliminates all instances of the pattern
- Cons: Larger change scope
- Effort: Medium
- Risk: Low

## Acceptance Criteria
- [ ] Auth headers constructed in one place within the modal
- [ ] Both fetch calls use the same auth mechanism (authFetch or equivalent)
- [ ] No manual `x-user-id` header construction in the modal
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/components/generate-scenario-modal.tsx`, lines 90-93 and 140-143
- Related: `src/lib/fetch.ts` (createAuthFetch), `src/hooks/useAuth.ts`
- CLAUDE.md: "Missing Auth Headers" in Known Pitfalls section
