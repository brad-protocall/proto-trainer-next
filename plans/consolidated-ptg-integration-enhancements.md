# Consolidated Plan: PTG Integration Enhancements

## Overview

Enable intelligent scenario assignment for Personalized Training Guide (PTG) integration by:
1. Populating scenario metadata (skill, difficulty, estimatedTime)
2. Migrating to Postgres with skills array support
3. Maintaining API backwards compatibility

**Autonomous Execution:** This plan is designed for RALF overnight processing with verification gates.

---

## Pre-Flight Checks

Before starting, verify environment is ready:

```bash
# GATE 0: Environment verification
npm run build              # Must pass
npx tsc --noEmit           # Zero type errors
npm test                   # All tests pass (if any exist)
curl -s http://localhost:3003/api/external/scenarios -H "X-API-Key: ptg-dev-key-2026" | jq '.ok' # Returns true
```

**STOP if any pre-flight check fails.**

---

## Phase 1: Backfill Scenario Metadata

### 1.1 Create Skill Constants

Create minimal skill validation (no aliases, no API endpoint - deferred per review).

**File:** `src/lib/skills.ts`

```typescript
/**
 * Valid crisis counselor training skills.
 * Keep in sync with PTG assessment categories.
 *
 * NOTE: Alias matching and /api/external/skills endpoint deferred
 * until PTG integration reveals need. See plans/consolidated-*.md
 */
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

export function isValidSkill(skill: string): skill is CrisisSkill {
  return VALID_SKILLS.includes(skill as CrisisSkill);
}
```

**Verification:**
```bash
# File exists and exports correctly
npx ts-node -e "import { VALID_SKILLS, isValidSkill } from './src/lib/skills'; console.log(VALID_SKILLS.length, isValidSkill('risk-assessment'))"
# Expected: 15 true
```

### 1.2 Analyze Scenarios and Generate Metadata

Create analysis script that proposes metadata based on scenario content.

**File:** `scripts/analyze-scenarios.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { VALID_SKILLS, CrisisSkill } from '../src/lib/skills';

const prisma = new PrismaClient();

// Keyword patterns for skill detection
const SKILL_PATTERNS: Record<CrisisSkill, RegExp[]> = {
  'risk-assessment': [/suicid/i, /\bSI\b/, /ideation/i, /lethality/i, /kill/i, /end.*(life|it)/i],
  'safety-planning': [/safety plan/i, /means safety/i, /restrict/i, /secure.*firearm/i],
  'de-escalation': [/de-?escalat/i, /calm/i, /emotional regulation/i, /crisis intervention/i],
  'active-listening': [/listen/i, /rapport/i, /engagement/i, /routine.*support/i],
  'self-harm-assessment': [/cut/i, /self[- ]?harm/i, /self[- ]?injur/i, /NSSI/i],
  'substance-assessment': [/substance/i, /drug/i, /alcohol/i, /heroin/i, /detox/i, /drinking/i],
  'dv-assessment': [/domestic/i, /partner.*violen/i, /abuse/i, /IPV/i, /physical.*fight/i],
  'grief-support': [/grief/i, /loss/i, /death/i, /died/i, /bereave/i, /mourning/i],
  'anxiety-support': [/anxi/i, /panic/i, /breath/i, /overwhelm/i],
  'rapport-building': [/rapport/i, /trust/i, /engage/i],
  'call-routing': [/transfer/i, /rout/i, /referr/i, /triage/i],
  'medication-support': [/medica/i, /prescription/i, /Celexa/i, /Sertraline/i, /SSRI/i],
  'resource-linkage': [/resource/i, /community/i, /refer/i],
  'boundary-setting': [/boundar/i, /limit/i, /terminat/i],
  'termination': [/terminat/i, /end.*call/i, /closure/i],
};

// Difficulty inference from title/category
function inferDifficulty(title: string, category: string | null): 'beginner' | 'intermediate' | 'advanced' {
  const lowerTitle = title.toLowerCase();

  // Title-based inference
  if (lowerTitle.includes('routine') || lowerTitle.includes('non-clinical')) return 'beginner';
  if (lowerTitle.includes('emergent') || lowerTitle.includes('urgent')) return 'intermediate';
  if (lowerTitle.includes('complex') || lowerTitle.includes('multi')) return 'advanced';

  // Category-based inference
  if (category === 'onboarding') return 'beginner';
  if (category === 'advanced') return 'advanced';
  if (category === 'assessment') return 'advanced';

  return 'intermediate';
}

// Time inference based on complexity indicators
function inferTime(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase();

  if (text.includes('routine') || text.includes('non-clinical')) return 10;
  if (text.includes('safety plan') || text.includes('means safety')) return 25;
  if (text.includes('suicid') || text.includes('emergent')) return 20;
  if (text.includes('transfer') || text.includes('warm')) return 20;

  return 15; // default
}

// Detect skills from text
function detectSkills(title: string, description: string): CrisisSkill[] {
  const text = `${title} ${description}`;
  const detected: CrisisSkill[] = [];

  for (const [skill, patterns] of Object.entries(SKILL_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      detected.push(skill as CrisisSkill);
    }
  }

  // Default to active-listening if nothing detected
  if (detected.length === 0) {
    detected.push('active-listening');
  }

  return detected;
}

async function main() {
  const scenarios = await prisma.scenario.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      skill: true,
      difficulty: true,
      estimatedTime: true,
    },
    orderBy: { title: 'asc' },
  });

  console.log('// Generated scenario metadata - Review before applying');
  console.log('// Run: npx ts-node scripts/apply-scenario-metadata.ts');
  console.log('');
  console.log('export const scenarioMetadata = [');

  for (const s of scenarios) {
    const skills = detectSkills(s.title, s.description || '');
    const difficulty = inferDifficulty(s.title, s.category);
    const estimatedTime = inferTime(s.title, s.description || '');

    console.log(`  {`);
    console.log(`    id: '${s.id}',`);
    console.log(`    title: '${s.title.replace(/'/g, "\\'")}',`);
    console.log(`    // Current: skill=${s.skill}, difficulty=${s.difficulty}, time=${s.estimatedTime}`);
    console.log(`    skill: '${skills[0]}',  // Primary skill`);
    console.log(`    allSkills: ${JSON.stringify(skills)},  // For Phase 2 array migration`);
    console.log(`    difficulty: '${difficulty}',`);
    console.log(`    estimatedTime: ${estimatedTime},`);
    console.log(`  },`);
  }

  console.log('];');

  await prisma.$disconnect();
}

main().catch(console.error);
```

**Run and capture output:**
```bash
npx ts-node scripts/analyze-scenarios.ts > scripts/scenario-metadata-proposed.ts
```

### 1.3 Apply Metadata (After SME Review)

**File:** `scripts/apply-scenario-metadata.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { isValidSkill } from '../src/lib/skills';

const prisma = new PrismaClient();

// SME-reviewed metadata - copy from scenario-metadata-proposed.ts after review
// IMPORTANT: SME must review and approve before running this script
const scenarioMetadata: Array<{
  id: string;
  skill: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number;
}> = [
  // Paste reviewed metadata here
];

async function main() {
  if (scenarioMetadata.length === 0) {
    console.error('ERROR: scenarioMetadata is empty. Did you paste the SME-reviewed data?');
    process.exit(1);
  }

  console.log(`Applying metadata to ${scenarioMetadata.length} scenarios...`);

  let updated = 0;
  let errors = 0;

  for (const meta of scenarioMetadata) {
    // Validate skill
    if (!isValidSkill(meta.skill)) {
      console.error(`Invalid skill '${meta.skill}' for scenario ${meta.id}`);
      errors++;
      continue;
    }

    // Validate difficulty
    if (!['beginner', 'intermediate', 'advanced'].includes(meta.difficulty)) {
      console.error(`Invalid difficulty '${meta.difficulty}' for scenario ${meta.id}`);
      errors++;
      continue;
    }

    // Validate time
    if (meta.estimatedTime < 5 || meta.estimatedTime > 60) {
      console.error(`Invalid estimatedTime ${meta.estimatedTime} for scenario ${meta.id}`);
      errors++;
      continue;
    }

    try {
      await prisma.scenario.update({
        where: { id: meta.id },
        data: {
          skill: meta.skill,
          difficulty: meta.difficulty,
          estimatedTime: meta.estimatedTime,
        },
      });
      updated++;
    } catch (e) {
      console.error(`Failed to update ${meta.id}:`, e);
      errors++;
    }
  }

  console.log(`\nResults: ${updated} updated, ${errors} errors`);

  if (errors > 0) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
```

### 1.4 Verification Test

**File:** `src/__tests__/scenario-metadata.test.ts`

```typescript
import { prisma } from '@/lib/prisma';
import { isValidSkill, VALID_SKILLS } from '@/lib/skills';

describe('Scenario Metadata', () => {
  it('all scenarios have valid skill values', async () => {
    const scenarios = await prisma.scenario.findMany({
      select: { id: true, title: true, skill: true },
    });

    const invalid = scenarios.filter(s => s.skill && !isValidSkill(s.skill));

    expect(invalid).toEqual([]);
  });

  it('all scenarios have valid difficulty values', async () => {
    const scenarios = await prisma.scenario.findMany({
      select: { id: true, title: true, difficulty: true },
    });

    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    const invalid = scenarios.filter(s => s.difficulty && !validDifficulties.includes(s.difficulty));

    expect(invalid).toEqual([]);
  });

  it('all scenarios have reasonable estimatedTime', async () => {
    const scenarios = await prisma.scenario.findMany({
      select: { id: true, title: true, estimatedTime: true },
    });

    const invalid = scenarios.filter(s =>
      s.estimatedTime !== null && (s.estimatedTime < 5 || s.estimatedTime > 60)
    );

    expect(invalid).toEqual([]);
  });

  it('external API returns populated metadata', async () => {
    const scenarios = await prisma.scenario.findMany({
      where: { isOneTime: false },
      select: { skill: true, difficulty: true, estimatedTime: true },
    });

    // After backfill, all should have values
    const unpopulated = scenarios.filter(s =>
      s.skill === null || s.difficulty === null || s.estimatedTime === null
    );

    // This will fail until backfill is complete - that's intentional
    expect(unpopulated.length).toBe(0);
  });
});
```

### Phase 1 Gate

```bash
# GATE 1: Metadata backfill verification
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const total = await p.scenario.count();
  const populated = await p.scenario.count({
    where: {
      skill: { not: null },
      difficulty: { not: null },
      estimatedTime: { not: null }
    }
  });
  console.log('Total:', total, 'Populated:', populated);
  if (populated < total) {
    console.error('FAIL: Not all scenarios have metadata');
    process.exit(1);
  }
  console.log('PASS: All scenarios have metadata');
  await p.\$disconnect();
})();
"
```

---

## Phase 2: Postgres Migration + Skills Array

### 2.1 Setup Docker Postgres

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: proto-trainer-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: proto
      POSTGRES_PASSWORD: proto_dev_2026
      POSTGRES_DB: proto_trainer
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

**Start and verify:**
```bash
docker-compose up -d
sleep 5
docker-compose ps  # Should show healthy
```

### 2.2 Backup SQLite Data

```bash
# CRITICAL: Backup before any migration
cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d-%H%M%S)

# Export row counts for verification
sqlite3 prisma/dev.db "
SELECT 'scenarios' as tbl, COUNT(*) as cnt FROM scenarios
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'evaluations', COUNT(*) FROM evaluations;
" > /tmp/sqlite-counts.txt

cat /tmp/sqlite-counts.txt
```

### 2.3 Update Schema for Postgres + Skills Array

**File:** `prisma/schema.prisma` (changes)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Scenario {
  // ... existing fields ...

  // CHANGED: skill -> skills array
  // Keep 'skill' temporarily for backwards compatibility (deprecated)
  skill              String?   // DEPRECATED: Use skills array. Remove after PTG migration.
  skills             String[]  @default([])  // Primary storage for skills
  difficulty         String?   @default("intermediate")
  estimatedTime      Int?      @default(15) @map("estimated_time")

  // ... rest of model ...
}
```

### 2.4 Environment Update

**File:** `.env` (update)

```env
# Database - switch to Postgres
# DATABASE_URL="file:./dev.db"  # SQLite (commented out)
DATABASE_URL="postgresql://proto:proto_dev_2026@localhost:5432/proto_trainer"
```

### 2.5 Migration Script

**File:** `scripts/migrate-to-postgres.ts`

```typescript
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

async function main() {
  console.log('=== Proto Trainer: SQLite to Postgres Migration ===\n');

  // Step 1: Generate migration
  console.log('Step 1: Generating Prisma migration...');
  try {
    execSync('npx prisma migrate dev --name postgres_skills_array --create-only', {
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Migration generation failed');
    process.exit(1);
  }

  // Step 2: Apply migration
  console.log('\nStep 2: Applying migration...');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  } catch (e) {
    console.error('Migration deploy failed');
    process.exit(1);
  }

  // Step 3: Seed data (will re-create from SQLite export)
  console.log('\nStep 3: Seeding database...');
  try {
    execSync('npx prisma db seed', { stdio: 'inherit' });
  } catch (e) {
    console.error('Seeding failed');
    process.exit(1);
  }

  // Step 4: Migrate skill -> skills array
  console.log('\nStep 4: Migrating skill to skills array...');
  const prisma = new PrismaClient();

  const scenarios = await prisma.scenario.findMany({
    select: { id: true, skill: true },
  });

  for (const s of scenarios) {
    if (s.skill) {
      await prisma.scenario.update({
        where: { id: s.id },
        data: { skills: [s.skill] },
      });
    }
  }

  console.log(`Migrated ${scenarios.length} scenarios to skills array`);

  await prisma.$disconnect();

  console.log('\n=== Migration Complete ===');
}

main().catch(console.error);
```

### 2.6 Update External API (Backwards Compatible)

**File:** `src/app/api/external/scenarios/route.ts` (update mapping)

```typescript
// Map to external format - backwards compatible
const externalScenarios = scenarios.map((s) => ({
  id: s.id,
  name: s.title,
  description: s.description ?? '',
  mode: s.mode as 'phone' | 'chat',
  category: s.category ?? 'general',

  // DEPRECATED: Use 'skills' array instead. Will be removed in v2.
  skill: s.skills[0] ?? s.skill ?? 'general',

  // NEW: Skills array (preferred)
  skills: s.skills.length > 0 ? s.skills : [s.skill ?? 'general'],

  difficulty: (s.difficulty ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
  estimatedTime: s.estimatedTime ?? 15,
}))
```

### 2.7 Update Types

**File:** `src/types/index.ts` (add)

```typescript
export interface ExternalScenario {
  id: string;
  name: string;
  description: string;
  mode: 'phone' | 'chat';
  category: string;
  /** @deprecated Use skills array instead */
  skill: string;
  skills: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number;
}
```

### 2.8 Verification Tests

**File:** `src/__tests__/postgres-migration.test.ts`

```typescript
import { prisma } from '@/lib/prisma';

describe('Postgres Migration', () => {
  it('database is Postgres', async () => {
    const result = await prisma.$queryRaw<[{version: string}]>`SELECT version()`;
    expect(result[0].version).toContain('PostgreSQL');
  });

  it('scenarios have skills array', async () => {
    const scenarios = await prisma.scenario.findMany({
      select: { id: true, skills: true },
    });

    // All scenarios should have skills array (may be empty)
    for (const s of scenarios) {
      expect(Array.isArray(s.skills)).toBe(true);
    }
  });

  it('skills array contains valid skills', async () => {
    const { VALID_SKILLS } = await import('@/lib/skills');

    const scenarios = await prisma.scenario.findMany({
      select: { id: true, skills: true },
    });

    for (const s of scenarios) {
      for (const skill of s.skills) {
        expect(VALID_SKILLS).toContain(skill);
      }
    }
  });

  it('row counts match pre-migration', async () => {
    // These counts should match /tmp/sqlite-counts.txt
    const counts = {
      scenarios: await prisma.scenario.count(),
      users: await prisma.user.count(),
      accounts: await prisma.account.count(),
      assignments: await prisma.assignment.count(),
    };

    // Verify against expected counts (update after SQLite export)
    expect(counts.scenarios).toBeGreaterThanOrEqual(42);
    expect(counts.users).toBeGreaterThanOrEqual(6);
    expect(counts.accounts).toBeGreaterThanOrEqual(2);
  });

  it('external API returns both skill and skills', async () => {
    const response = await fetch('http://localhost:3003/api/external/scenarios', {
      headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY || 'ptg-dev-key-2026' },
    });

    const data = await response.json();
    expect(data.ok).toBe(true);

    const scenario = data.data.scenarios[0];
    expect(scenario).toHaveProperty('skill');      // Deprecated but present
    expect(scenario).toHaveProperty('skills');     // New array
    expect(Array.isArray(scenario.skills)).toBe(true);
  });
});
```

### Phase 2 Gate

```bash
# GATE 2: Postgres migration verification
echo "Checking Postgres connection..."
npx prisma db execute --stdin <<< "SELECT 1" || exit 1

echo "Checking row counts..."
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const counts = {
    scenarios: await p.scenario.count(),
    users: await p.user.count(),
    accounts: await p.account.count(),
  };
  console.log('Counts:', counts);
  if (counts.scenarios < 42) {
    console.error('FAIL: Expected at least 42 scenarios');
    process.exit(1);
  }
  console.log('PASS: Row counts verified');
  await p.\$disconnect();
})();
"

echo "Checking external API..."
curl -s http://localhost:3003/api/external/scenarios -H "X-API-Key: ptg-dev-key-2026" | \
  jq -e '.data.scenarios[0] | has("skill") and has("skills")' || exit 1

echo "GATE 2 PASSED"
```

---

## Phase 3: Final Verification & Cleanup

### 3.1 Full Test Suite

```bash
npm test
npx tsc --noEmit
npm run lint
```

### 3.2 API Contract Verification

**File:** `scripts/verify-api-contract.ts`

```typescript
import { z } from 'zod';

const ExternalScenarioSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  mode: z.enum(['phone', 'chat']),
  category: z.string(),
  skill: z.string(),  // Deprecated
  skills: z.array(z.string()),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  estimatedTime: z.number().int().min(5).max(60),
});

const ExternalScenariosResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    scenarios: z.array(ExternalScenarioSchema),
  }),
});

async function main() {
  const response = await fetch('http://localhost:3003/api/external/scenarios', {
    headers: { 'X-API-Key': 'ptg-dev-key-2026' },
  });

  const json = await response.json();

  const result = ExternalScenariosResponseSchema.safeParse(json);

  if (!result.success) {
    console.error('API contract violation:');
    console.error(result.error.format());
    process.exit(1);
  }

  console.log(`API contract verified: ${result.data.data.scenarios.length} scenarios`);
  console.log('Sample scenario:', JSON.stringify(result.data.data.scenarios[0], null, 2));
}

main().catch(console.error);
```

### 3.3 Update Documentation

**File:** `CLAUDE.md` (append to Resume Context section)

```markdown
## Resume Context (Post PTG Integration Enhancement)

### Completed Work

1. **Scenario Metadata Backfill** ✅
   - All 42 scenarios have skill, difficulty, estimatedTime populated
   - Skills validated against VALID_SKILLS in src/lib/skills.ts

2. **Postgres Migration** ✅
   - Migrated from SQLite to Postgres (Docker)
   - Start with: `docker-compose up -d`
   - Connection: postgresql://proto:proto_dev_2026@localhost:5432/proto_trainer

3. **Skills Array** ✅
   - Schema: `skills String[]` (Postgres native array)
   - API returns both `skill` (deprecated) and `skills` (array) for backwards compatibility

### External API Response Shape (v1.1)

```json
{
  "id": "uuid",
  "name": "Scenario Title",
  "description": "...",
  "mode": "phone",
  "category": "cohort_training",
  "skill": "risk-assessment",     // DEPRECATED
  "skills": ["risk-assessment", "safety-planning"],  // USE THIS
  "difficulty": "intermediate",
  "estimatedTime": 20
}
```

### Deferred Work

- **Skill Taxonomy API**: `/api/external/skills` endpoint - build when PTG requests
- **Evaluation Criteria API**: `/api/external/scenarios/[id]/evaluation-context` - build when PTG needs pre-brief content

### Quick Start

```bash
docker-compose up -d     # Start Postgres
npm run dev              # Next.js on :3003
npm run ws:dev           # WebSocket on :3004
```
```

---

## Execution Checklist (RALF)

### Autonomous Steps

- [ ] Create `src/lib/skills.ts` with VALID_SKILLS
- [ ] Create `scripts/analyze-scenarios.ts`
- [ ] Run analysis: `npx ts-node scripts/analyze-scenarios.ts > scripts/scenario-metadata-proposed.ts`
- [ ] **STOP FOR SME REVIEW** - Cannot proceed without human approval of metadata
- [ ] Create `scripts/apply-scenario-metadata.ts` with SME-approved data
- [ ] Run: `npx ts-node scripts/apply-scenario-metadata.ts`
- [ ] **GATE 1**: Verify all scenarios have metadata
- [ ] Create `docker-compose.yml`
- [ ] Start Postgres: `docker-compose up -d`
- [ ] Backup SQLite: `cp prisma/dev.db prisma/dev.db.backup-*`
- [ ] Update `.env` with Postgres URL
- [ ] Update `prisma/schema.prisma` for Postgres + skills array
- [ ] Run migration: `npx prisma migrate dev --name postgres_skills_array`
- [ ] Run seed: `npx prisma db seed`
- [ ] Migrate skill -> skills: `npx ts-node scripts/migrate-to-postgres.ts`
- [ ] Update external API route for backwards compatibility
- [ ] **GATE 2**: Verify Postgres migration
- [ ] Create/run verification tests
- [ ] Update CLAUDE.md
- [ ] **GATE 3**: Full test suite passes
- [ ] Commit all changes

### Human Checkpoints

1. **SME Review** (after analyze-scenarios.ts output): Review proposed skill/difficulty/time values
2. **Final Review**: Verify API contract works with PTG

---

## Rollback Procedures

### Rollback Phase 1 (Metadata)

```bash
# Revert to NULL values
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  await p.scenario.updateMany({
    data: { skill: null, difficulty: null, estimatedTime: null }
  });
  console.log('Reverted metadata to NULL');
  await p.\$disconnect();
})();
"
```

### Rollback Phase 2 (Postgres)

```bash
# Stop Postgres
docker-compose down

# Restore SQLite
cp prisma/dev.db.backup-* prisma/dev.db

# Revert schema
git checkout prisma/schema.prisma

# Update .env back to SQLite
# DATABASE_URL="file:./dev.db"

# Regenerate Prisma client
npx prisma generate
```

---

## Success Criteria

1. ✅ All scenarios have skill, difficulty, estimatedTime populated
2. ✅ Skills are validated against VALID_SKILLS
3. ✅ Database is Postgres with native array support
4. ✅ External API returns both `skill` and `skills` (backwards compatible)
5. ✅ All tests pass
6. ✅ PTG can consume the enhanced API
