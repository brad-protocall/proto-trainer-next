---
status: pending
priority: p1
issue_id: "017"
tags: [code-review, security, websocket, auth]
dependencies: []
---

# WebSocket Client Missing userId Parameter

## Problem Statement

The WebSocket client (`use-realtime-voice.ts`) connects to the server without sending the `userId` parameter. The server now requires `userId` for authentication (added in PR #22), but the client was not updated to send it.

**Why it matters**: Voice training sessions cannot authenticate users, breaking the entire voice training feature.

## Findings

**Source**: Security Sentinel, Architecture Strategist

**Location**: `src/hooks/use-realtime-voice.ts`

```typescript
// Current code - missing userId
const wsUrl = `${WS_URL}?scenarioId=${scenarioId}${assignmentId ? `&assignmentId=${assignmentId}` : ""}`;
```

The server expects:
```
ws://localhost:3004?userId=xxx&scenarioId=xxx&assignmentId=xxx
```

## Proposed Solutions

### Option A: Pass userId as hook parameter (Recommended)
**Pros**: Clean API, explicit dependency
**Cons**: Requires updating all call sites
**Effort**: Small
**Risk**: Low

### Option B: Get userId from context/prop drilling
**Pros**: Automatic, no prop changes
**Cons**: Adds complexity, coupling
**Effort**: Medium
**Risk**: Low

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/hooks/use-realtime-voice.ts` - Add userId parameter
- Components using the hook - Pass userId

## Acceptance Criteria

- [ ] Hook accepts userId parameter
- [ ] WebSocket URL includes userId
- [ ] Server successfully authenticates connection
- [ ] Voice training sessions work end-to-end

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | Auth mismatch between client/server |

## Resources

- PR #22: Added server-side auth
- `ws-server/index.ts`: Server auth implementation
