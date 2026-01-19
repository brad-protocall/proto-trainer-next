---
status: pending
priority: p1
issue_id: PR-22-004
tags: [code-review, configuration, reliability]
dependencies: []
---

# Missing Startup Environment Validation

## Problem Statement

The server starts successfully even without `OPENAI_API_KEY`. Validation only occurs when a client connects. This means the health check returns 200 OK for a non-functional server.

**Why it matters:** Ops team may deploy a server that appears healthy but cannot serve any requests.

## Findings

**File:** `ws-server/realtime-session.ts` (lines 66-69)

```typescript
async connect(): Promise<void> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  // ...
}
```

**File:** `ws-server/index.ts` (lines 26-31) - Health check passes regardless

```typescript
if (req.url === "/health") {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));  // Always "ok"
  return;
}
```

## Proposed Solutions

### Option 1: Fail fast at startup (Recommended)
**Pros:** Immediate feedback, clear error
**Cons:** None
**Effort:** Trivial
**Risk:** None

```typescript
// At top of index.ts, after dotenv config
if (!process.env.OPENAI_API_KEY) {
  console.error("[WS] FATAL: OPENAI_API_KEY is required");
  process.exit(1);
}
```

### Option 2: Health check verifies API key exists
**Pros:** Monitoring can detect
**Cons:** Still starts in bad state
**Effort:** Trivial
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `ws-server/index.ts`

## Acceptance Criteria

- [ ] Server fails to start if OPENAI_API_KEY missing
- [ ] Clear error message on failure
- [ ] Health check reflects actual readiness

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #22 review | Architecture strategist flagged |

## Resources

- [PR #22](https://github.com/brad-pendergraft/proto-trainer-next/pull/22)
