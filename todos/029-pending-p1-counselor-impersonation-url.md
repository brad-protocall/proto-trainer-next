---
status: pending
priority: p1
issue_id: "029"
tags: [code-review, security, authorization]
dependencies: []
---

# Counselor Impersonation via URL Parameter

## Problem Statement

The counselor selector allows any user to impersonate another counselor by changing the URL parameter. The `handleCounselorChange` function redirects to `/counselor?userId=${counselorId}` and the page accepts any valid counselor ID without verifying the authenticated user matches.

**Why it matters**: Any user can view assignments, start training sessions, and see evaluation feedback belonging to other counselors. This is a privacy violation and data integrity risk.

## Findings

**Location**:
- `src/app/counselor/page.tsx` (lines 116-130)
- `src/components/counselor-dashboard.tsx` (lines 329-333)

```typescript
const handleCounselorChange = (counselorId: string) => {
  // Update URL with new counselor ID to trigger reload
  window.location.href = `/counselor?userId=${counselorId}`;
};
```

**Impact:**
- Any user can view assignments belonging to other counselors
- Counselors can impersonate others to start/view training sessions
- Training records could be attributed to wrong users
- Privacy violation - viewing other users' evaluation feedback

**Exploitability:** HIGH - Simply change the URL parameter

## Proposed Solutions

### Option A: Remove Counselor Selector for Counselors (Recommended)
**Pros**: Simple, eliminates the attack vector entirely
**Cons**: Loses supervisor "view as counselor" functionality
**Effort**: Small (30 min)
**Risk**: None

Only show the counselor selector for users with supervisor/admin role.

### Option B: Server-Side User Validation
**Pros**: Preserves functionality, adds proper authorization
**Cons**: More complex, requires auth infrastructure changes
**Effort**: Medium (2 hours)
**Risk**: Low

Validate that `x-user-id` header matches `userId` URL parameter on the server, or implement proper session-based auth.

### Option C: Session-Based Auth Instead of URL Params
**Pros**: Most secure, industry standard
**Cons**: Significant architecture change
**Effort**: Large (1+ days)
**Risk**: Medium

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/app/counselor/page.tsx`
- `src/components/counselor-dashboard.tsx`

## Acceptance Criteria

- [ ] Counselors cannot view other counselors' dashboards
- [ ] URL manipulation does not bypass authorization
- [ ] Supervisors can still view any counselor's dashboard (if intended)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Security sentinel flagged as CRITICAL |

## Resources

- OWASP: Broken Access Control
