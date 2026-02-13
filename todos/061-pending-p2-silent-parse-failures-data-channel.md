---
status: pending
priority: p2
issue_id: "061"
tags: [code-review, resilience, observability]
dependencies: []
---

# Silent parseTranscriptMessage failures — no logging

## Problem Statement
`parseTranscriptMessage()` in `voice-training-view.tsx` returns `null` on any validation failure (bad JSON, missing fields, wrong types) without logging. If the agent sends a malformed message or the data channel delivers corrupted data, turns are silently dropped with no visibility into the failure. This makes debugging data channel issues extremely difficult.

## Findings
- **Flagged by**: Resilience Reviewer, Security Sentinel (MEDIUM)
- File: `src/components/voice-training-view.tsx` — `parseTranscriptMessage()` (lines 37-54)
- Two catch paths: JSON parse failure and validation failure — both return `null` silently
- Client-side content length is not validated (see related #056)
- The `handleTranscriptTurn` callback silently drops null results (lines 422-424)

## Proposed Solutions
### Option A: Add console.warn on parse failures (Recommended)
- Log a warning with the failure reason and a truncated preview of the raw payload
- Pros: Immediate debugging visibility, zero performance impact
- Cons: Console noise if agent sends unexpected messages (unlikely)
- Effort: Small
- Risk: Low

### Option B: Add a dropped message counter
- Track `droppedMessagesRef.current++` and log the total when fast path triggers
- Pros: Quantifiable data quality metric
- Cons: Slightly more code
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Parse failures produce a `console.warn` with failure reason
- [ ] Raw payload is truncated in logs (no PII leakage risk for voice transcripts)
- [ ] At least one log message appears when data channel delivers corrupt data

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
