---
status: pending
priority: p2
issue_id: "035"
tags: [code-review, data-integrity, websocket]
dependencies: []
---

# Session Reuse Without Clearing Old Transcripts

## Problem Statement

When a 409 conflict occurs (session already exists for assignment), the code fetches and reuses the existing session ID. However, if that session already has transcript turns from a previous attempt, new turns are appended, mixing old and new conversation data.

**Why it matters**: Mixed transcripts corrupt evaluation data and training records.

## Findings

**Location**: `ws-server/realtime-session.ts` (lines 142-176)

```typescript
private async fetchExistingSession(): Promise<void> {
  // Fetches existing session and reuses its ID
  // No clearing of existing transcripts before reuse
  if (data.ok && data.data?.sessionId) {
    this.dbSessionId = data.data.sessionId;
    // Old transcripts still exist!
  }
}
```

**Corruption Scenario**:
1. Counselor starts voice training, creates session with transcripts
2. Counselor disconnects mid-session (session exists with partial transcripts)
3. Counselor reconnects, `fetchExistingSession` reuses same session
4. New transcripts appended to old, creating mixed transcript

## Proposed Solutions

### Option A: Create New Session on Reconnect (Recommended)
**Pros**: Simple, clean separation of attempts
**Cons**: Multiple sessions per assignment
**Effort**: Small (30 min)
**Risk**: Low

Always create a new session, let evaluation use the latest completed session.

### Option B: Clear Transcripts on Reuse
**Pros**: Maintains single session per assignment
**Cons**: Loses partial progress data
**Effort**: Small (30 min)
**Risk**: Low

Delete existing transcripts when reusing session.

### Option C: Track Attempts Within Session
**Pros**: Preserves all data with context
**Cons**: More complex schema changes
**Effort**: Large (2+ hours)
**Risk**: Medium

Add `attempt_number` field to transcripts.

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `ws-server/realtime-session.ts`
- Possibly `src/app/api/sessions/route.ts`

## Acceptance Criteria

- [ ] Reconnecting to a session does not mix old and new transcripts
- [ ] Evaluations are based on clean, single-attempt data
- [ ] Existing behavior documented if intentional

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Data integrity guardian flagged |

## Resources

- PR: uncommitted changes
