---
status: pending
priority: p1
issue_id: PR-21-002
tags: [code-review, react-hooks, race-condition]
dependencies: [PR-21-001]
---

# Stale Closure Bug in handleMessage Callback

## Problem Statement

The `handleMessage` callback captures `sessionId` from closure. When the WebSocket receives a `session.id` event and updates state, subsequent transcript events still use the old `handleMessage` that has `sessionId` as `null`, causing transcript turns to have empty `sessionId` values.

**Why it matters:** This is a race condition that will cause data inconsistency in transcript records.

## Findings

**File:** `src/hooks/use-realtime-voice.ts`

**Lines 96-167:** handleMessage captures sessionId from closure
```typescript
const handleMessage = useCallback(
  (event: RealtimeMessageEvent) => {
    // ...
    const turn: TranscriptTurn = {
      sessionId: sessionId ?? "",  // Captures stale value
      // ...
    };
  },
  [sessionId, onTranscript]  // Re-creates when sessionId changes
);
```

**Lines 225-231:** WebSocket onmessage captures handleMessage at connect() time
```typescript
ws.onmessage = (msgEvent) => {
  const data = JSON.parse(msgEvent.data);
  handleMessage(data);  // Uses stale handleMessage
};
```

**Timeline of bug:**
1. `connect()` called - `handleMessage` has `sessionId=null`
2. WebSocket opens, assigns `handleMessage` to `ws.onmessage`
3. Server sends `session.id` event
4. `setSessionId(id)` called, React schedules re-render
5. Server sends `response.audio_transcript.done` BEFORE re-render
6. `handleMessage` still sees `sessionId=null`
7. Transcript turn created with empty sessionId

## Proposed Solutions

### Option 1: Use ref for sessionId inside callback (Recommended)
**Pros:** Simple, follows established pattern in codebase
**Cons:** Duplicates ref/state pattern
**Effort:** Small
**Risk:** Low

```typescript
const sessionIdRef = useRef<string | null>(null);

// In handleMessage:
case "session.id":
  sessionIdRef.current = event.session_id;
  setSessionId(event.session_id);
  break;

// Later in handleMessage:
const turn: TranscriptTurn = {
  sessionId: sessionIdRef.current ?? "",
  // ...
};
```

### Option 2: Move handleMessage inside connect()
**Pros:** No dependency array issues
**Cons:** Recreates function on each connect
**Effort:** Medium
**Risk:** Low

### Option 3: Use useEffect to update ws.onmessage
**Pros:** Always uses latest handleMessage
**Cons:** More complex
**Effort:** Medium
**Risk:** Medium

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/hooks/use-realtime-voice.ts`

## Acceptance Criteria

- [ ] Transcript turns always have correct sessionId
- [ ] No race condition between session.id and transcript events
- [ ] Unit test covering rapid session.id followed by transcript

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #21 review | Multiple agents identified this issue |

## Resources

- [PR #21](https://github.com/brad-pendergraft/proto-trainer-next/pull/21)
- [React useCallback stale closure](https://react.dev/reference/react/useCallback#updating-state-from-a-memoized-callback)
