---
title: "PostgreSQL Migration for Skills Array Support"
date: 2026-01-25
severity: P2
category: database-issues
components:
  - prisma/schema.prisma
  - docker-compose.yml
  - src/lib/skills.ts
  - scripts/migrate-skill-to-array.ts
  - scripts/backfill-scenario-metadata.ts
symptoms:
  - "Cannot store multiple skills per scenario"
  - "skill field limited to single string value"
  - "SQLite lacks native array type support"
  - "Cannot query scenarios by skills array intersection"
root_causes:
  - "SQLite does not support array column types"
  - "Initial database choice didn't account for future skill modeling needs"
  - "Single skill field insufficient for training scenarios requiring multiple competencies"
commits:
  - "31b743e"
related:
  - "docs/solutions/prevention-strategies/bug-prevention-patterns.md"
---

## Summary

Migrated from SQLite to PostgreSQL to enable native array support for the `skills` field on scenarios. SQLite's lack of array types forced a single-skill-per-scenario model, which was insufficient for crisis counselor training scenarios that often require multiple competencies (e.g., both "risk-assessment" and "safety-planning").

## Problem

### Business Context

The Personalized Training Guide (PTG) integration needed scenarios to be tagged with multiple skills for proper skill-gap analysis and training recommendations. A suicide intervention scenario might train:
- `risk-assessment` (primary)
- `safety-planning` (secondary)
- `de-escalation` (tertiary)

### Technical Limitation

SQLite does not support array column types. The workaround options were:
1. **JSON string** - Store `["skill1", "skill2"]` as text (loses type safety, complex queries)
2. **Junction table** - Create `scenario_skills` many-to-many table (over-engineering for simple array)
3. **Delimited string** - Store `"skill1,skill2"` (parsing overhead, no indexing)
4. **Migrate to PostgreSQL** - Use native `String[]` type (clean, queryable, type-safe)

PostgreSQL was chosen because:
- Native array support with `String[]` type
- Array operators for efficient querying (`@>`, `&&`, `ANY`)
- Better alignment with production deployment (most production environments use PostgreSQL)
- Minimal migration effort with fresh development database

## Solution

### 1. Docker Compose Setup

Created `docker-compose.yml` for local PostgreSQL:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: proto-trainer-postgres
    ports:
      - "127.0.0.1:5432:5432"  # Localhost only for security
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-proto}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:-proto_trainer}
    command: >
      postgres
      -c listen_addresses='*'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proto -d proto_trainer"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Security notes:**
- Port bound to `127.0.0.1` only (not `0.0.0.0`)
- Password required via `${POSTGRES_PASSWORD:?...}` syntax (fails if not set)
- Uses Alpine image for smaller footprint

### 2. Schema Changes

Updated `prisma/schema.prisma`:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }

 model Scenario {
   // ... other fields
-  skill         String?   // Single skill
+  skill         String?   // DEPRECATED: Use skills array
+  skills        String[]  @default([])
 }
```

The `skill` field is retained for backwards compatibility with existing API consumers but marked deprecated.

### 3. Environment Variables

Updated `.env.example` with PostgreSQL configuration:

```env
# PostgreSQL (recommended - supports skills array)
POSTGRES_USER=proto
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_DB=proto_trainer
DATABASE_URL="postgresql://proto:your-secure-password-here@localhost:5432/proto_trainer"

# SQLite (legacy - comment out PostgreSQL and uncomment this)
# DATABASE_URL="file:./dev.db"
```

### 4. Migration Strategy

Chose **fresh start** approach rather than data migration:

1. **Backup SQLite** - `scripts/backup-sqlite.sh` creates timestamped backup
2. **Archive old migrations** - Moved to `prisma/migrations-sqlite-backup/`
3. **Fresh PostgreSQL migration** - Single consolidated `init` migration
4. **Re-seed data** - `npx prisma db seed`

This was appropriate because:
- Development database with test data only
- Seed script reproduces all necessary data
- Avoids complex SQLite-to-PostgreSQL data conversion

### 5. Skills Detection System

Created `src/lib/skills.ts` with deterministic skill detection:

```typescript
export const VALID_SKILLS = [
  'risk-assessment',
  'safety-planning',
  'de-escalation',
  'active-listening',
  'self-harm-assessment',
  'substance-assessment',
  'dv-assessment',
  'grief-support',
  'anxiety-support',
  'rapport-building',
  'call-routing',
  'medication-support',
  'resource-linkage',
  'boundary-setting',
  'termination',
] as const;

export type CrisisSkill = typeof VALID_SKILLS[number];

// Pattern matching for skill detection from scenario text
export const SKILL_PATTERNS: Record<CrisisSkill, RegExp[]> = {
  'risk-assessment': [/suicid/i, /\bSI\b/, /ideation/i, /lethality/i],
  'safety-planning': [/safety plan/i, /means safety/i, /secure.*firearm/i],
  // ... patterns for each skill
};

export function detectSkill(title: string, description: string | null): CrisisSkill {
  const text = `${title} ${description || ''}`;
  for (const [skill, patterns] of Object.entries(SKILL_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      return skill as CrisisSkill;
    }
  }
  return 'active-listening'; // default
}
```

### 6. Data Migration Scripts

**Backfill metadata** (`scripts/backfill-scenario-metadata.ts`):
```bash
npx ts-node scripts/backfill-scenario-metadata.ts
```
Populates `skill`, `difficulty`, and `estimatedTime` for scenarios missing this data.

**Migrate to array** (`scripts/migrate-skill-to-array.ts`):
```bash
npx ts-node scripts/migrate-skill-to-array.ts
```
Copies single `skill` values into the `skills[]` array.

## Setup Instructions

### First-Time Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env: Set POSTGRES_PASSWORD to a secure value

# 2. Start PostgreSQL
docker-compose up -d

# 3. Wait for healthy container
docker-compose ps  # Should show "healthy"

# 4. Create database schema
npx prisma migrate deploy

# 5. Seed test data
npx prisma db seed

# 6. Start development servers
npm run dev      # Next.js on :3003
npm run ws:dev   # WebSocket on :3004
```

### Troubleshooting

**Container won't start:**
```bash
# Check if password is set
grep POSTGRES_PASSWORD .env

# Check logs
docker-compose logs db
```

**Connection refused:**
```bash
# Verify container is running
docker ps | grep proto-trainer-postgres

# Check port binding
lsof -i :5432
```

**Migration fails:**
```bash
# Reset database (destroys data!)
docker-compose down -v
docker-compose up -d
npx prisma migrate deploy
npx prisma db seed
```

## API Changes

The external API now returns both fields for backwards compatibility:

```typescript
// GET /api/external/scenarios
{
  "id": "...",
  "title": "Suicide Risk Assessment",
  "skill": "risk-assessment",      // DEPRECATED - single value for legacy clients
  "skills": ["risk-assessment", "safety-planning"],  // NEW - full array
  // ... other fields
}
```

Consumers should migrate to using `skills` array. The `skill` field will be removed in a future version.

## Prevention Strategies

### 1. Choose Database Based on Data Requirements Early

Before starting a project, audit data modeling needs:
- Arrays? PostgreSQL, MySQL 8+, or document stores
- Full-text search? PostgreSQL with `tsvector` or dedicated search engine
- Geospatial? PostGIS or specialized database
- Simple key-value? SQLite may suffice

### 2. Document Database Limitations

Include a "Database Constraints" section in technical specs:
```markdown
## Database Constraints
- SQLite: No array types, limited concurrent writes
- PostgreSQL: Requires server process, more complex setup
```

### 3. Use Abstract Types in Application Layer

Define types that don't assume database capabilities:
```typescript
// Good - abstract from storage
interface Scenario {
  skills: string[];  // Application always sees array
}

// Storage adapter handles conversion
// SQLite: JSON.parse(skillsJson)
// PostgreSQL: Native array
```

### 4. Version Database Schema Early

Even for development, establish migration practices:
```bash
# Always use migrations, never manual SQL
npx prisma migrate dev --name add_skills_array
```

## Files Changed

| File | Description |
|------|-------------|
| `docker-compose.yml` | PostgreSQL container configuration |
| `prisma/schema.prisma` | Changed provider to `postgresql`, added `skills String[]` |
| `.env.example` | Added `POSTGRES_*` variables |
| `src/lib/skills.ts` | Skill detection logic and valid skills enum |
| `scripts/backfill-scenario-metadata.ts` | Populates missing skill/difficulty/time |
| `scripts/migrate-skill-to-array.ts` | Copies skill to skills array |
| `scripts/backup-sqlite.sh` | SQLite backup utility |
| `src/app/api/external/scenarios/route.ts` | Returns both `skill` and `skills` |

## Related Documentation

- [Bug Prevention Patterns](../prevention-strategies/bug-prevention-patterns.md) - General patterns for avoiding similar issues
