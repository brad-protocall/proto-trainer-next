---
status: pending
priority: p2
issue_id: "027"
tags: [code-review, data-integrity, validation]
dependencies: []
---

# No Validation That skills[] Contains Only VALID_SKILLS

## Problem Statement

The database schema allows any string in the `skills` array. There's no constraint ensuring values match the `VALID_SKILLS` constant in `src/lib/skills.ts`.

**Why it matters**: Invalid skills can be inserted via raw SQL or external integrations, causing API consumers to receive garbage data.

## Findings

**Location**: 
- `prisma/schema.prisma` - no constraint on skills column
- `src/lib/skills.ts:5-21` - VALID_SKILLS constant (not enforced)

**Current schema** (no validation):
```prisma
skills String[] @default([])  // Accepts any strings
```

**Example of constraint violation**:
```sql
UPDATE scenarios SET skills = ARRAY['invalid-skill-999'];
-- Succeeds despite being invalid
```

## Proposed Solutions

### Option A: Database CHECK constraint (Recommended)
**Pros**: Enforced at database level, can't be bypassed
**Cons**: Requires raw SQL migration
**Effort**: Small (20 min)
**Risk**: Low

```sql
ALTER TABLE scenarios 
ADD CONSTRAINT valid_skills CHECK (
  skills <@ ARRAY['risk-assessment', 'safety-planning', ...]::text[]
);
```

### Option B: API-level Zod validation
**Pros**: TypeScript-native, good error messages
**Cons**: Can be bypassed via direct DB access
**Effort**: Small (15 min)
**Risk**: Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `prisma/schema.prisma` (add constraint)
- `src/lib/validators.ts` (add Zod schema)

## Acceptance Criteria

- [ ] Invalid skills rejected at database level
- [ ] Clear error message when validation fails
- [ ] VALID_SKILLS is single source of truth

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Data integrity guardian flagged |

## Resources

- PR: commit 31b743e
- VALID_SKILLS: src/lib/skills.ts:5-21
