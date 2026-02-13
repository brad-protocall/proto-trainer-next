---
status: pending
priority: p2
issue_id: "060"
tags: [code-review, data-integrity, database]
dependencies: []
---

# Missing unique constraint on (sessionId, attemptNumber, turnOrder)

## Problem Statement
The `TranscriptTurn` table has no unique constraint on `(sessionId, attemptNumber, turnOrder)`. While the current delete+insert pattern prevents duplicates within a single write, there's no database-level guard against duplicate turn orders if the transaction isolation is weaker than expected, or if the delete+insert pattern is ever changed back to append.

## Findings
- **Flagged by**: Data Integrity Guardian (MEDIUM)
- File: `prisma/schema.prisma` — `TranscriptTurn` model
- The delete+insert transaction provides application-level deduplication
- But without a DB constraint, a bug in the transaction logic or a future refactor to append could silently create duplicate turns
- SQLite's default isolation (serializable) provides strong guarantees, but PostgreSQL (Pi) uses read committed by default

## Proposed Solutions
### Option A: Add unique constraint via migration (Recommended)
- Add `@@unique([sessionId, attemptNumber, turnOrder])` to the Prisma schema
- Pros: Database-level guarantee, catches bugs early, enables `skipDuplicates` if switching to append
- Cons: Requires migration, must verify no existing duplicates first
- Effort: Small
- Risk: Low (verify data first)

### Option B: Document as acceptable for prototype
- Add a comment in schema.prisma noting the constraint is intentionally omitted for simplicity
- Pros: Zero effort
- Cons: Technical debt accumulates
- Effort: None
- Risk: Low (for prototype)

## Acceptance Criteria
- [ ] Unique constraint exists on (sessionId, attemptNumber, turnOrder)
- [ ] Migration applied to both dev and Pi databases
- [ ] No existing duplicate data (verify before migration)

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `prisma/schema.prisma`
- File: `src/app/api/sessions/[id]/transcript/route.ts`
