---
status: pending
priority: p2
issue_id: PR-20-002
tags: [code-review, architecture, maintainability]
dependencies: []
---

# Monolithic Dashboard Components

## Problem Statement

The supervisor and counselor dashboards are monolithic components with 1000+ and 600+ lines respectively. This makes them difficult to understand, test, and maintain. Changes to one feature risk breaking others.

**Why it matters:** Large components increase cognitive load, make testing harder, and slow down development velocity.

## Findings

**Line counts:**
- `src/components/supervisor-dashboard.tsx` - 1011 lines
- `src/components/counselor-dashboard.tsx` - 610 lines

**Issues:**
- Multiple responsibilities in single components
- Difficult to unit test individual features
- State management spans unrelated features
- Hard to onboard new developers

## Proposed Solutions

### Option 1: Extract tab content to separate components (Recommended)
**Pros:** Clear boundaries, testable units, reusable
**Cons:** More files to manage
**Effort:** Medium
**Risk:** Low

```
src/components/
  supervisor-dashboard.tsx (orchestrator, ~200 lines)
  supervisor/
    scenarios-tab.tsx (~300 lines)
    assignments-tab.tsx (~300 lines)
    scenario-form-modal.tsx (~150 lines)
    assignment-form-modal.tsx (~150 lines)
```

### Option 2: Use component composition with render props
**Pros:** Flexible, keeps related code together
**Cons:** Can become complex
**Effort:** Medium
**Risk:** Medium

### Option 3: Extract only shared utilities first
**Pros:** Quick win, reduces duplication
**Cons:** Doesn't address structural issues
**Effort:** Small
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/components/supervisor-dashboard.tsx`
- `src/components/counselor-dashboard.tsx`

**New files to create (Option 1):**
- `src/components/supervisor/scenarios-tab.tsx`
- `src/components/supervisor/assignments-tab.tsx`
- `src/components/supervisor/scenario-form-modal.tsx`
- `src/components/supervisor/assignment-form-modal.tsx`
- `src/lib/format.ts`

## Acceptance Criteria

- [ ] No component exceeds 400 lines
- [ ] Each component has single responsibility
- [ ] Shared utilities extracted to `src/lib/format.ts`
- [ ] All existing functionality preserved
- [ ] Components are independently testable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #20 review | supervisor-dashboard.tsx is 1011 lines |

## Resources

- [PR #20](https://github.com/brad-pendergraft/proto-trainer-next/pull/20)
- Original plan includes dashboard split as Phase 6
