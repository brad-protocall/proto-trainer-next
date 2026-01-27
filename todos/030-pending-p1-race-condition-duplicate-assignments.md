---
status: pending
priority: p1
issue_id: "030"
tags: [code-review, data-integrity, race-condition]
dependencies: []
---

# Race Condition in Duplicate Assignment Check

## Problem Statement

The duplicate assignment check and creation in the external API are not wrapped in a transaction. Between the `findFirst` check and the `create` call, another concurrent request could create the same assignment, resulting in duplicate active assignments.

**Why it matters**: Duplicate active assignments cause confusion, corrupt reporting metrics, and could lead to counselors completing the same scenario twice.

## Findings

**Location**: `src/app/api/external/assignments/route.ts` (lines 158-195)

```typescript
// Lines 158-165 (check)
const existingActive = await prisma.assignment.findFirst({
  where: {
    counselorId: user.id,
    scenarioId: scenarioId,
    status: { not: 'completed' },
  },
})

if (existingActive) {
  return apiError({ ... }, 409)
}

// Lines 177-195 (create - NOT atomic with check!)
const assignment = await prisma.assignment.create({ ... })
```

**Race Scenario**:
1. Request A calls `findFirst` - no existing active assignment found
2. Request B calls `findFirst` - no existing active assignment found (race)
3. Request A creates assignment
4. Request B creates assignment (duplicate!)

## Proposed Solutions

### Option A: Database Unique Partial Index (Recommended)
**Pros**: Bulletproof, no code changes to check logic
**Cons**: Requires migration
**Effort**: Small (30 min)
**Risk**: None

```sql
CREATE UNIQUE INDEX unique_active_assignment
ON assignments (counselor_id, scenario_id)
WHERE status != 'completed';
```

### Option B: Wrap in Transaction with Serializable Isolation
**Pros**: Works without schema change
**Cons**: Performance impact, potential deadlocks
**Effort**: Small (30 min)
**Risk**: Low

```typescript
await prisma.$transaction(async (tx) => {
  const existing = await tx.assignment.findFirst({ ... });
  if (existing) throw new ConflictError();
  return tx.assignment.create({ ... });
}, { isolationLevel: 'Serializable' });
```

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/app/api/external/assignments/route.ts`
- `src/app/api/assignments/route.ts` (bulk create has same issue)

## Acceptance Criteria

- [ ] Concurrent duplicate assignment requests result in only one assignment created
- [ ] Second request receives 409 Conflict response
- [ ] No duplicate active assignments can exist in database

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Data integrity guardian flagged as CRITICAL |

## Resources

- Prisma transactions: https://www.prisma.io/docs/concepts/components/prisma-client/transactions
