---
status: pending
priority: p1
issue_id: PR-22-002
tags: [code-review, configuration, build-blocker]
dependencies: []
---

# Port Configuration Mismatch

## Problem Statement

The WebSocket server defaults to port 3001, but the documented architecture (CLAUDE.md, .env.example) specifies port 3004. Port 3001 conflicts with "Basic PTG (existing legacy)" per the port assignments table.

**Why it matters:** This will cause port conflicts in development and deployment confusion.

## Findings

**File:** `ws-server/index.ts` (line 10)

```typescript
const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);
```

**Documented ports in CLAUDE.md:**
| Port | Service |
|------|---------|
| 3001 | Basic PTG (existing legacy) |
| **3004** | **proto-trainer-next WebSocket** |

## Proposed Solutions

### Option 1: Change default to 3004 (Recommended)
**Pros:** Matches documentation, simple fix
**Cons:** None
**Effort:** Trivial
**Risk:** None

```typescript
const WS_PORT = parseInt(process.env.WS_PORT || "3004", 10);
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `ws-server/index.ts`

## Acceptance Criteria

- [ ] Default port is 3004
- [ ] No conflicts with other services

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #22 review | Architecture strategist flagged |

## Resources

- [PR #22](https://github.com/brad-pendergraft/proto-trainer-next/pull/22)
- CLAUDE.md port assignments table
