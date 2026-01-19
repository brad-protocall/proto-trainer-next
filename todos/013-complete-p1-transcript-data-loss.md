---
status: pending
priority: p1
issue_id: PR-22-003
tags: [code-review, data-integrity, reliability]
dependencies: []
---

# Transcript Data Loss on Disconnect

## Problem Statement

When the WebSocket session disconnects (client crash, network failure, OpenAI disconnect), all accumulated transcript data is lost. The `disconnect()` method only logs the count but does not persist the data.

**Why it matters:** Complete voice training sessions could be lost with no way to evaluate them. This is core functionality failure.

## Findings

**File:** `ws-server/realtime-session.ts` (lines 327-339)

```typescript
disconnect(): void {
  console.log("[Session] Disconnecting...");
  console.log(`[Session] Total transcript turns captured: ${this.transcripts.length}`);
  // Transcripts are LOST HERE - no persistence
  if (this.openaiWs) {
    this.openaiWs.close();
    this.openaiWs = null;
  }
}
```

**Data loss scenarios:**
1. Counselor completes 30-minute session, browser crashes
2. Network interruption during training
3. OpenAI API timeout/disconnect
4. Server restart during active session

**Additional risk:** In-flight transcripts (stored in `currentAssistantTranscript`) are lost if disconnect happens mid-response.

## Proposed Solutions

### Option 1: Persist to database on disconnect (Recommended)
**Pros:** Saves all captured data, enables evaluation
**Cons:** Requires API call, adds latency
**Effort:** Medium
**Risk:** Low

```typescript
async disconnect(): Promise<void> {
  // Save transcripts before closing
  if (this.transcripts.length > 0 && this.params.assignmentId) {
    await this.persistTranscripts();
  }

  // Flush in-flight data
  if (this.currentAssistantTranscript) {
    this.transcripts.push({
      role: "assistant",
      content: this.currentAssistantTranscript,
      timestamp: new Date(),
    });
  }

  // Then close connections
  // ...
}
```

### Option 2: Periodic persistence (every N turns)
**Pros:** Limits data loss window
**Cons:** More API calls, complexity
**Effort:** Medium
**Risk:** Low

### Option 3: Client-side backup with reconciliation
**Pros:** Redundancy
**Cons:** Complexity, sync issues
**Effort:** Large
**Risk:** Medium

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `ws-server/realtime-session.ts`

**State at risk:**
- `transcripts: TranscriptTurn[]`
- `currentAssistantTranscript: string`
- `currentUserTranscript: string`

## Acceptance Criteria

- [ ] Transcripts persisted to database before disconnect
- [ ] In-flight transcripts flushed on disconnect
- [ ] Graceful handling of persistence failures
- [ ] Recovery mechanism documented

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #22 review | Data integrity guardian flagged as critical |

## Resources

- [PR #22](https://github.com/brad-pendergraft/proto-trainer-next/pull/22)
