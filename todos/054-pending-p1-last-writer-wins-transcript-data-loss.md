---
status: pending
priority: p1
issue_id: "054"
tags: [code-review, data-integrity, resilience, security]
dependencies: []
---

# Last-writer-wins race can cause transcript data loss

## Problem Statement
Both the LiveKit agent (on shutdown) and the browser client (on disconnect) persist transcripts to the same endpoint using an idempotent delete+insert pattern. If the agent persists 20 turns and the client subsequently persists only 15 (due to data channel message drops), the agent's more complete transcript is silently overwritten and lost. There is no mechanism to detect or prefer the more complete version.

## Findings
- **Flagged by**: Security Sentinel, Resilience Reviewer, Data Integrity Guardian, Frontend Races Reviewer, Architecture Strategist, Plain English Auditor (6 agents)
- File: `src/app/api/sessions/[id]/transcript/route.ts` — `deleteMany` + `createMany` in transaction (lines 99-105) always replaces ALL turns for the attempt
- File: `livekit-agent/src/main.ts` — Agent persists on room shutdown via `persistTranscripts` callback
- File: `src/components/voice-training-view.tsx` — Client persists via fast path in `triggerEvaluation()` (lines ~470-490)
- The agent's shutdown POST and the client's disconnect POST can overlap by seconds
- No turn count comparison, timestamp, or version check exists to detect which write is more complete

## Proposed Solutions
### Option A: Compare turn counts before overwriting (Recommended)
- Before the `deleteMany`, query current turn count. Only delete+insert if the incoming payload has >= the existing count.
- Pros: Simple guard, prevents data loss from shorter writes
- Cons: Doesn't handle interleaving within same count; adds one extra query
- Effort: Small
- Risk: Low

### Option B: Append-only with deduplication
- Switch back to append pattern. Use a unique constraint on (sessionId, attemptNumber, turnOrder, role) and `skipDuplicates: true` on createMany.
- Pros: Never loses data, both writers can safely persist
- Cons: Requires unique constraint migration, more complex merge logic
- Effort: Medium
- Risk: Medium (migration needed)

### Option C: Single writer — disable agent persistence when data channel is active
- Agent only persists if no participants received data channel messages. Client is always the authoritative writer when data channel worked.
- Pros: Eliminates race entirely
- Cons: Requires signaling between agent and client about data channel health; more complex
- Effort: Large
- Risk: Medium

## Acceptance Criteria
- [ ] A shorter transcript cannot overwrite a longer one for the same session/attempt
- [ ] Both agent and client can persist without data loss
- [ ] E2E test: disconnect mid-session, verify complete transcript survives

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- Files: `livekit-agent/src/main.ts`, `src/components/voice-training-view.tsx`, `src/app/api/sessions/[id]/transcript/route.ts`
- CLAUDE.md: "Real-Time Transcript via Data Channel" architecture decision
