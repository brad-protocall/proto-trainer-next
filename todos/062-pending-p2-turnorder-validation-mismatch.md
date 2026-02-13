---
status: pending
priority: p2
issue_id: "062"
tags: [code-review, quality, consistency]
dependencies: []
---

# turnOrder validation mismatch between endpoints

## Problem Statement
The public transcript endpoint (`/api/sessions/[id]/transcript`) validates `turnOrder` as `z.number().int().min(0)` (allows 0), while the internal endpoint (`/api/internal/sessions/[id]/transcript`) uses `z.number().int().positive()` (requires >= 1). The agent sends 0-indexed turnOrder values. If the agent ever hits the internal endpoint with turnOrder 0, it would be rejected.

## Findings
- **Flagged by**: Pattern Recognition (MEDIUM), Architecture Strategist
- File: `src/app/api/sessions/[id]/transcript/route.ts` — `turnOrder: z.number().int().min(0)`
- File: `src/app/api/internal/sessions/[id]/transcript/route.ts` — `turnOrder: z.number().int().positive()`
- Agent in `main.ts` sends `turnOrder: transcripts.length` which starts at 0 for the first turn
- Currently the agent uses the internal endpoint and the client uses the public endpoint, so the mismatch doesn't cause failures — but it's a maintenance trap

## Proposed Solutions
### Option A: Align both to min(0) (Recommended)
- Change internal endpoint from `.positive()` to `.min(0)` to match the public endpoint
- Pros: Consistent validation, matches agent behavior
- Cons: None
- Effort: Small
- Risk: Low

### Option B: Align both to 1-indexed
- Change both to `.min(1)` and update agent to send `turnOrder: transcripts.length + 1`
- Pros: More conventional (1-indexed)
- Cons: Requires agent change + redeploy
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Both endpoints accept the same turnOrder range
- [ ] Agent's turnOrder values pass validation on both endpoints
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/app/api/sessions/[id]/transcript/route.ts`
- File: `src/app/api/internal/sessions/[id]/transcript/route.ts`
- File: `livekit-agent/src/main.ts`
