---
status: pending
priority: p2
issue_id: "032"
tags: [code-review, cleanup, logging]
dependencies: []
---

# Debug Console.log Statements in Production Code

## Problem Statement

Multiple `console.log` and `console.warn` statements were added for debugging but not removed. These will pollute production browser console and expose internal data.

**Why it matters**: Information leakage, log noise, minor performance overhead from string serialization.

## Findings

**Locations**:
- `src/components/voice-training-view.tsx` (lines 47-49)
- `src/app/training/voice/[assignmentId]/page.tsx` (lines 63-66, 107-111)
- `src/hooks/use-realtime-voice.ts` (lines 213, 217-218)

```typescript
// voice-training-view.tsx
console.log("[Voice View] Assignment object:", assignment);
console.log("[Voice View] Assignment keys:", assignment ? Object.keys(assignment) : "null");
console.log("[Voice View] Extracted:", { scenarioId, scenarioTitle, ... });

// use-realtime-voice.ts
console.log("[Voice Hook] Connecting with:", { userId, scenarioId, assignmentId, url });
console.warn("[Voice Hook] WARNING: assignmentId is present but scenarioId is undefined!");
```

## Proposed Solutions

### Option A: Remove All Debug Logs (Recommended)
**Pros**: Cleanest solution
**Cons**: Loses debugging info
**Effort**: Small (10 min)
**Risk**: None

Delete all the console.log statements.

### Option B: Wrap in Development Check
**Pros**: Keeps debug info for development
**Cons**: More code
**Effort**: Small (15 min)
**Risk**: None

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log("[Voice Hook] Connecting with:", { ... });
}
```

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/components/voice-training-view.tsx`
- `src/app/training/voice/[assignmentId]/page.tsx`
- `src/hooks/use-realtime-voice.ts`

## Acceptance Criteria

- [ ] No debug console.log statements in production code
- [ ] Browser console is clean during normal operation
- [ ] ~15 lines removed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | All 7 agents flagged this |

## Resources

- PR: uncommitted changes
