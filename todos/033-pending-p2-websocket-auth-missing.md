---
status: pending
priority: p2
issue_id: "033"
tags: [code-review, security, websocket, authentication]
dependencies: []
---

# Missing WebSocket Authentication

## Problem Statement

The WebSocket connection accepts `userId`, `scenarioId`, and `assignmentId` as URL parameters without server-side validation that the user is authorized. The server trusts the client-provided `userId`.

**Why it matters**: Users could access scenarios they aren't assigned to, create sessions attributed to other users, and recordings/transcripts could be misattributed.

## Findings

**Location**:
- `ws-server/realtime-session.ts` (lines 78-86, 106-113)
- `src/hooks/use-realtime-voice.ts` (lines 199-212)

```typescript
// Client controls all these params - server trusts them
const params = new URLSearchParams();
params.set("userId", userId);      // Client controls
params.set("scenarioId", scenarioId);  // Client controls
params.set("assignmentId", assignmentId);  // Client controls
```

**Exploitability:** MEDIUM - Requires knowledge of valid IDs

## Proposed Solutions

### Option A: Validate Assignment Ownership on Server (Recommended)
**Pros**: Uses existing API auth patterns
**Cons**: Additional API call per connection
**Effort**: Medium (1 hour)
**Risk**: Low

In `createDbSession()`, verify the user owns the assignment before proceeding.

### Option B: Short-Lived Server-Generated Token
**Pros**: Most secure
**Cons**: More complex, requires token generation endpoint
**Effort**: Large (2+ hours)
**Risk**: Low

Generate a short-lived token when user navigates to training page, validate on WebSocket connect.

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `ws-server/realtime-session.ts`

## Acceptance Criteria

- [ ] WebSocket server validates user authorization
- [ ] Users cannot connect to other users' assignments
- [ ] Sessions are correctly attributed to the authenticated user

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Security sentinel flagged as IMPORTANT |

## Resources

- PR: uncommitted changes
