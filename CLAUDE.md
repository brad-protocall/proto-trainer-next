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

# Demo Mode - PROTOTYPE ONLY (enables user switching for demos)
NEXT_PUBLIC_DEMO_MODE=true
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

## Prototype-Only Features (SWE Handoff Checklist)

These features exist for demo/prototype purposes and **MUST be addressed before production**:

| Feature | Location | Action Required |
|---------|----------|-----------------|
| **User Switching** | `counselor-dashboard.tsx` | Gated by `NEXT_PUBLIC_DEMO_MODE`. Set to `false` or remove entirely. Replace with proper session-based auth. |
| **No Real Auth** | Throughout | Uses `x-user-id` header. Replace with JWT/session auth. |
| **Seeded Test Users** | `prisma/seed.ts` | Remove test data seeding for production. |

When `NEXT_PUBLIC_DEMO_MODE=true`:
- Counselor dashboard shows a user selector (yellow border, "[DEMO]" label)
- Any user can view any other user's assignments (for demos)

When `NEXT_PUBLIC_DEMO_MODE=false` (production):
- Counselor dashboard shows current user name only (read-only)
- User switching is disabled

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

## Resume Context (2026-01-26 Late Evening)

### Current State: Uncommitted Changes Reviewed - Fixes Needed

PostgreSQL migration complete. Previous P1 fixes (023, 024) committed and pushed. Reviewed 13 uncommitted files containing feature work (recording playback, counselor selector, etc.). Found new issues that need fixing before committing.

### Session Summary (2026-01-26)

1. **Fixed Previous P1 Issues** ✅
   - 023: Docker credentials → env vars, localhost binding
   - 024: Added `skills: string[]` to Scenario type
   - Commit `6b7f75b` pushed to main

2. **Reviewed Uncommitted Changes** ✅
   - 13 files modified (~386 lines added, 123 removed)
   - Ran 7 parallel review agents
   - Created 9 new todo files (029-037)

### Uncommitted Changes Summary

These files have uncommitted work that needs P1 fixes before commit:
- `src/app/api/assignments/[id]/route.ts` - Added recordingId
- `src/app/api/assignments/route.ts` - Added recordingId (DUPLICATE function!)
- `src/app/api/external/assignments/route.ts` - Duplicate check (has race condition)
- `src/components/counselor-dashboard.tsx` - Counselor selector, recording playback
- `src/hooks/use-realtime-voice.ts` - Retry logic, debug logs
- `ws-server/realtime-session.ts` - Session reuse logic

### 🔴 P1 - Must Fix Before Commit

| Todo | Issue | Effort |
|------|-------|--------|
| `029-pending-p1-counselor-impersonation-url.md` | URL param allows viewing other counselors' data | 30 min |
| `030-pending-p1-race-condition-duplicate-assignments.md` | Concurrent requests create duplicate assignments | 30 min |
| `031-pending-p1-duplicate-build-assignment-response.md` | 47-line function copy-pasted in 2 files | 15 min |

### 🟡 P2 - Should Fix

| Todo | Issue | Effort |
|------|-------|--------|
| `032-pending-p2-debug-console-logs.md` | Debug logs left in production code | 10 min |
| `033-pending-p2-websocket-auth-missing.md` | WebSocket trusts client-provided userId | 1 hour |
| `034-pending-p2-blob-url-memory-leak.md` | Recording playback leaks memory | 15 min |
| `035-pending-p2-session-reuse-mixed-transcripts.md` | Reconnecting mixes old/new transcripts | 30 min |
| `036-pending-p2-camelcase-snakecase-inconsistency.md` | Uses `any` to handle naming inconsistency | 1 hour |

### 🟢 Previously Completed P2s (Still Pending)

| Todo | Issue |
|------|-------|
| `025-pending-p2-missing-database-indexes.md` | No indexes on foreign keys |
| `026-pending-p2-migration-scripts-no-transactions.md` | Scripts lack transaction boundaries |
| `027-pending-p2-skills-validation-missing.md` | No CHECK constraint on valid skills |
| `028-pending-p2-agent-native-skills-endpoints.md` | Missing /api/skills endpoints |

### Quick Start

```bash
docker-compose up -d     # Start PostgreSQL (needs POSTGRES_PASSWORD in .env!)
npm run dev              # Next.js on :3003
npm run ws:dev           # WebSocket on :3004
```

### Next Session Tasks

1. **Fix P1s before committing** (~1.25 hours):
   ```bash
   # View new P1 todos
   cat todos/029-pending-p1-*.md
   cat todos/030-pending-p1-*.md
   cat todos/031-pending-p1-*.md
   ```

2. **Fix easy P2** (10 min):
   - Remove debug console.logs (todo 032)

3. **Commit the feature work** after fixes

4. **Triage remaining P2s** - decide which to fix now vs defer

### Git Status

- Latest commit: `6b7f75b` (pushed to main)
- Branch: main
- **13 files with uncommitted changes** (feature work, needs P1 fixes)
- Pending todos: 13 total (3 P1, 9 P2, 1 P3)

### Key Files for P1 Fixes

- `src/app/api/assignments/route.ts` - Extract `buildAssignmentResponse`
- `src/app/api/assignments/[id]/route.ts` - Remove duplicate function
- `src/app/api/external/assignments/route.ts` - Add transaction to duplicate check
- `src/components/counselor-dashboard.tsx` - Restrict counselor selector OR validate server-side
