---
status: pending
priority: p2
issue_id: "057"
tags: [code-review, quality, clarity]
dependencies: []
---

# Misleading 409 comment in fast path evaluation

## Problem Statement
In `voice-training-view.tsx`, the fast path has `persisted = response.ok || response.status === 409` with a comment suggesting 409 means "agent already persisted." But the actual API route returns 409 (via `conflict()`) when the session status is not `'active'` — meaning "Cannot save transcript to inactive session." This misleads future maintainers about what 409 means and masks a real error condition.

## Findings
- **Flagged by**: TypeScript Reviewer, Code Simplicity Reviewer, Pattern Recognition, Plain English Auditor (4 agents)
- File: `src/components/voice-training-view.tsx` — `triggerEvaluation()` fast path
- File: `src/app/api/sessions/[id]/transcript/route.ts` — line 78-79: `if (session.status !== 'active') return conflict(...)`
- Treating 409 as "success" means if the session was already completed, the client silently skips transcript persistence AND proceeds to evaluate — potentially evaluating with no transcript

## Proposed Solutions
### Option A: Remove 409 from success condition, fix comment (Recommended)
- Change to `persisted = response.ok` only. If 409, log a warning and fall back to slow path.
- Pros: Correct error handling, no masked failures
- Cons: None
- Effort: Small
- Risk: Low

### Option B: Keep 409 handling but fix the comment
- Update comment to accurately describe what 409 means ("session already inactive")
- Pros: Minimal change
- Cons: Still masks a real error condition
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Comment accurately describes what 409 means from the transcript endpoint
- [ ] 409 response does not silently proceed to evaluation without transcript
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
- File: `src/app/api/sessions/[id]/transcript/route.ts`
