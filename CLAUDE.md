# Proto Trainer Next

Next.js migration of Proto Training Guide - crisis counselor training with voice roleplay and AI evaluation.

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate deploy
npx prisma db seed

# Start dev server (port 3003)
npm run dev

# Start WebSocket server (port 3004) - for voice training
npm run ws:dev
```

## Architecture

This is a Next.js 14+ application using the App Router with TypeScript and Prisma ORM.

| Component | Stack |
|-----------|-------|
| Frontend | Next.js 14+ App Router |
| Backend | Next.js Route Handlers |
| Database | Prisma + SQLite (dev) |
| AI Chat | OpenAI Chat Completions API |
| AI Voice | OpenAI Realtime API (via WebSocket relay) |
| Styling | Tailwind CSS |

## Port Assignments

| Port | Service |
|------|---------|
| 3000 | Ralph-UI (monitoring) |
| 3001 | Basic PTG (existing legacy) |
| 3002 | Agent-Native PTG (existing) |
| **3003** | **proto-trainer-next (Next.js)** |
| **3004** | **proto-trainer-next WebSocket** |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server ports
PORT=3003
WS_PORT=3004
NEXT_PUBLIC_WS_URL=ws://localhost:3004

# Database
DATABASE_URL="file:./dev.db"

# OpenAI API
OPENAI_API_KEY=sk-...

# Models (optional, have defaults)
CHAT_MODEL=gpt-4o
EVALUATOR_MODEL=gpt-4o
REALTIME_MODEL=gpt-4o-realtime-preview
REALTIME_VOICE=shimmer

# External API (for Personalized Training Guide integration)
EXTERNAL_API_KEY=your-secret-api-key
```

## Project Structure

```
proto-trainer-next/
├── prisma/
│   ├── schema.prisma    # Database schema
│   ├── seed.ts          # Seed data
│   └── dev.db           # SQLite database
├── src/
│   ├── app/
│   │   ├── api/         # API route handlers
│   │   │   ├── users/
│   │   │   ├── accounts/
│   │   │   ├── scenarios/
│   │   │   ├── assignments/
│   │   │   ├── sessions/
│   │   │   └── external/  # External API (X-API-Key auth)
│   │   ├── supervisor/  # Supervisor dashboard
│   │   ├── counselor/   # Counselor dashboard
│   │   └── page.tsx     # Home (role selector)
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities
│   │   ├── api.ts       # API response helpers
│   │   ├── auth.ts      # Authentication helpers
│   │   ├── env.ts       # Environment validation
│   │   ├── openai.ts    # OpenAI client
│   │   ├── prisma.ts    # Prisma client singleton
│   │   └── validators.ts # Zod schemas
│   └── types/           # TypeScript definitions
└── ws-server/           # WebSocket relay for voice
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/users` | GET, POST | List users, create user |
| `/api/accounts` | GET, POST | List accounts, create account |
| `/api/scenarios` | GET, POST | List scenarios, create scenario |
| `/api/scenarios/[id]` | GET, PUT, DELETE | CRUD single scenario |
| `/api/scenarios/import` | POST | Bulk import from CSV |
| `/api/assignments` | GET, POST | List assignments, create (single/bulk) |
| `/api/assignments/[id]` | GET, PATCH, DELETE | CRUD single assignment |
| `/api/sessions` | POST | Create chat session |
| `/api/sessions/[id]` | GET | Get session with transcript |
| `/api/sessions/[id]/message` | POST | Send message, get AI response |
| `/api/sessions/[id]/evaluate` | POST | Generate evaluation |

### External API (X-API-Key auth)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/external/scenarios` | GET | List scenarios for external integrations |
| `/api/external/assignments` | GET | List assignments by `?user_id` (external ID) |
| `/api/external/assignments` | POST | Create assignment for counselor |
| `/api/external/assignments/[id]/result` | GET | Get evaluation result |

## Database Models

- **User**: Supervisors and counselors
- **Account**: Organization accounts
- **Scenario**: Training scenarios with prompts
- **Assignment**: Scenario assigned to counselor
- **Session**: Chat training session
- **TranscriptTurn**: Conversation turns
- **Evaluation**: AI-generated evaluation
- **Recording**: Voice training recordings

## Key Decisions

1. **SQLite for dev** - No database server dependency
2. **Port 3003** - Avoids conflicts with other local projects
3. **ApiResponse<T>** - Discriminated union for type-safe API responses
4. **Query params for auth** - Feature parity with original (no JWT)
5. **Prisma ORM** - Type-safe database queries

## Commands

```bash
# Development
npm run dev          # Start Next.js on port 3003
npm run ws:dev       # Start WebSocket server on port 3004

# Build
npm run build        # Production build
npm run lint         # ESLint

# Database
npx prisma migrate dev --name <name>  # Create migration
npx prisma migrate deploy             # Apply migrations
npx prisma db seed                    # Seed data
npx prisma studio                     # GUI browser
```

## References

- Original App: `../Proto Training Guide/`
- Migration Plan: `../plans/proto-training-guide-nextjs-migration.md`

---

## Ralph Autonomous Agent Guidelines

**CRITICAL**: These guidelines exist because of bugs introduced during overnight autonomous sessions. See `docs/solutions/integration-issues/api-frontend-contract-mismatch-bulk-assignments.md` for detailed examples.

### Before Changing API Response Fields

```bash
# ALWAYS search for all usages before renaming
grep -r "fieldName" src/ --include="*.ts" --include="*.tsx"

# Make changes in ALL files atomically (same commit)
# Verify no old references remain after changes
```

### API-Frontend Contract Rules

1. **Types first**: Update `src/types/index.ts` BEFORE changing API implementation
2. **Run type check**: `npx tsc --noEmit` after EVERY file change
3. **Never use `any`** for API responses - use typed interfaces
4. **Zod schemas** in `src/lib/validators.ts` must match TypeScript types

### UX Feedback Timing

| Feedback Type | Auto-Close? | Why |
|--------------|-------------|-----|
| Pure success | Yes (1.5s) | Quick confirmation |
| Success with warnings | NO | User needs to read details |
| Partial success | NO | User must see what failed |
| Error | NO | User must understand the error |

**Rule**: If `skipped > 0` or `blocked.length > 0`, keep modal open for manual close.

### Naming Conventions (This Codebase)

| Layer | Convention | Example |
|-------|------------|---------|
| Database (Prisma) | snake_case | `created_at` |
| API Response | camelCase | `createdAt` |
| TypeScript Types | snake_case (legacy) | `created_at` |
| Frontend State | camelCase | `createdAt` |

**Warning**: There's inconsistency. When in doubt, check existing similar code.

### Pre-Completion Checklist

Before marking ANY task complete:

```bash
# All must pass
npx tsc --noEmit          # Zero type errors
npm run lint              # Zero lint errors
grep -r "oldName" src/    # Zero results for renamed things
```

### Known Pitfalls

1. **camelCase/snake_case**: API returns camelCase, some types use snake_case
2. **Auth headers**: API calls need `x-user-id` header (see `src/lib/fetch.ts`)
3. **Modal timing**: Never auto-close modals showing actionable feedback
4. **Bulk operations**: Always handle partial success case

### Bug Prevention Patterns (2026-01-21)

See `docs/solutions/prevention-strategies/bug-prevention-patterns.md` for full details.

#### 1. Category/Enum Validation Mismatch

**Problem**: Frontend `VALID_CATEGORIES` didn't match backend `ScenarioCategorySchema`.

**Prevention**: Export enum values from `validators.ts` as single source of truth:
```typescript
// validators.ts - SINGLE SOURCE
export const ScenarioCategoryValues = ['cohort_training', 'onboarding', ...] as const;

// Components - DERIVE from source
import { ScenarioCategoryValues } from '@/lib/validators';
const VALID_CATEGORIES = [...ScenarioCategoryValues, ''];
```

#### 2. 204 No Content Parsing Error

**Problem**: `response.json()` crashes on DELETE returning 204 No Content.

**Prevention**: Check status before parsing:
```typescript
// CORRECT pattern for DELETE
const response = await fetch(url, { method: 'DELETE' });
if (!response.ok) {
  const data = await response.json(); // Only parse on error
  throw new Error(data.error?.message);
}
// 204 = success, no body to parse
```

#### 3. Orphaned Records (Cascading Deletes)

**Problem**: Deleting scenarios left assignments pointing to nothing.

**Prevention**: Check dependencies before delete:
```typescript
const count = await prisma.assignment.count({ where: { scenarioId: id } });
if (count > 0) {
  return apiError({ type: 'CONFLICT', message: `${count} assignments depend on this` }, 409);
}
```

#### 4. Missing Auth Headers

**Problem**: Components using raw `fetch()` instead of `authFetch`.

**Prevention**: Always use `authFetch` from `useAuth()` hook or pass `userId` prop:
```typescript
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (userId) headers['x-user-id'] = userId;
```

---

## Resume Context (2026-01-26)

### Current State: PostgreSQL + Skills Array Migration Complete

Migrated from SQLite to PostgreSQL with native `skills` array support. External API returns both `skill` (deprecated) and `skills` (array) for backwards compatibility.

### Session Summary (2026-01-26)

1. **PostgreSQL Migration** ✅
   - Switched from SQLite to PostgreSQL (Docker)
   - Start with: `docker-compose up -d`
   - Connection: `postgresql://proto:proto_dev_2026@localhost:5432/proto_trainer`

2. **Skills Array Support** ✅
   - Schema: `skills String[]` (Postgres native array)
   - Deterministic skill detection via `src/lib/skills.ts`
   - Backfill script populates metadata from scenario content

3. **External API v1.1** ✅
   - Returns both `skill` (deprecated) and `skills` (array)
   - Backwards compatible with existing PTG integration

### Quick Start

```bash
docker-compose up -d     # Start PostgreSQL
npm run dev              # Next.js on :3003
npm run ws:dev           # WebSocket on :3004
```

### External API Response Shape (v1.1)

```json
{
  "id": "uuid",
  "name": "Scenario Title",
  "description": "...",
  "mode": "phone",
  "category": "cohort_training",
  "skill": "risk-assessment",     // DEPRECATED - use skills
  "skills": ["risk-assessment"],  // NEW - use this
  "difficulty": "intermediate",
  "estimatedTime": 20
}
```

### Skill Detection

Skills are detected from scenario title/description using keyword patterns in `src/lib/skills.ts`:

| Skill | Example Keywords |
|-------|-----------------|
| risk-assessment | suicid, SI, ideation, lethality |
| safety-planning | safety plan, means safety, restrict |
| de-escalation | de-escalat, calm, crisis intervention |
| self-harm-assessment | cut, self-harm, NSSI |
| substance-assessment | substance, drug, alcohol |
| dv-assessment | domestic, partner violen, abuse |
| grief-support | grief, loss, death, bereave |
| anxiety-support | anxi, panic, overwhelm |

### Database Scripts

```bash
# Backfill scenario metadata (skill, difficulty, estimatedTime)
npx tsx scripts/backfill-scenario-metadata.ts

# Migrate skill to skills array
npx tsx scripts/migrate-skill-to-array.ts

# Backup SQLite (if reverting)
./scripts/backup-sqlite.sh
```

### Files Created

- `docker-compose.yml` - PostgreSQL container
- `src/lib/skills.ts` - Skill constants and detection
- `scripts/backfill-scenario-metadata.ts` - Populate metadata
- `scripts/migrate-skill-to-array.ts` - Populate skills array
- `scripts/backup-sqlite.sh` - SQLite backup utility
- `prisma/migrations/20260126055146_init_postgres_with_skills_array/`

### External API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/external/scenarios` | GET | List all reusable scenarios |
| `/api/external/assignments?user_id=X` | GET | List assignments for user |
| `/api/external/assignments` | POST | Create assignment |
| `/api/external/assignments/[id]/result` | GET | Get evaluation result |
