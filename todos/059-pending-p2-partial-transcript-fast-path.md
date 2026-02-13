---
status: pending
priority: p2
issue_id: "059"
tags: [code-review, resilience, data-integrity]
dependencies: []
---

# Partial transcript treated as complete on fast path

## Problem Statement
If the data channel drops messages mid-session (network hiccup, browser tab throttled), the client accumulates an incomplete transcript but still takes the fast path if `turns.length >= 2`. The evaluation then runs against a partial transcript, potentially producing misleading scores. There's no comparison between expected turn count and received turn count.

## Findings
- **Flagged by**: Resilience Reviewer
- File: `src/components/voice-training-view.tsx` — fast path threshold `turns.length >= 2`
- The `>= 2` threshold is deliberately low (Architecture Strategist confirmed this is reasonable for "did data channel work at all?")
- But there's no check for gaps: e.g., turnOrder jumps from 3 to 7 would indicate dropped messages
- Silent message drops on `useDataChannel` are not logged or counted

## Proposed Solutions
### Option A: Add gap detection in fast path (Recommended)
- Before POSTing, check if turnOrders are sequential. If gaps detected, log a warning and still proceed (transcript is better than nothing) but include a flag in the evaluation request.
- Pros: Visibility into data quality without blocking evaluation
- Cons: Agent may send turnOrders starting from different offsets
- Effort: Small
- Risk: Low

### Option B: Compare turn count against expected
- Agent could publish a "session summary" message at the end with total turn count. Client compares.
- Pros: Definitive completeness check
- Cons: Requires agent-side change, new message type
- Effort: Medium
- Risk: Low

## Acceptance Criteria
- [ ] Gap in turnOrder sequence is detected and logged
- [ ] Fast path still proceeds with partial data (graceful degradation)
- [ ] Console warning appears when messages were likely dropped

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
