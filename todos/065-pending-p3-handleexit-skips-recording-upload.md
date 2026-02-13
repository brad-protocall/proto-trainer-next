---
status: pending
priority: p3
issue_id: "065"
tags: [code-review, frontend-races, reliability]
dependencies: []
---

# handleExit skips stopAndUploadRecording

## Problem Statement
When the user clicks the exit button (handleExit), the function disconnects from the room but does not call `stopAndUploadRecording()`. If the user exits mid-recording, the recording is lost. The normal disconnect flow handles this, but an explicit exit bypasses it.

## Findings
- **Flagged by**: Frontend Races Reviewer (MEDIUM)
- File: `src/components/voice-training-view.tsx` — `handleExit` function
- The `handleRoomDisconnected` callback does handle recording, but it may not fire if disconnect is initiated by the client rather than the server

## Proposed Solutions
### Option A: Call stopAndUploadRecording in handleExit before disconnect
- Pros: Recording is always saved regardless of exit method
- Cons: Adds a small delay to exit
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Clicking exit during an active recording saves the recording
- [ ] No duplicate upload if both handleExit and handleRoomDisconnected fire

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
