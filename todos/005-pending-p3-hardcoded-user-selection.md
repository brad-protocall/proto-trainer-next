---
status: pending
priority: p3
issue_id: PR-20-005
tags: [code-review, agent-native, ux]
dependencies: []
---

# Hardcoded User Selection in UI

## Problem Statement

The application uses hardcoded user selection dropdowns in the UI to simulate authentication. While this maintains feature parity with the original app, it's not agent-native - an AI agent can't easily select a user or understand the current authentication context.

**Why it matters:** Agent-native design ensures that any action a user can take, an agent can also take through the API.

## Findings

The dashboards include user selection dropdowns that set user context:
- Supervisor dashboard has user selector for testing
- Counselor dashboard has user selector for testing
- API routes rely on `x-user-id` header

**Current flow:**
1. User selects themselves from dropdown
2. Header is set on API requests
3. API routes read header for auth

## Proposed Solutions

### Option 1: Document API authentication clearly (Recommended for now)
**Pros:** Quick, enables agent use via API
**Cons:** UI still requires manual selection
**Effort:** Small
**Risk:** Low

Add API documentation showing how agents can authenticate via headers.

### Option 2: Add URL-based user context
**Pros:** Bookmarkable, shareable
**Cons:** Security concern if exposed
**Effort:** Medium
**Risk:** Medium

`/counselor?user_id=xxx` could set context

### Option 3: Implement proper auth (future)
**Pros:** Production-ready
**Cons:** Significant change
**Effort:** Large
**Risk:** Low

Add session-based auth with login flow.

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/components/counselor-dashboard.tsx`
- `src/components/supervisor-dashboard.tsx`
- `src/app/counselor/page.tsx`
- `src/app/supervisor/page.tsx`

## Acceptance Criteria

- [ ] API authentication documented for agent use
- [ ] Agents can complete full workflows via API
- [ ] User context can be programmatically set

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #20 review | Agent-native reviewer flagged user selection |

## Resources

- [PR #20](https://github.com/brad-pendergraft/proto-trainer-next/pull/20)
