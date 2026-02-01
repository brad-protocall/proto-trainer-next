# PRD: Proto Trainer Next - Pre-Handoff Cleanup

## Introduction

Comprehensive cleanup of all P1 and P2 issues before sharing the codebase with Software Engineering. This includes security fixes, data integrity improvements, performance optimizations, type safety enhancements, and code cleanup. The goal is a production-ready codebase that demonstrates professional standards.

## Goals

- Fix all 3 P1 issues (security and data integrity blockers)
- Fix all 9 P2 issues (security, performance, types, cleanup)
- Achieve clean `npm run lint` and `npx tsc --noEmit`
- Auto-commit each fix as tests pass (aggressive mode)
- Prepare codebase for formal review workflow

## User Stories

### US-001: Extract buildAssignmentResponse to shared utility
**Description:** As a developer, I want a single source of truth for assignment response building so changes don't need to be made in multiple places.

**Acceptance Criteria:**
- [ ] Create `src/lib/assignment-utils.ts` with `buildAssignmentResponse` function
- [ ] Remove duplicate from `src/app/api/assignments/route.ts`
- [ ] Remove duplicate from `src/app/api/assignments/[id]/route.ts`
- [ ] Both routes import from shared utility
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] Commit: "refactor: extract buildAssignmentResponse to shared utility"

**Todo Reference:** 031-pending-p1

---

### US-002: Remove debug console.log statements
**Description:** As a user, I don't want to see debug information in my browser console when using the app.

**Acceptance Criteria:**
- [ ] Remove console.log from `src/components/voice-training-view.tsx` (lines 47-49)
- [ ] Remove console.log from `src/app/training/voice/[assignmentId]/page.tsx` (lines 63-66, 107-111)
- [ ] Remove console.log/warn from `src/hooks/use-realtime-voice.ts` (lines 213, 217-218)
- [ ] Browser console is clean during normal voice training operation
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "chore: remove debug console.log statements"

**Todo Reference:** 032-pending-p2

---

### US-003: Fix blob URL memory leak in recording playback
**Description:** As a counselor playing back multiple recordings, I don't want my browser to run out of memory.

**Acceptance Criteria:**
- [ ] Modify `handlePlayRecording` in `src/components/counselor-dashboard.tsx`
- [ ] Add `URL.revokeObjectURL()` call when audio window closes
- [ ] Inject cleanup script into popup window's onbeforeunload
- [ ] Test: Play 3 recordings, close windows, verify no memory leak in DevTools
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "fix: revoke blob URLs on recording window close"

**Todo Reference:** 034-pending-p2

---

### US-004: Add database indexes for performance
**Description:** As a developer, I want database queries to remain fast as data grows.

**Acceptance Criteria:**
- [ ] Add indexes to `prisma/schema.prisma`:
  - `Assignment: @@index([counselorId])`
  - `Assignment: @@index([scenarioId])`
  - `Assignment: @@index([status])`
  - `Assignment: @@index([status, createdAt(sort: Desc)])`
  - `Session: @@index([assignmentId])`
  - `Session: @@index([userId])`
  - `Session: @@index([scenarioId])`
- [ ] Run `npx prisma migrate dev --name add_performance_indexes`
- [ ] Migration applies successfully
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "perf: add database indexes on foreign keys"

**Todo Reference:** 025-pending-p2

---

### US-005: Make counselor selector read-only for non-supervisors
**Description:** As a counselor, I should only see my own dashboard and not be able to impersonate other counselors.

**Acceptance Criteria:**
- [ ] Modify `src/components/counselor-dashboard.tsx`:
  - Check user role before rendering selector
  - If role !== 'supervisor', show read-only display of current user name
  - If role === 'supervisor', show full selector (for "view as" functionality)
- [ ] Modify `src/app/counselor/page.tsx`:
  - Validate that URL userId param matches authenticated user (for non-supervisors)
  - Return 403 if counselor tries to access another counselor's dashboard
- [ ] URL manipulation `/counselor?userId=other-id` returns error for counselors
- [ ] Supervisors can still use selector to view any counselor's dashboard
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "security: restrict counselor dashboard to own assignments"

**Todo Reference:** 029-pending-p1

---

### US-006: Add unique index to prevent duplicate active assignments
**Description:** As a system, I must prevent two active assignments for the same counselor+scenario combination.

**Acceptance Criteria:**
- [ ] Create migration with partial unique index:
  ```sql
  CREATE UNIQUE INDEX unique_active_assignment
  ON "Assignment" ("counselorId", "scenarioId")
  WHERE status != 'completed';
  ```
- [ ] Run `npx prisma migrate dev --name unique_active_assignment_index`
- [ ] Update API error handling in `src/app/api/external/assignments/route.ts`:
  - Catch unique constraint violation
  - Return 409 Conflict with clear message
- [ ] Update API error handling in `src/app/api/assignments/route.ts` (bulk create)
- [ ] Test: Concurrent duplicate requests result in only one assignment
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "data: add unique index for active assignments"

**Todo Reference:** 030-pending-p1

---

### US-007: Add WebSocket authentication
**Description:** As a system, I must verify users are authorized before starting voice training sessions.

**Acceptance Criteria:**
- [ ] Modify `ws-server/realtime-session.ts`:
  - In `createDbSession()`, call API to verify assignment ownership
  - Verify `userId` owns the `assignmentId` before proceeding
  - Return WebSocket error and close connection if unauthorized
- [ ] Add validation endpoint or reuse existing assignment fetch
- [ ] Test: User A cannot connect to User B's assignment via WebSocket
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "security: validate assignment ownership on WebSocket connect"

**Todo Reference:** 033-pending-p2

---

### US-008: Add attempt tracking for session transcripts
**Description:** As a system, I must keep transcripts from different attempts separate to ensure clean evaluation data.

**Acceptance Criteria:**
- [ ] Add `attemptNumber` field to `TranscriptTurn` model in `prisma/schema.prisma`:
  ```prisma
  attemptNumber Int @default(1)
  ```
- [ ] Add `currentAttempt` field to `Session` model:
  ```prisma
  currentAttempt Int @default(1)
  ```
- [ ] Run `npx prisma migrate dev --name add_attempt_tracking`
- [ ] Modify `ws-server/realtime-session.ts`:
  - When reusing session, increment `currentAttempt`
  - Pass `attemptNumber` when creating transcript turns
- [ ] Modify evaluation to use only latest attempt transcripts
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "data: add attempt tracking for session transcripts"

**Todo Reference:** 035-pending-p2

---

### US-009: Fix camelCase/snake_case type inconsistency
**Description:** As a developer, I want type-safe field access without `any` type assertions.

**Acceptance Criteria:**
- [ ] Update `src/types/index.ts`:
  - Change `Assignment` interface to use camelCase (matching API response)
  - Remove snake_case variants or create explicit mapping type
- [ ] Remove `getAssignmentField` helper from `src/components/counselor-dashboard.tsx`
- [ ] Update all field accesses to use consistent camelCase
- [ ] Remove `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments
- [ ] `npx tsc --noEmit` passes with zero `any` for assignments
- [ ] Commit: "types: standardize Assignment fields to camelCase"

**Todo Reference:** 036-pending-p2

---

### US-010: Add Zod validation for skills array
**Description:** As a system, I should reject invalid skill values at the API layer.

**Acceptance Criteria:**
- [ ] Create `SkillSchema` in `src/lib/validators.ts` using `VALID_SKILLS` from `src/lib/skills.ts`
- [ ] Add Zod validation to scenario create/update endpoints
- [ ] Invalid skills return 400 Bad Request with clear error message
- [ ] Valid skills pass through unchanged
- [ ] `npx tsc --noEmit` passes
- [ ] Commit: "validation: add Zod schema for skills array"

**Todo Reference:** 027-pending-p2

---

### US-011: Document migration script transaction pattern
**Description:** As a future developer, I should know that migration scripts need transaction wrapping.

**Acceptance Criteria:**
- [ ] Add comment block to `scripts/backfill-scenario-metadata.ts` explaining:
  - Why transactions are important for data migrations
  - How to wrap in `prisma.$transaction()` for production use
  - That this script already ran successfully
- [ ] Add same documentation to `scripts/migrate-skill-to-array.ts`
- [ ] Update `CLAUDE.md` with migration script best practices
- [ ] Commit: "docs: add transaction guidance to migration scripts"

**Todo Reference:** 026-pending-p2

---

## Functional Requirements

- FR-1: Single `buildAssignmentResponse` function in `src/lib/assignment-utils.ts`
- FR-2: Zero debug console.log statements in production code paths
- FR-3: Blob URLs revoked when recording playback window closes
- FR-4: Database indexes on all frequently-filtered foreign key columns
- FR-5: Counselors restricted to own dashboard; supervisors can view any
- FR-6: Database prevents duplicate active assignments via unique partial index
- FR-7: WebSocket validates assignment ownership before allowing connection
- FR-8: Transcript turns tagged with attempt number for clean evaluation
- FR-9: Assignment type uses consistent camelCase field naming
- FR-10: Skills array validated against VALID_SKILLS constant
- FR-11: Migration scripts documented with transaction best practices

## Non-Goals

- No implementation of full JWT/session authentication (future SWE task)
- No component refactoring of CounselorDashboard (P3, deferred)
- No new agent-native skills endpoints (P2, deferred as nice-to-have)
- No database CHECK constraint for skills (Zod validation sufficient for prototype)

## Technical Considerations

- All changes must pass `npx tsc --noEmit` and `npm run lint`
- Database migrations use Prisma migrate
- Partial unique index syntax is PostgreSQL-specific (confirmed database)
- WebSocket auth uses existing HTTP API for validation
- Auto-commit after each passing story

## Success Metrics

- Zero P1 issues remaining
- All P2 issues either fixed or explicitly documented as deferred
- `npx tsc --noEmit` returns zero errors
- `npm run lint` returns zero errors
- All 11 stories have passing acceptance criteria

## Execution Order

Execute in this order to manage dependencies:

1. **US-001** - Extract shared utility (foundational refactor)
2. **US-002** - Remove console.logs (quick win, no dependencies)
3. **US-003** - Fix blob URL leak (quick win, no dependencies)
4. **US-004** - Add database indexes (migration, no code deps)
5. **US-006** - Add unique assignment index (migration, depends on 004 pattern)
6. **US-008** - Add attempt tracking (migration, schema change)
7. **US-005** - Counselor selector security (depends on clean types)
8. **US-007** - WebSocket auth (depends on 005 pattern)
9. **US-009** - Fix type inconsistency (affects multiple files)
10. **US-010** - Add skills validation (depends on clean types)
11. **US-011** - Document migration scripts (documentation, do last)

## Open Questions

None - all implementation decisions confirmed:
- 1C: Read-only selector for non-supervisors
- 2A: Database unique partial index only
- 3C: Add attempt_number field to transcripts
- 4C: Auto-commit each fix as tests pass
