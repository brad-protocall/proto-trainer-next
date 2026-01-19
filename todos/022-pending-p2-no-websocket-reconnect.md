---
status: pending
priority: p2
issue_id: "022"
tags: [code-review, reliability, websocket]
dependencies: []
---

# No WebSocket Reconnection Logic

## Problem Statement

When WebSocket connection drops (network blip, server restart), there's no automatic reconnection. Users must manually refresh to resume training.

**Why it matters**: Poor user experience during network instability, lost session progress.

## Findings

**Source**: Architecture Strategist, Data Integrity Guardian

**Location**: `src/hooks/use-realtime-voice.ts`

```typescript
ws.onclose = () => {
  setStatus("disconnected");
  // No reconnection attempt
};
```

## Proposed Solutions

### Option A: Exponential backoff reconnect (Recommended)
**Pros**: Standard pattern, handles transient failures
**Cons**: Need to handle session resumption
**Effort**: Medium
**Risk**: Low

### Option B: Notify user to manually reconnect
**Pros**: Simple, explicit control
**Cons**: Poor UX
**Effort**: Small
**Risk**: Low

### Option C: Use WebSocket library with built-in reconnect
**Pros**: Battle-tested, feature-rich
**Cons**: New dependency
**Effort**: Medium
**Risk**: Low

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/hooks/use-realtime-voice.ts`

**Reconnection considerations**:
- Max retry attempts (e.g., 5)
- Backoff timing (1s, 2s, 4s, 8s, 16s)
- Session state preservation
- User notification during reconnection

## Acceptance Criteria

- [ ] Automatic reconnection on unexpected close
- [ ] Exponential backoff prevents server overload
- [ ] Max retries with user notification
- [ ] Session context preserved across reconnect

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | Common reliability pattern |

## Resources

- Exponential backoff patterns
