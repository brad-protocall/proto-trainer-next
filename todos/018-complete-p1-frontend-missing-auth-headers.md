---
status: pending
priority: p1
issue_id: "018"
tags: [code-review, security, auth, api]
dependencies: []
---

# Frontend API Calls Missing x-user-id Headers

## Problem Statement

The dashboard components make API calls without sending the `x-user-id` header that the backend routes now require for authentication (added in PR #23).

**Why it matters**: API routes return 401 Unauthorized, breaking supervisor and counselor dashboards.

## Findings

**Source**: Security Sentinel, Architecture Strategist

**Locations**:
- `src/components/counselor-dashboard.tsx` - fetch calls
- `src/components/supervisor-dashboard.tsx` - fetch calls
- `src/hooks/use-chat.ts` - fetch calls

```typescript
// Current - missing header
const response = await fetch("/api/assignments");

// Required
const response = await fetch("/api/assignments", {
  headers: { "x-user-id": userId }
});
```

## Proposed Solutions

### Option A: Create useFetch hook with auth (Recommended)
**Pros**: Centralized, DRY, consistent
**Cons**: Requires refactoring existing fetches
**Effort**: Medium
**Risk**: Low

### Option B: Add headers to each fetch call
**Pros**: Simple, direct
**Cons**: Repetitive, easy to forget
**Effort**: Small
**Risk**: Medium (inconsistency)

### Option C: Use fetch interceptor/wrapper
**Pros**: Automatic for all requests
**Cons**: Global state, less explicit
**Effort**: Medium
**Risk**: Low

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/components/counselor-dashboard.tsx`
- `src/components/supervisor-dashboard.tsx`
- `src/hooks/use-chat.ts`
- Potentially create `src/lib/fetch.ts`

## Acceptance Criteria

- [ ] All API fetches include x-user-id header
- [ ] Header value comes from authenticated user
- [ ] No 401 errors in dashboard navigation
- [ ] Tests verify header is sent

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | Auth patterns added server-side but not client-side |

## Resources

- PR #23: Added requireAuth() to API routes
- `src/lib/auth.ts`: Server auth implementation
