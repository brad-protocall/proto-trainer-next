---
title: Missing Users on Pi - Seed File Not Re-Run After Updates
category: database-issues
component: prisma-seed
symptoms:
  - PTG learners not available in Proto Trainer Next counselor dashboard
  - Voice sessions fail with P2003 foreign key constraint on sessions_user_id_fkey
  - Seed file contains users that don't exist in Pi database
root_cause: Seed script updated with new users on dev machine but never re-executed on Pi after deployment
date_solved: 2026-02-06
severity: medium
tags:
  - prisma
  - seeding
  - deployment
  - user-provisioning
  - pi-deployment
  - ptg-integration
related:
  - docs/solutions/integration-issues/external-api-ptg-integration-2026-01-22.md
  - docs/solutions/database-issues/postgresql-migration-skills-array-2026-01-25.md
---

# Missing Users on Pi - Seed Drift

## Problem

Users from the Personalized Training Guide (PTG) existed in the seed file but not in the Pi's PostgreSQL database. This caused voice sessions to fail with foreign key constraint errors.

## Symptoms

- PTG users (Brad Pendergraft, John Patterson, Sarah Martinez, Tom Wilson, Phil Evans) visible in PTG but not in Proto Trainer Next
- Voice sessions potentially failing with `P2003: Foreign key constraint violated on sessions_user_id_fkey`
- `SELECT display_name FROM users` on Pi shows fewer users than expected

## Root Cause

The `prisma/seed.ts` file was updated to include PTG learners, but:
1. `npx prisma db seed` was never re-run on Pi after the update
2. The rsync deployment process doesn't include a seed step
3. One user (Brad Pendergraft) wasn't in the seed file at all

## Solution

### Quick fix: Direct SQL (for immediate needs)

```bash
ssh brad@pai-hub.local "sudo -u postgres psql -d proto_trainer -c \"
INSERT INTO users (id, external_id, display_name, role, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'brad-pendergraft', 'Brad Pendergraft', 'counselor', NOW(), NOW()),
  (gen_random_uuid(), 'john-patterson', 'John Patterson', 'counselor', NOW(), NOW()),
  (gen_random_uuid(), 'sarah-martinez', 'Sarah Martinez', 'counselor', NOW(), NOW()),
  (gen_random_uuid(), 'tom-wilson', 'Tom Wilson', 'counselor', NOW(), NOW()),
  (gen_random_uuid(), 'phil-evans', 'Phil Evans', 'counselor', NOW(), NOW())
ON CONFLICT (external_id) DO NOTHING;
\""
```

### Proper fix: Update seed + re-run

1. Add missing users to `prisma/seed.ts` (ptgLearners array)
2. Re-run seed on Pi: `ssh brad@pai-hub.local 'cd ~/apps/proto-trainer-next && npx prisma db seed'`

### Verify

```bash
ssh brad@pai-hub.local "sudo -u postgres psql -d proto_trainer -c \"SELECT display_name, role FROM users ORDER BY display_name;\""
```

## Key Pattern

Seed files use `upsert` (safe to re-run) but they don't run automatically. When adding users to seed.ts, you must also apply them to Pi. Two paths:

| Method | When to Use |
|--------|------------|
| Direct SQL INSERT | 1-2 users, need them NOW |
| Re-run seed on Pi | Bulk updates, keeping seed as source of truth |

## Prevention

- After modifying `prisma/seed.ts`, add "re-seed on Pi" to your deployment checklist
- The external API's `getOrCreateExternalUser()` auto-provisions users when assignments are created via API, but users must already exist for direct counselor dashboard access
- `ON CONFLICT DO NOTHING` / `upsert` makes both approaches idempotent (safe to repeat)
