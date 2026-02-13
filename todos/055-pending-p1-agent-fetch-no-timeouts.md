---
status: pending
priority: p1
issue_id: "055"
tags: [code-review, resilience, reliability]
dependencies: []
---

# No timeouts on agent fetch() calls — will hang indefinitely

## Problem Statement
The LiveKit agent's `persistTranscripts` function uses bare `fetch()` calls to POST transcripts to the Next.js API with no timeout, abort controller, or retry logic. If the Pi server is slow, unreachable, or ngrok is down, the agent will hang indefinitely waiting for a response. This has happened before (see deployment history) and blocks the agent process from accepting new sessions.

## Findings
- **Flagged by**: Resilience Reviewer (top finding)
- File: `livekit-agent/src/main.ts` — `persistTranscripts` callback (~lines 310-340)
- `fetch()` has no `signal: AbortSignal.timeout(...)` or wrapper
- The `publishData()` calls correctly use `.catch()` for fire-and-forget, but the shutdown POST does not
- Pi deployment gotcha #14 documents similar hangs from stale agent containers
- If the Next.js server is behind ngrok and ngrok drops, TCP timeout could be 2+ minutes

## Proposed Solutions
### Option A: Add AbortSignal.timeout to fetch calls (Recommended)
- Wrap the fetch with `signal: AbortSignal.timeout(10000)` (10 seconds)
- Log warning on timeout, don't crash
- Pros: Simple, one-line change per fetch, matches existing fire-and-forget pattern
- Cons: None significant
- Effort: Small
- Risk: Low

### Option B: Create a fetchWithTimeout utility
- Utility function in agent code that wraps fetch with configurable timeout + retry
- Pros: Reusable, can add retry logic
- Cons: Over-engineering for a prototype with 2 fetch calls
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] All `fetch()` calls in `main.ts` have a timeout (10s recommended)
- [ ] Timeout failures are logged as warnings, not thrown
- [ ] Agent does not hang when Pi/ngrok is unreachable

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `livekit-agent/src/main.ts`
- Pi Deployment Gotcha #14: Stale agent container hangs
- MDN: `AbortSignal.timeout()` — supported in Node.js 18+
