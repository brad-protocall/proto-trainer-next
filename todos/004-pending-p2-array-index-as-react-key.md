---
status: pending
priority: p2
issue_id: PR-20-004
tags: [code-review, react, performance]
dependencies: []
---

# Array Index Used as React Key

## Problem Statement

Several components use array index as the React key prop. This can cause performance issues and incorrect component state when lists are reordered, filtered, or have items added/removed.

**Why it matters:** React uses keys to identify which items have changed. Index-based keys cause unnecessary re-renders and can lead to state bugs.

## Findings

**Locations:**
- `src/components/bulk-import-modal.tsx:423` - `key={index}` for parsed scenarios
- `src/components/bulk-import-modal.tsx:464` - `key={index}` for validation errors
- `src/components/bulk-import-modal.tsx:539` - `key={index}` for created titles
- `src/components/bulk-import-modal.tsx:552` - `key={index}` for skipped titles
- `src/components/chat-training-view.tsx:86` - `.map((msg, i)` (check if i is used as key)

**Evidence:**
```typescript
{parsedScenarios.map((scenario, index) => {
  // ...
  key={index}
```

## Proposed Solutions

### Option 1: Use stable identifiers where available (Recommended)
**Pros:** Correct React behavior, optimal performance
**Cons:** Need to identify unique properties
**Effort:** Small
**Risk:** Low

For parsed scenarios, use `scenario.title` or generate a unique ID during parsing.
For messages, use message ID or timestamp.

### Option 2: Generate unique IDs on render
**Pros:** Works for any list
**Cons:** Adds computation
**Effort:** Small
**Risk:** Low

```typescript
const itemsWithIds = items.map((item, i) => ({ ...item, _id: `${Date.now()}-${i}` }))
```

### Option 3: Accept for read-only display lists
**Pros:** No changes needed for static lists
**Cons:** Doesn't address mutable lists
**Effort:** None
**Risk:** Low for static lists only

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/components/bulk-import-modal.tsx`
- `src/components/chat-training-view.tsx`

## Acceptance Criteria

- [ ] All lists with user interaction use stable keys
- [ ] No index-based keys for reorderable lists
- [ ] Documentation if index keys are intentionally used for static lists

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #20 review | Found 5+ instances of index-based keys |

## Resources

- [PR #20](https://github.com/brad-pendergraft/proto-trainer-next/pull/20)
- [React keys documentation](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)
