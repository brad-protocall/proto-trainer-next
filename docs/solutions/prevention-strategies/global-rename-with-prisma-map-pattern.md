---
title: "Global Rename with Prisma @map: Zero-Migration Field Renames + Types-First Strategy"
date: 2026-02-13
category: prevention-strategies
tags:
  - prisma
  - refactoring
  - type-safety
  - database-schema
  - domain-vs-role
  - types-first
  - zero-migration-renames
  - api-contracts
severity: low
component:
  - prisma-orm
  - type-system
  - api-contracts
  - routing
resolution_time: "6 hours (45 files across 6 steps)"
related_issues:
  - "PR #49: counselor → learner rename"
  - "Plan: docs/plans/2026-02-13-refactor-counselor-to-learner-rename-plan.md"
symptoms:
  - External API consumer (PPTA) expects learnerId but codebase exposes counselorId
  - Term "counselor" conflates profession (crisis counselor) with user role (trainee)
root_cause:
  - Legacy naming from earlier prototype conflated domain terms with user role naming
---

# Global Rename with Prisma @map: The Counselor → Learner Case Study

Documented from PR #49 (45 files, 6 implementation steps, 4-agent plan review + 4-agent code review). Use this as a reference for any future global rename or large-scale refactor.

## Problem

The codebase used "counselor" for two different meanings:
1. **Domain** — crisis counselors (the profession being trained for)
2. **User role** — the person using the app to train

External API consumers (PPTA) already expected `learnerId`/`learnerName`. The rename needed to touch 45 files across database schema, types, validators, 22 API routes, 11 components, configuration, and seed data — without breaking domain references or requiring a database column rename.

## Key Pattern 1: Prisma @map for Zero-Migration Renames

`@map("old_column_name")` lets you rename a TypeScript field without touching the database column. Only a data migration is needed for enum values.

```prisma
model Assignment {
  learnerId  String @map("counselor_id")  # DB column stays counselor_id
  learner    User   @relation("LearnerAssignments", fields: [learnerId], references: [id])
  @@index([learnerId])
}
```

**Data migration (the only SQL needed):**
```sql
UPDATE "users" SET "role" = 'learner' WHERE "role" = 'counselor';
```

**When to use @map vs column rename:**

| Scenario | Use @map | Use column rename |
|----------|----------|-------------------|
| Field branding change, column stable | Yes | No |
| Multiple DB engines (SQLite + Postgres) | Yes (avoids migration risk) | Risky |
| External systems query DB directly | No (column name matters) | Yes |
| Fresh project, no production data | Either works | Cleaner long-term |

## Key Pattern 2: Types-First Refactoring

Update type definitions first. The TypeScript compiler then surfaces every downstream reference.

**Sequence:**
1. `src/types/index.ts` — rename interfaces and type aliases
2. `src/lib/validators.ts` — rename Zod schemas (single source of truth)
3. `npx tsc --noEmit` — compiler shows 40+ errors, each one a file to update
4. Fix errors in order: lib utilities → API routes → components → config
5. Verify: 0 tsc errors, 0 lint errors, 0 old references via grep

**Why this works:** The compiler becomes your rename checklist. No orphaned references possible if you fix every error before committing.

```typescript
// Step 1: Update types (breaks everything downstream)
export type UserRole = "learner" | "supervisor";  // was "counselor"
export interface Assignment {
  learnerId: string;      // was counselorId
  learnerName?: string;   // was counselorName
}

// Step 2: Update validators (single source of truth)
const UserRoleSchema = z.enum(['supervisor', 'learner'])  // was 'counselor'
export const createAssignmentSchema = z.object({
  learnerId: z.string().uuid(),  // was counselorId
})
```

## Key Pattern 3: Domain vs Role Distinction

**Rule:** If it describes the profession being trained for, keep it. If it describes the user's role in the system, rename it.

| Context | Example | Renamed? |
|---------|---------|----------|
| User role enum | `role = 'learner'` | Yes |
| Dashboard route | `/learner` | Yes |
| FK field name | `learnerId` | Yes |
| AI prompt | "crisis counselor's performance" | No |
| Transcript label | "Counselor" / "Caller" | No |
| Scenario description | "counseling techniques" | No |
| Seed externalId | `test-counselor-001` | No (opaque ID) |

## Key Pattern 4: Route Redirects

One-line Next.js config prevents 404s for old bookmarks:

```typescript
// next.config.ts
async redirects() {
  return [{
    source: '/counselor',
    destination: '/learner',
    permanent: true  // 301
  }]
}
```

## Pre-Refactor Checklist

Before starting any large rename:

- [ ] Scope the change: `grep -r "oldName" src/ --include="*.ts" --include="*.tsx" | wc -l`
- [ ] Identify domain vs role references (which stay, which change)
- [ ] Check external API consumers — do they already expect new names?
- [ ] Check LiveKit agent metadata for hardcoded role values
- [ ] Check seed data for external IDs that should NOT change
- [ ] Create feature branch and plan document
- [ ] Prepare rollback SQL: `UPDATE "users" SET "role" = 'counselor' WHERE "role" = 'learner'`

## Execution Steps (6-Phase Approach)

| Phase | Time | What | Verification |
|-------|------|------|-------------|
| 1 | 30m | Prisma schema + data migration (Pattern #13) | `npx prisma generate` |
| 2 | 45m | Types + validators (types-first) | `npx tsc --noEmit` shows expected errors |
| 3 | 30m | Lib utilities (auth, constants, helpers) | `npx tsc --noEmit` error count decreasing |
| 4 | 90m | API routes (~22 files) | `npx tsc --noEmit` → 0 errors |
| 5 | 60m | Components + directory rename + redirect | `npm run lint` → 0 errors |
| 6 | 30m | Seed data + docs + final verification | All 3 checks pass (see below) |

## Verification (Run After Every Phase)

```bash
# 1. Type check
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Grep for orphaned references (should return 0 results)
grep -r "counselorId" src/ --include="*.ts" --include="*.tsx"
grep -r '"counselor"' src/lib/validators.ts

# 4. Domain references still present (should return results)
grep -r "crisis counselor" src/  # AI prompts preserved
```

## Common Mistakes

| Mistake | Why It's Bad | Prevention |
|---------|-------------|------------|
| Renaming domain references | "crisis learner" makes no sense | Apply domain-vs-role rule |
| Skipping types-first | Orphaned references, runtime errors | Always update types/validators BEFORE implementation |
| Forgetting `npx prisma generate` | Prisma client doesn't know about @map | Add to checklist after schema changes |
| Not restarting dev server | Hot-reload misses Prisma structural changes (Pattern #6) | Restart after schema + generate |
| Renaming seed externalIds | Breaks external system integrations | External IDs are opaque — don't touch |
| Skipping 301 redirect | Old bookmarks/links get 404 | One line in next.config.ts |

## Rollback Plan

If issues are discovered post-deploy:

```bash
# 1. Revert the data migration
psql -d proto_trainer -c "UPDATE \"users\" SET \"role\" = 'counselor' WHERE \"role\" = 'learner';"

# 2. Revert the code
git revert <merge-commit-hash>

# 3. Regenerate Prisma client and rebuild
npx prisma generate && npm run build

# 4. Restart service
sudo systemctl restart proto-trainer-next
```

## Related Documentation

- `docs/plans/2026-02-13-refactor-counselor-to-learner-rename-plan.md` — Original plan
- `docs/solutions/prevention-strategies/bug-prevention-patterns.md` — Pattern #13 (Prisma shadow DB workaround)
- `docs/solutions/integration-issues/api-frontend-contract-mismatch-bulk-assignments.md` — API contract rules
- `docs/solutions/database-issues/postgresql-migration-skills-array-2026-01-25.md` — Prisma @map precedent

## CLAUDE.md Pattern (Add as Pattern #14)

```
#### 14. Global Rename via Prisma @map + Types-First

**Problem**: Need to rename a concept across 40+ files without DB column migration.

**Prevention**: Use Prisma `@map("old_column")` to keep DB stable. Update types/validators
first, let compiler surface all references. Distinguish domain terms (keep) from role terms (rename).

See `docs/solutions/prevention-strategies/global-rename-with-prisma-map-pattern.md` for full playbook.
```
