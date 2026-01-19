---
status: pending
priority: p1
issue_id: PR-22-001
tags: [code-review, security, websocket, authentication]
dependencies: []
---

# No Authentication on WebSocket Connections

## Problem Statement

The WebSocket relay server accepts connections from any client without authentication. Any attacker who discovers the endpoint can initiate connections, consuming OpenAI API credits and accessing training scenarios without authorization.

**Why it matters:** This is a critical security vulnerability that allows unauthorized access and potential financial abuse.

## Findings

**File:** `ws-server/index.ts` (lines 44-62)

```typescript
wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
  const params = parseQueryParams(request);
  // NO AUTHENTICATION CHECK HERE
  const session = new RealtimeSession(ws, params);
  sessions.set(ws, session);
  await session.connect();  // Immediately connects to OpenAI API
});
```

**Impact:**
- Any client can connect without credentials
- Each connection consumes OpenAI API credits
- No audit trail of who uses the system
- Combined with no origin validation, enables CSWSH attacks

## Proposed Solutions

### Option 1: Token-based authentication via query param (Recommended)
**Pros:** Simple to implement, works with WebSocket handshake
**Cons:** Token visible in URL
**Effort:** Medium
**Risk:** Low

```typescript
wss.on("connection", async (ws, request) => {
  const url = new URL(request.url || "/", `http://localhost:${WS_PORT}`);
  const token = url.searchParams.get("token");

  // Validate token against session store
  const user = await validateSessionToken(token);
  if (!user) {
    ws.close(4001, "Unauthorized");
    return;
  }
  // Continue with connection...
});
```

### Option 2: Subprotocol authentication
**Pros:** More secure, token not in URL
**Cons:** More complex implementation
**Effort:** Medium
**Risk:** Low

### Option 3: HTTP upgrade header with JWT
**Pros:** Standard approach
**Cons:** Requires client changes
**Effort:** Medium
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `ws-server/index.ts`

## Acceptance Criteria

- [ ] WebSocket connections require valid authentication token
- [ ] Invalid tokens result in immediate connection close with 4001 code
- [ ] Token validation logs user identity
- [ ] Rate limiting per authenticated user

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #22 review | Security sentinel flagged as critical |

## Resources

- [PR #22](https://github.com/brad-pendergraft/proto-trainer-next/pull/22)
- [WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
