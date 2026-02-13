---
status: pending
priority: p3
issue_id: "068"
tags: [code-review, data-integrity, frontend-races]
dependencies: []
---

# Client-side duplicate turn accumulation on data channel reconnection

## Problem Statement
The `handleTranscriptTurn` callback pushes every received message into `transcriptTurnsRef` without deduplication. LiveKit's `reliable: true` guarantees delivery but not exactly-once delivery. A reconnection scenario could replay messages, causing the same `turnOrder` to appear multiple times in the accumulated array and ultimately be persisted as duplicate rows.

## Findings
- **Flagged by**: Data Integrity Guardian (LOW)
- File: `src/components/voice-training-view.tsx` — `handleTranscriptTurn` (lines 422-424) does `transcriptTurnsRef.current.push(turn)` unconditionally
- No unique constraint on (sessionId, attemptNumber, turnOrder) exists to catch server-side duplicates (see #060)
- Unlikely in normal operation but possible during network instability

## Proposed Solutions
### Option A: Deduplicate by turnOrder before POST (Recommended)
- Before persisting, deduplicate the array using a Map keyed by turnOrder:
  ```typescript
  const unique = new Map(turns.map(t => [t.turnOrder, t]));
  const deduped = [...unique.values()].sort((a, b) => a.turnOrder - b.turnOrder);
  ```
- Pros: Simple, handles reconnection replays, no server change needed
- Cons: Last message for each turnOrder wins (correct behavior)
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Duplicate turnOrder values are deduplicated before POST
- [ ] Deduplication preserves the latest message for each turnOrder

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
- Related: #060 (missing unique constraint)
