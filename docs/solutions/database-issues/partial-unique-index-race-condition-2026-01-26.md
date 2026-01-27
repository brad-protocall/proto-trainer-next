---
title: Partial Unique Index Prevents Duplicate Assignment Race Condition
date: 2026-01-26
severity: P1
category: database-issues
components:
  - prisma/migrations/20260127000000_add_unique_active_assignment_index/migration.sql
  - src/app/api/external/assignments/route.ts
  - src/app/api/assignments/route.ts
symptoms:
  - Duplicate active assignments for same counselor/scenario pair
  - Concurrent API requests both succeed when only one should
  - Data integrity violations in assignment table
  - Corrupted reporting metrics due to duplicates
root_causes:
  - Check-then-create pattern has inherent race condition window
  - Application-level validation cannot prevent concurrent request conflicts
commits:
  - 5c1f4ed
tags:
  - race-condition
  - data-integrity
  - postgresql
  - prisma
  - concurrency
---

# Partial Unique Index Prevents Duplicate Assignment Race Condition

## Problem Summary

The assignment creation API used a "check-then-create" pattern to prevent duplicate active assignments. Between the `findFirst` check and the `create` call, a window existed where concurrent requests could both pass the check and create duplicate assignments.

## The Race Condition Explained

### Timeline Diagram

```
Time    Request A                         Request B
────    ─────────────────────────         ─────────────────────────
T1      findFirst() - no match
T2                                        findFirst() - no match (race!)
T3      create() - SUCCESS
T4                                        create() - SUCCESS (duplicate!)
```

Both requests pass the existence check because neither sees the other's not-yet-committed write.

### Original Vulnerable Code

```typescript
// src/app/api/external/assignments/route.ts (lines 158-195)

// T1/T2: Check for existing active assignment
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

// T3/T4: Race condition window - both requests reach here!
const assignment = await prisma.assignment.create({
  data: { ... }
})
```

### Why Application-Level Checks Are Insufficient

Even with transactions, the default READ COMMITTED isolation level allows this race:

```typescript
// Still vulnerable with default transaction isolation
await prisma.$transaction(async (tx) => {
  const existing = await tx.assignment.findFirst({ ... });
  if (existing) throw new Error('Conflict');
  return tx.assignment.create({ ... });  // Race still possible
});
```

The `findFirst` inside a transaction doesn't take a lock on "rows that don't exist yet."

## Solution: PostgreSQL Partial Unique Index

A database-level partial unique index provides bulletproof protection because it operates at the constraint level, where PostgreSQL guarantees atomicity.

### Migration

```sql
-- prisma/migrations/20260127000000_add_unique_active_assignment_index/migration.sql

-- CreateIndex: Partial unique index to prevent duplicate active assignments
-- This prevents race conditions where concurrent requests could create duplicate
-- non-completed assignments for the same counselor/scenario pair
CREATE UNIQUE INDEX "unique_active_assignment" ON "assignments" ("counselor_id", "scenario_id")
WHERE "status" != 'completed';
```

### How It Works

1. **Constraint is checked at INSERT time** - The database checks uniqueness when the row is actually written, not when the application checks
2. **Partial condition** - The `WHERE status != 'completed'` clause allows multiple completed assignments while preventing duplicates among active ones
3. **Atomic enforcement** - PostgreSQL's write-ahead log ensures the constraint is checked atomically with the insert

### Timeline With Index

```
Time    Request A                         Request B
────    ─────────────────────────         ─────────────────────────
T1      findFirst() - no match
T2                                        findFirst() - no match
T3      create() - SUCCESS
T4                                        create() - UNIQUE CONSTRAINT VIOLATED!
```

## Graceful Constraint Violation Handling

The application code catches the constraint violation and returns the same 409 response the check would have returned:

```typescript
// src/app/api/external/assignments/route.ts (lines 180-216)

try {
  const assignment = await prisma.assignment.create({
    data: {
      scenarioId: scenario.id,
      counselorId: user.id,
      assignedBy: EXTERNAL_SYSTEM_USER_ID,
      accountId: EXTERNAL_ACCOUNT_ID,
      status: 'pending',
      dueDate: dueDate ? new Date(dueDate) : null,
    },
    include: {
      scenario: {
        select: { id: true, title: true },
      },
    },
  })

  return apiSuccess({ assignment: toExternalAssignment(assignment) }, 201)
} catch (createError) {
  // Handle unique constraint violation (race condition caught by DB index)
  if (
    createError instanceof Error &&
    createError.message.includes('Unique constraint failed')
  ) {
    return apiError(
      {
        type: 'CONFLICT',
        message: 'Active assignment already exists for this counselor and scenario',
      },
      409
    )
  }
  throw createError
}
```

### Why Keep Both Check and Catch?

The `findFirst` check remains for these reasons:

1. **Better user experience** - Returns 409 immediately without attempting a write
2. **Clearer error messages** - Can include more context from the existing assignment
3. **Reduced database load** - Avoids unnecessary INSERT attempts
4. **Defense in depth** - The index is the backup for the rare race condition case

## Why Partial Index Beats Serializable Transactions

### Option Comparison

| Approach | Correctness | Performance | Complexity | Deadlock Risk |
|----------|-------------|-------------|------------|---------------|
| Check-then-create (original) | Vulnerable | Fast | Simple | None |
| Serializable isolation | Correct | Slow | Medium | High |
| Advisory locks | Correct | Medium | High | Medium |
| **Partial unique index** | **Correct** | **Fast** | **Simple** | **None** |

### Serializable Isolation Drawbacks

```typescript
// Works but has significant downsides
await prisma.$transaction(async (tx) => {
  const existing = await tx.assignment.findFirst({ ... });
  if (existing) throw new ConflictError();
  return tx.assignment.create({ ... });
}, { isolationLevel: 'Serializable' });
```

Problems:
1. **Performance penalty** - Serializable requires predicate locks on all read rows
2. **Retry logic required** - Serialization failures require application-level retry
3. **Deadlock potential** - Complex transactions can deadlock and need retry handling
4. **Contention** - High-traffic tables suffer from lock contention

### Partial Index Advantages

1. **Zero application complexity** - Database handles it automatically
2. **No performance penalty** - Index lookup is O(log n)
3. **No deadlocks** - Constraint violations are immediate, not blocking
4. **Idempotent error handling** - Same 409 response regardless of timing

## Testing the Race Condition Fix

### Manual Test

```bash
# Open two terminals and run simultaneously:

# Terminal 1
curl -X POST http://localhost:3003/api/external/assignments \
  -H "X-API-Key: $EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"counselor-ext-id","scenario_id":"scenario-uuid"}'

# Terminal 2 (run at same instant)
curl -X POST http://localhost:3003/api/external/assignments \
  -H "X-API-Key: $EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"counselor-ext-id","scenario_id":"scenario-uuid"}'

# Expected: One returns 201, other returns 409
```

### Automated Concurrent Test

```typescript
describe('Assignment Race Condition Prevention', () => {
  it('prevents duplicate assignments under concurrent requests', async () => {
    const createPromise = () => fetch('/api/external/assignments', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'test-user', scenario_id: scenarioId }),
    });

    // Fire 10 concurrent requests
    const results = await Promise.all(
      Array(10).fill(null).map(() => createPromise())
    );

    const statuses = results.map(r => r.status);
    const created = statuses.filter(s => s === 201).length;
    const conflicts = statuses.filter(s => s === 409).length;

    expect(created).toBe(1);  // Exactly one succeeds
    expect(conflicts).toBe(9); // Rest get 409

    // Verify only one assignment in database
    const count = await prisma.assignment.count({
      where: { counselorId: testUserId, scenarioId, status: { not: 'completed' } }
    });
    expect(count).toBe(1);
  });
});
```

## Key Takeaways

1. **Database constraints are superior to application checks** for concurrency-sensitive uniqueness requirements
2. **Partial unique indexes** allow conditional uniqueness (e.g., only among non-completed records)
3. **Keep the application-level check** for UX and efficiency; use the database constraint as the bulletproof backup
4. **Catch constraint violations gracefully** and return the same response the check would have returned
5. **Avoid Serializable isolation** unless truly necessary; database constraints are faster and simpler

## Related Documentation

- [API-Frontend Contract Mismatch](../integration-issues/api-frontend-contract-mismatch-bulk-assignments.md) - Related bulk assignment issues
- [Bug Prevention Patterns](../prevention-strategies/bug-prevention-patterns.md) - General patterns for preventing bugs

---

*Documented 2026-01-26 after implementing partial unique index to fix P1 race condition*
