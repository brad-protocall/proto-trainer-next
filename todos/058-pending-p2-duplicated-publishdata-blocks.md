---
status: pending
priority: p2
issue_id: "058"
tags: [code-review, quality, dry]
dependencies: []
---

# Duplicated publishData blocks in agent

## Problem Statement
The `publishData()` logic in `main.ts` is duplicated nearly identically in two event handlers (user speech final and assistant speech committed). The only difference is the `role` field. This violates DRY and means any future changes (e.g., adding metadata, changing the topic) must be made in two places.

## Findings
- **Flagged by**: TypeScript Reviewer, Code Simplicity Reviewer, Pattern Recognition (3 agents)
- File: `livekit-agent/src/main.ts` — user handler (~lines 265-275) and assistant handler (~lines 285-295)
- Both blocks construct a `TranscriptDataMessage`, encode it, and call `publishData` with identical options
- Only `role` and `content` source differ

## Proposed Solutions
### Option A: Extract a publishTranscriptTurn helper function (Recommended)
- Create `function publishTranscriptTurn(room, role, content, turnOrder)` that encapsulates the encode+publish+catch pattern
- Pros: Single change point, clearer intent, less noise in event handlers
- Cons: One more function (trivial)
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `publishData` logic exists in one place only
- [ ] Both user and assistant handlers call the shared helper
- [ ] Agent builds and runs correctly

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `livekit-agent/src/main.ts`
