---
status: pending
priority: p2
issue_id: "025"
tags: [code-review, performance, database, prisma]
dependencies: []
---

# Missing Database Indexes on Foreign Keys

## Problem Statement

The PostgreSQL migration creates foreign keys but no performance indexes for commonly filtered columns. This will cause full table scans as data grows.

**Why it matters**: At 10,000+ assignments, dashboard queries will degrade from 50ms to 1000ms+.

## Findings

**Location**: `prisma/schema.prisma`, `prisma/migrations/`

**Missing indexes on**:
- `assignments.counselor_id` - filtered in counselor dashboard
- `assignments.scenario_id` - filtered when viewing scenario assignments
- `assignments.status` - filtered on every dashboard view
- `sessions.assignment_id` - joined frequently
- `sessions.user_id` - filtered by user

**Current impact** (42 scenarios): Negligible
**Projected impact** (10,000 scenarios): 60-100x slower queries

## Proposed Solutions

### Option A: Add Prisma indexes (Recommended)
**Pros**: Managed by Prisma, easy to apply
**Cons**: None
**Effort**: Small (15 min)
**Risk**: None

Create migration:
```prisma
model Assignment {
  // ... fields
  @@index([counselorId])
  @@index([scenarioId])
  @@index([status])
  @@index([status, createdAt(sort: Desc)])
}

model Session {
  @@index([assignmentId])
  @@index([userId])
  @@index([scenarioId])
}
```

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `prisma/schema.prisma`
- New migration file

**Commands**:
```bash
npx prisma migrate dev --name add_performance_indexes
```

## Acceptance Criteria

- [ ] Indexes added to schema.prisma
- [ ] Migration created and applied
- [ ] `EXPLAIN ANALYZE` shows index usage on filtered queries

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Performance oracle identified |

## Resources

- PR: commit 31b743e
