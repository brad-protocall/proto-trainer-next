# PTG Integration Enhancements - Autonomous Plan

**Status:** Ready for Ralph Loop (`auto:ready`)
**Priority:** High
**Created:** 2026-01-25
**Estimated Tasks:** 8 atomic tasks

---

## Summary

Enable intelligent scenario assignment for Personalized Training Guide (PTG) by:
1. Populating scenario metadata (skill, difficulty, estimatedTime) using deterministic rules
2. Migrating to Postgres with skills array support
3. Maintaining API backwards compatibility

**Fully autonomous** - No human checkpoints. All verification via automated tests.

---

## Task 1: Create Skill Constants and Validation

**Files to create:** `src/lib/skills.ts`
**Files to modify:** `src/lib/validators.ts`

**Implementation:**

```typescript
// src/lib/skills.ts
/**
 * Valid crisis counselor training skills.
 * Single source of truth for skill validation.
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

// Keyword patterns for skill detection from scenario text
export const SKILL_PATTERNS: Record<CrisisSkill, RegExp[]> = {
  'risk-assessment': [/suicid/i, /\bSI\b/, /ideation/i, /lethality/i, /kill/i, /end.*(life|it)/i],
  'safety-planning': [/safety plan/i, /means safety/i, /restrict/i, /secure.*firearm/i, /locked/i],
  'de-escalation': [/de-?escalat/i, /calm/i, /emotional regulation/i, /crisis intervention/i],
  'active-listening': [/listen/i, /rapport/i, /engagement/i, /routine.*support/i],
  'self-harm-assessment': [/cut/i, /self[- ]?harm/i, /self[- ]?injur/i, /NSSI/i, /bleeding/i],
  'substance-assessment': [/substance/i, /drug/i, /alcohol/i, /heroin/i, /detox/i, /drinking/i],
  'dv-assessment': [/domestic/i, /partner.*violen/i, /abuse/i, /IPV/i, /physical.*fight/i],
  'grief-support': [/grief/i, /loss/i, /death/i, /died/i, /bereave/i, /mourning/i, /spouse/i],
  'anxiety-support': [/anxi/i, /panic/i, /breath/i, /overwhelm/i],
  'rapport-building': [/rapport/i, /trust/i, /engage/i],
  'call-routing': [/transfer/i, /rout/i, /referr/i, /triage/i, /front desk/i],
  'medication-support': [/medica/i, /prescription/i, /Celexa/i, /Sertraline/i, /SSRI/i, /refill/i],
  'resource-linkage': [/resource/i, /community/i, /refer/i],
  'boundary-setting': [/boundar/i, /limit/i],
  'termination': [/terminat/i, /end.*call/i, /closure/i],
};

/**
 * Detect primary skill from scenario title and description.
 * Returns first matching skill or 'active-listening' as default.
 */
export function detectSkill(title: string, description: string | null): CrisisSkill {
  const text = `${title} ${description || ''}`;

  for (const [skill, patterns] of Object.entries(SKILL_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      return skill as CrisisSkill;
    }
  }

  return 'active-listening'; // default
}

/**
 * Infer difficulty from scenario title and category.
 */
export function inferDifficulty(
  title: string,
  category: string | null
): 'beginner' | 'intermediate' | 'advanced' {
  const lowerTitle = title.toLowerCase();

  // Title-based inference (takes precedence)
  if (lowerTitle.includes('routine') || lowerTitle.includes('non-clinical')) return 'beginner';
  if (lowerTitle.includes('emergent')) return 'intermediate';
  if (lowerTitle.includes('urgent')) return 'intermediate';

  // Category-based inference
  if (category === 'onboarding') return 'beginner';
  if (category === 'advanced' || category === 'assessment') return 'advanced';

  return 'intermediate'; // default
}

/**
 * Estimate completion time based on scenario complexity.
 */
export function estimateTime(title: string, description: string | null): number {
  const text = `${title} ${description || ''}`.toLowerCase();

  if (text.includes('routine') || text.includes('non-clinical')) return 10;
  if (text.includes('safety plan') || text.includes('means safety')) return 25;
  if (text.includes('suicid') || text.includes('emergent')) return 20;
  if (text.includes('transfer') || text.includes('warm')) return 20;

  return 15; // default
}
```

**Verification:**
```bash
# Type check
npx tsc --noEmit

# Verify exports work
npx ts-node -e "
const { VALID_SKILLS, isValidSkill, detectSkill, inferDifficulty, estimateTime } = require('./src/lib/skills');
console.log('Skills count:', VALID_SKILLS.length);
console.log('isValidSkill test:', isValidSkill('risk-assessment'));
console.log('detectSkill test:', detectSkill('Suicidal Ideation Call', 'Caller expressing thoughts of suicide'));
console.log('inferDifficulty test:', inferDifficulty('Routine Support', 'onboarding'));
console.log('estimateTime test:', estimateTime('Safety Planning', 'Create safety plan'));
"
# Expected: 15, true, 'risk-assessment', 'beginner', 25
```

**Test file:** `src/__tests__/skills.test.ts`
```typescript
import { VALID_SKILLS, isValidSkill, detectSkill, inferDifficulty, estimateTime } from '@/lib/skills';

describe('skills', () => {
  describe('isValidSkill', () => {
    it('returns true for valid skills', () => {
      expect(isValidSkill('risk-assessment')).toBe(true);
      expect(isValidSkill('de-escalation')).toBe(true);
    });

    it('returns false for invalid skills', () => {
      expect(isValidSkill('invalid')).toBe(false);
      expect(isValidSkill('')).toBe(false);
    });
  });

  describe('detectSkill', () => {
    it('detects risk-assessment from suicide keywords', () => {
      expect(detectSkill('Suicidal Ideation Call', 'expressing SI')).toBe('risk-assessment');
    });

    it('detects substance-assessment from drug keywords', () => {
      expect(detectSkill('Heroin Use', 'needs detox')).toBe('substance-assessment');
    });

    it('defaults to active-listening', () => {
      expect(detectSkill('General Support', 'caller needs help')).toBe('active-listening');
    });
  });

  describe('inferDifficulty', () => {
    it('returns beginner for routine', () => {
      expect(inferDifficulty('Routine Support', null)).toBe('beginner');
    });

    it('returns intermediate for urgent', () => {
      expect(inferDifficulty('Urgent - Cutting', null)).toBe('intermediate');
    });

    it('returns beginner for onboarding category', () => {
      expect(inferDifficulty('Some Call', 'onboarding')).toBe('beginner');
    });

    it('returns advanced for advanced category', () => {
      expect(inferDifficulty('Some Call', 'advanced')).toBe('advanced');
    });
  });

  describe('estimateTime', () => {
    it('returns 10 for routine calls', () => {
      expect(estimateTime('Routine Support', null)).toBe(10);
    });

    it('returns 25 for safety planning', () => {
      expect(estimateTime('Safety Planning Call', null)).toBe(25);
    });

    it('returns 15 as default', () => {
      expect(estimateTime('General Call', null)).toBe(15);
    });
  });
});
```

---

## Task 2: Create Migration Script for Scenario Metadata

**Files to create:** `scripts/backfill-scenario-metadata.ts`

**Implementation:**

```typescript
// scripts/backfill-scenario-metadata.ts
import { PrismaClient } from '@prisma/client';
import { detectSkill, inferDifficulty, estimateTime, isValidSkill } from '../src/lib/skills';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Backfilling Scenario Metadata ===\n');

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
  });

  console.log(`Found ${scenarios.length} scenarios to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const s of scenarios) {
    // Detect values using deterministic rules
    const detectedSkill = detectSkill(s.title, s.description);
    const detectedDifficulty = inferDifficulty(s.title, s.category);
    const detectedTime = estimateTime(s.title, s.description);

    // Only update if values are missing or invalid
    const needsUpdate =
      !s.skill ||
      !isValidSkill(s.skill) ||
      !s.difficulty ||
      !['beginner', 'intermediate', 'advanced'].includes(s.difficulty) ||
      !s.estimatedTime;

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    try {
      await prisma.scenario.update({
        where: { id: s.id },
        data: {
          skill: s.skill && isValidSkill(s.skill) ? s.skill : detectedSkill,
          difficulty: s.difficulty || detectedDifficulty,
          estimatedTime: s.estimatedTime || detectedTime,
        },
      });

      console.log(`✓ ${s.title.substring(0, 50)}... → skill=${detectedSkill}, difficulty=${detectedDifficulty}, time=${detectedTime}`);
      updated++;
    } catch (e) {
      console.error(`✗ Failed: ${s.title} - ${e}`);
      errors++;
    }
  }

  console.log('\n=== Results ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already valid): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (errors > 0) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Verification:**
```bash
# Run the backfill
npx ts-node scripts/backfill-scenario-metadata.ts

# Verify all scenarios have metadata
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
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

## Task 3: Create Docker Compose for Postgres

**Files to create:** `docker-compose.yml`

**Implementation:**

```yaml
# docker-compose.yml
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

**Verification:**
```bash
# Start Postgres
docker-compose up -d

# Wait for healthy status
sleep 10

# Verify running
docker-compose ps | grep -q "healthy" || docker-compose ps | grep -q "Up"

# Test connection
docker exec proto-trainer-postgres pg_isready -U proto -d proto_trainer
```

---

## Task 4: Backup SQLite Data

**Files to create:** `scripts/backup-sqlite.sh`

**Implementation:**

```bash
#!/bin/bash
# scripts/backup-sqlite.sh
set -euo pipefail

BACKUP_DIR="prisma/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dev.db.backup-$TIMESTAMP"
COUNTS_FILE="$BACKUP_DIR/counts-$TIMESTAMP.txt"

mkdir -p "$BACKUP_DIR"

# Backup database file
cp prisma/dev.db "$BACKUP_FILE"
echo "Database backed up to: $BACKUP_FILE"

# Record row counts for verification
sqlite3 prisma/dev.db "
SELECT 'scenarios' as tbl, COUNT(*) as cnt FROM scenarios
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'evaluations', COUNT(*) FROM evaluations;
" > "$COUNTS_FILE"

echo "Row counts saved to: $COUNTS_FILE"
cat "$COUNTS_FILE"

# Output for verification
echo ""
echo "BACKUP_FILE=$BACKUP_FILE"
echo "COUNTS_FILE=$COUNTS_FILE"
```

**Verification:**
```bash
chmod +x scripts/backup-sqlite.sh
./scripts/backup-sqlite.sh

# Verify backup exists
ls -la prisma/backups/*.backup-*
```

---

## Task 5: Update Schema for Postgres with Skills Array

**Files to modify:** `prisma/schema.prisma`, `.env`

**Implementation:**

Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// In Scenario model, change:
// skill String?
// To:
skill              String?   // DEPRECATED: Use skills array
skills             String[]  @default([])
```

Update `.env`:
```
# DATABASE_URL="file:./dev.db"
DATABASE_URL="postgresql://proto:proto_dev_2026@localhost:5432/proto_trainer"
```

**Verification:**
```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name postgres_skills_array

# Verify migration applied
npx prisma migrate status
```

---

## Task 6: Migrate Data and Convert Skill to Skills Array

**Files to create:** `scripts/migrate-skill-to-array.ts`

**Implementation:**

```typescript
// scripts/migrate-skill-to-array.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating skill to skills array ===\n');

  // Get all scenarios with skill field populated
  const scenarios = await prisma.scenario.findMany({
    select: { id: true, skill: true, skills: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const s of scenarios) {
    // Skip if skills array already populated
    if (s.skills && s.skills.length > 0) {
      skipped++;
      continue;
    }

    // Migrate skill string to skills array
    if (s.skill) {
      await prisma.scenario.update({
        where: { id: s.id },
        data: { skills: [s.skill] },
      });
      migrated++;
    }
  }

  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already has skills): ${skipped}`);

  // Verify
  const withSkills = await prisma.scenario.count({
    where: { skills: { isEmpty: false } },
  });
  const total = await prisma.scenario.count();

  console.log(`\nVerification: ${withSkills}/${total} scenarios have skills array populated`);

  if (withSkills < total) {
    console.error('WARNING: Some scenarios have empty skills array');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
```

**Verification:**
```bash
npx ts-node scripts/migrate-skill-to-array.ts

# Verify all scenarios have skills array
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const scenarios = await p.scenario.findMany({ select: { skills: true } });
  const empty = scenarios.filter(s => !s.skills || s.skills.length === 0);
  console.log('Total:', scenarios.length, 'With skills:', scenarios.length - empty.length);
  if (empty.length > 0) {
    console.error('FAIL: Some scenarios have empty skills array');
    process.exit(1);
  }
  console.log('PASS: All scenarios have skills array');
  await p.\$disconnect();
})();
"
```

---

## Task 7: Update External API for Backwards Compatibility

**Files to modify:** `src/app/api/external/scenarios/route.ts`

**Implementation:**

```typescript
// Update the mapping in GET handler
const externalScenarios = scenarios.map((s) => ({
  id: s.id,
  name: s.title,
  description: s.description ?? '',
  mode: s.mode as 'phone' | 'chat',
  category: s.category ?? 'general',

  // DEPRECATED: Use 'skills' array instead
  skill: s.skills[0] ?? s.skill ?? 'general',

  // NEW: Skills array (preferred)
  skills: s.skills.length > 0 ? s.skills : (s.skill ? [s.skill] : ['general']),

  difficulty: (s.difficulty ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
  estimatedTime: s.estimatedTime ?? 15,
}))
```

**Verification:**
```bash
# Start dev server in background
npm run dev &
DEV_PID=$!
sleep 5

# Test API response
curl -s http://localhost:3003/api/external/scenarios -H "X-API-Key: ptg-dev-key-2026" | jq '.data.scenarios[0]'

# Verify response has both skill and skills
curl -s http://localhost:3003/api/external/scenarios -H "X-API-Key: ptg-dev-key-2026" | \
  jq -e '.data.scenarios[0] | has("skill") and has("skills") and (.skills | type == "array")'

# Stop dev server
kill $DEV_PID 2>/dev/null || true
```

**Test file:** `src/__tests__/external-api.test.ts`
```typescript
describe('External Scenarios API', () => {
  it('returns both skill and skills fields', async () => {
    const response = await fetch('http://localhost:3003/api/external/scenarios', {
      headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY || 'ptg-dev-key-2026' },
    });

    const data = await response.json();
    expect(data.ok).toBe(true);

    const scenario = data.data.scenarios[0];
    expect(scenario).toHaveProperty('skill');
    expect(scenario).toHaveProperty('skills');
    expect(Array.isArray(scenario.skills)).toBe(true);
    expect(scenario.skills.length).toBeGreaterThan(0);
  });

  it('skill matches first element of skills array', async () => {
    const response = await fetch('http://localhost:3003/api/external/scenarios', {
      headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY || 'ptg-dev-key-2026' },
    });

    const data = await response.json();
    const scenario = data.data.scenarios[0];
    expect(scenario.skill).toBe(scenario.skills[0]);
  });
});
```

---

## Task 8: Update CLAUDE.md and Commit

**Files to modify:** `CLAUDE.md`

**Implementation:**

Add to Resume Context section:

```markdown
## Resume Context (Post PTG Integration Enhancement)

### Completed Work (2026-01-XX)

1. **Scenario Metadata Backfill** ✅
   - All scenarios have skill, difficulty, estimatedTime populated
   - Skills detected using deterministic keyword matching
   - Validation against VALID_SKILLS in src/lib/skills.ts

2. **Postgres Migration** ✅
   - Migrated from SQLite to Postgres (Docker)
   - Start with: `docker-compose up -d`
   - Connection: postgresql://proto:proto_dev_2026@localhost:5432/proto_trainer

3. **Skills Array** ✅
   - Schema: `skills String[]` (Postgres native array)
   - API returns both `skill` (deprecated) and `skills` (array)
   - Backwards compatible with existing PTG integration

### External API Response Shape (v1.1)

\`\`\`json
{
  "id": "uuid",
  "name": "Scenario Title",
  "description": "...",
  "mode": "phone",
  "category": "cohort_training",
  "skill": "risk-assessment",     // DEPRECATED
  "skills": ["risk-assessment"],  // USE THIS
  "difficulty": "intermediate",
  "estimatedTime": 20
}
\`\`\`

### Quick Start (Updated)

\`\`\`bash
docker-compose up -d     # Start Postgres
npm run dev              # Next.js on :3003
npm run ws:dev           # WebSocket on :3004
\`\`\`

### Deferred Work

- **Skill Taxonomy API**: `/api/external/skills` - build when PTG requests
- **Evaluation Criteria API**: Build when PTG needs pre-brief content
```

**Verification:**
```bash
# Full verification suite
npm run build
npx tsc --noEmit
npm run lint

# Verify Postgres is the active database
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const result = await p.\$queryRaw\`SELECT version()\`;
  console.log('Database:', result[0].version.includes('PostgreSQL') ? 'PostgreSQL' : 'Unknown');
  await p.\$disconnect();
})();
"
```

---

## Execution Order

```
Task 1 (Skills lib) → Task 2 (Backfill metadata)
                                ↓
Task 3 (Docker) → Task 4 (Backup) → Task 5 (Schema) → Task 6 (Migrate array)
                                                                ↓
                                                      Task 7 (API update) → Task 8 (Docs)
```

**Dependencies:**
- Tasks 1-2 can run on SQLite (current setup)
- Tasks 3-6 are the Postgres migration sequence
- Task 7 depends on Task 6 (needs skills array)
- Task 8 is final documentation

---

## Verification Commands (Run After All Tasks)

```bash
# 1. Type check
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Build
npm run build

# 4. Verify Postgres
docker-compose ps | grep -q "Up"

# 5. Verify all scenarios have metadata
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const { isValidSkill } = require('./src/lib/skills');
const p = new PrismaClient();
(async () => {
  const scenarios = await p.scenario.findMany();
  let valid = 0;
  for (const s of scenarios) {
    if (s.skills?.length > 0 && s.difficulty && s.estimatedTime) {
      if (s.skills.every(sk => isValidSkill(sk))) {
        valid++;
      }
    }
  }
  console.log('Valid:', valid, '/', scenarios.length);
  if (valid < scenarios.length) process.exit(1);
  await p.\$disconnect();
})();
"

# 6. Verify API contract
curl -s http://localhost:3003/api/external/scenarios -H "X-API-Key: ptg-dev-key-2026" | \
  jq -e '.ok == true and (.data.scenarios | length > 0) and (.data.scenarios[0] | has("skill") and has("skills"))'

echo "ALL VERIFICATIONS PASSED"
```

---

## Rollback Procedure

If migration fails:

```bash
# Stop Postgres
docker-compose down

# Restore SQLite backup
cp prisma/backups/dev.db.backup-* prisma/dev.db

# Revert schema to SQLite
git checkout prisma/schema.prisma

# Update .env back to SQLite
sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL="file:./dev.db"|' .env

# Regenerate client
npx prisma generate
```

---

## Success Criteria

- [ ] All scenarios have valid `skill` values (from VALID_SKILLS)
- [ ] All scenarios have valid `difficulty` values (beginner/intermediate/advanced)
- [ ] All scenarios have `estimatedTime` values (5-60 minutes)
- [ ] Database is Postgres (verified via version query)
- [ ] All scenarios have `skills` array (non-empty)
- [ ] External API returns both `skill` and `skills`
- [ ] Build passes with zero type errors
- [ ] Lint passes

---

*Plan ready for Ralph loop processing. Apply `auto:ready` label when approved.*
