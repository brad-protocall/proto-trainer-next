---
status: pending
priority: p2
issue_id: "067"
tags: [code-review, data-integrity, security]
dependencies: []
---

# Delete scope mismatch with per-turn attemptNumber override

## Problem Statement
The transcript endpoint deletes all turns for `defaultAttemptNumber` before inserting, but individual turns in the payload can specify their own `attemptNumber` via the optional field. If a client sends a mix of attempt 1 and attempt 2 turns, the delete only removes attempt 1 turns, while attempt 2 turns are inserted alongside any pre-existing attempt 2 data — creating duplicates.

## Findings
- **Flagged by**: Data Integrity Guardian (MEDIUM)
- File: `src/app/api/sessions/[id]/transcript/route.ts` — delete scoped to `defaultAttemptNumber` (line 101), but insert uses per-turn `attemptNumber` (line 96)
- A malformed request with `turns: [{ attemptNumber: 1, ... }, { attemptNumber: 2, ... }]` would delete attempt 1 turns but not attempt 2, creating duplicates for attempt 2
- Neither the agent nor the client currently send mixed attemptNumbers, but the schema allows it

## Proposed Solutions
### Option A: Remove per-turn attemptNumber override from Zod schema (Recommended)
- Remove `attemptNumber` from `saveTranscriptTurnSchema`. Always use session's `currentAttempt`.
- Pros: Simplest, eliminates the mismatch entirely, matches actual usage
- Cons: Less flexible (but flexibility isn't needed)
- Effort: Small
- Risk: Low

### Option B: Scope delete to all distinct attemptNumbers in payload
- Collect unique attemptNumbers from turns, delete each before inserting
- Pros: Correctly handles mixed payloads
- Cons: More complex, enables a usage pattern that doesn't exist
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Per-turn attemptNumber override is removed OR delete scope matches insert scope
- [ ] Mixed attemptNumber payloads cannot create duplicate turns
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/app/api/sessions/[id]/transcript/route.ts`
