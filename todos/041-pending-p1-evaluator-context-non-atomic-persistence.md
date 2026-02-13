---
status: pending
priority: p1
issue_id: "041"
tags: [code-review, data-integrity, architecture]
dependencies: []
---

# Evaluator context file persistence is non-atomic with stale response

## Problem Statement
Three sequential operations occur without transactional guarantees: `prisma.create` -> `writeFile` -> `prisma.update`. If `writeFile` fails, a scenario exists in the database without its evaluator context. If the subsequent `prisma.update` fails, an orphaned file sits on disk with no database reference. Additionally, the `scenario` object returned to the client comes from the initial CREATE call and does not include the `evaluatorContextPath` even when all three operations succeed. The same non-atomic pattern exists in the import route (pre-existing).

## Findings
- File: `src/app/api/scenarios/route.ts`, lines 106-138
- Step 1: `prisma.scenario.create(...)` -- creates the scenario record
- Step 2: `writeFile(...)` -- writes evaluator context to disk
- Step 3: `prisma.scenario.update(...)` -- updates scenario with file path
- No try/catch wrapping steps 2-3 to clean up on failure
- The response returns the `scenario` from step 1, which lacks `evaluatorContextPath`
- Same pattern exists in the CSV import route (pre-existing technical debt)

## Proposed Solutions
### Option A: Wrap in try/catch, delete scenario on file failure, re-fetch for response
- After create, wrap writeFile + update in try/catch
- On failure: delete the scenario record, clean up any partial file, return error
- On success: re-fetch the scenario to return the complete object with evaluatorContextPath
- Pros: Addresses atomicity without schema changes
- Cons: Still has a small window where scenario exists without context (between create and write)
- Effort: Medium
- Risk: Low

### Option B: Store evaluatorContext as text column in DB
- Add an `evaluator_context` text column to the Scenario model
- Eliminate file I/O entirely for this data
- Pros: True atomicity via database transaction, simplest long-term, no orphaned files possible
- Cons: Requires schema migration, larger change surface, may affect import route too
- Effort: Large (schema migration)
- Risk: Low

### Option C: Compute path deterministically before create, include in create call
- Generate the file path (using scenario ID pattern or UUID) before the prisma.create call
- Include `evaluatorContextPath` in the initial create data
- Write the file after create -- if write fails, the path in DB is a dangling reference but the scenario is otherwise valid
- Pros: Response always includes the path, minimal code change
- Cons: Dangling path reference if file write fails (but can be detected and retried)
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Either all three operations succeed atomically, or failure is surfaced to the user with cleanup
- [ ] API response includes `evaluatorContextPath` when evaluator context is provided
- [ ] No orphaned scenarios without evaluator context on partial failure
- [ ] No orphaned files on disk without corresponding database record
- [ ] `npx tsc --noEmit` passes with zero errors

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
