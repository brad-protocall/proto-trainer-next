---
status: pending
priority: p2
issue_id: PR-21-005
tags: [code-review, race-condition, websocket]
dependencies: [PR-21-001]
---

# Race Condition - No Guard Against Concurrent connect() Calls

## Problem Statement

The `connect()` function is async but does not prevent concurrent calls. Rapid clicks or programmatic calls could create multiple WebSocket connections and AudioPlayer instances, causing resource leaks and undefined behavior.

**Why it matters:** Users rapidly clicking "connect" can cause multiple connections, memory leaks, and conflicting state.

## Findings

**File:** `src/hooks/use-realtime-voice.ts` (lines 173-242)

```typescript
const connect = useCallback(async () => {
  // No guard against concurrent calls!
  setError(null);
  setSessionId(null);
  // ...
  const ws = new WebSocket(url);  // Creates new connection each time
  wsRef.current = ws;  // Overwrites previous without closing
```

**Scenario:**
1. User clicks connect button
2. Connection is slow (network latency)
3. User clicks again
4. Two WebSocket connections created
5. `wsRef.current` only holds second one
6. First connection leaks

## Proposed Solutions

### Option 1: Add connecting state guard (Recommended)
**Pros:** Simple, uses existing state
**Cons:** None
**Effort:** Trivial
**Risk:** None

```typescript
const connect = useCallback(async () => {
  if (connectionStatus === "connecting" || wsRef.current) {
    return;  // Already connecting or connected
  }
  // ...
```

### Option 2: Use ref-based lock
**Pros:** Synchronous check
**Cons:** Adds another ref
**Effort:** Small
**Risk:** None

```typescript
const isConnectingRef = useRef(false);

const connect = useCallback(async () => {
  if (isConnectingRef.current) return;
  isConnectingRef.current = true;
  try {
    // ...
  } finally {
    isConnectingRef.current = false;
  }
```

### Option 3: Disable connect button in UI
**Pros:** Prevents user error
**Cons:** Doesn't fix programmatic issue
**Effort:** Requires UI change
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/hooks/use-realtime-voice.ts`

## Acceptance Criteria

- [ ] Multiple rapid connect() calls result in single connection
- [ ] No WebSocket or AudioPlayer leaks
- [ ] connectionStatus accurately reflects state

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #21 review | Multiple agents identified race condition |

## Resources

- [PR #21](https://github.com/brad-pendergraft/proto-trainer-next/pull/21)
