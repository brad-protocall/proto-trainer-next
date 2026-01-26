---
status: pending
priority: p2
issue_id: "026"
tags: [code-review, data-integrity, prisma, scripts]
dependencies: []
---

# Migration Scripts Missing Transaction Boundaries

## Problem Statement

Both `backfill-scenario-metadata.ts` and `migrate-skill-to-array.ts` update scenarios one by one without transaction wrapping. If a script crashes midway, data is left in an inconsistent state.

**Why it matters**: Partial failures leave some scenarios migrated and others not, with no rollback capability.

## Findings

**Location**: 
- `scripts/backfill-scenario-metadata.ts` lines 28-59
- `scripts/migrate-skill-to-array.ts` lines 16-32

**Current pattern** (unsafe):
```typescript
for (const s of scenarios) {
  await prisma.scenario.update({...});  // Individual writes
}
```

**Risks**:
1. Partial failure leaves inconsistent state
2. Concurrent writes can cause data loss
3. No way to verify which records were processed

## Proposed Solutions

### Option A: Prisma $transaction (Recommended)
**Pros**: Simple, Prisma-native
**Cons**: Memory usage if many scenarios
**Effort**: Small (30 min)
**Risk**: Low

```typescript
await prisma.$transaction(async (tx) => {
  for (const s of scenarios) {
    await tx.scenario.update({...});
  }
});
```

### Option B: Batch with checkpoint logging
**Pros**: Handles large datasets, resumable
**Cons**: More complex
**Effort**: Medium (1 hour)
**Risk**: Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `scripts/backfill-scenario-metadata.ts`
- `scripts/migrate-skill-to-array.ts`

## Acceptance Criteria

- [ ] Scripts wrapped in prisma.$transaction
- [ ] Scripts are idempotent (safe to re-run)
- [ ] Partial failure rolls back all changes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Data integrity guardian flagged |

## Resources

- PR: commit 31b743e
- Prisma transactions: https://www.prisma.io/docs/concepts/components/prisma-client/transactions
