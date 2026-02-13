---
status: pending
priority: p3
issue_id: "066"
tags: [code-review, frontend-races, reliability]
dependencies: []
---

# No cancellation token in requestEvaluationWithRetry

## Problem Statement
The `requestEvaluationWithRetry` function polls for up to 50 seconds with no AbortController or cancellation mechanism. If the user navigates away or the component unmounts, the retry loop continues in the background, making stale fetch calls and potentially calling setState on an unmounted component.

## Findings
- **Flagged by**: Frontend Races Reviewer (LOW)
- File: `src/components/voice-training-view.tsx` — `requestEvaluationWithRetry`
- The function uses `await new Promise(r => setTimeout(r, delay))` for polling intervals
- No cleanup runs on component unmount to cancel the loop
- React 18's strict mode double-mount could cause duplicate retry loops in development

## Proposed Solutions
### Option A: Add AbortController passed from caller
- Create an AbortController in the calling effect/handler, pass its signal. Check `signal.aborted` before each retry iteration.
- Pros: Clean cancellation, no stale updates
- Cons: Minor complexity
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Retry loop stops when component unmounts
- [ ] No console warnings about setState on unmounted component

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
