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
| `/api/external/scenarios` | GET | List reusable scenarios |
| `/api/external/scenarios` | POST | Create scenario (supports one-time and reusable) |
| `/api/external/assignments` | GET | List assignments by `?user_id` (external ID) |
| `/api/external/assignments` | POST | Create assignment for counselor |
| `/api/external/assignments/[id]/result` | GET | Get evaluation result |
| `/api/external/assignments/[id]/evaluate` | POST | Trigger evaluation for assignment |
| `/api/external/assignments/[id]/transcript` | GET | Get transcript (optional `?attempt=N`) |

#### POST /api/external/scenarios

Create scenarios programmatically (e.g., from Personalized Training Guide):

```json
{
  "title": "Caller with financial stress",
  "prompt": "You are Sarah, 34, calling about...",
  "description": "Practice de-escalation",
  "mode": "phone",
  "category": "sales",
  "skills": ["de-escalation", "active-listening"],
  "difficulty": "intermediate",
  "estimated_time": 15,
  "is_one_time": true,
  "relevant_policy_sections": "Section 4.2..."
}
```

- `is_one_time: true` → Hidden from GET list, for single-use assignments
- `is_one_time: false` (default) → Appears in GET list, reusable

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
| **WebSocket Auth** | `ws-server/index.ts` | Accepts client-provided `userId` without verification. Implement JWT/signed token validation. See below. |
| **No CSRF Protection** | All API routes | Custom `x-user-id` header provides implicit CSRF protection, but implement explicit CSRF tokens for production. |

### WebSocket Authentication (P2 - Required for Production)

**Current State**: The WebSocket server accepts `userId` from query parameters without server-side verification. While `verifyAssignmentOwnership()` validates assignment access, the userId itself is trusted from the client.

**Risk**: A malicious client could spoof any userId to access sessions.

**Recommended Fix**:
1. Generate a short-lived signed token on HTTP side: `POST /api/websocket-token` → `{ token, expiresAt }`
2. Pass token instead of userId to WebSocket: `ws://localhost:3004?token=...`
3. Verify token signature and expiry on WebSocket connect
4. Extract userId from verified token payload

**Effort**: 2-4 hours

### CSRF Protection (P2 - Required for Production)

**Current State**: No explicit CSRF tokens. The `x-user-id` custom header provides implicit protection (custom headers cannot be sent cross-origin without CORS), but this is not explicit.

**Recommended Fix**:
1. Generate CSRF token on session/page load
2. Include token in request headers for state-changing operations
3. Validate token server-side before processing

**Effort**: 4 hours

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

### Migration Script Best Practices

Scripts in `scripts/` that modify database records should follow these patterns:

#### 1. Use Transactions for Bulk Updates

Wrap multi-record updates in a Prisma transaction for atomicity:

```typescript
// GOOD: All-or-nothing updates
await prisma.$transaction(async (tx) => {
  for (const record of records) {
    await tx.model.update({ where: { id: record.id }, data: { ... } });
  }
});

// BAD: Individual updates leave partial state on failure
for (const record of records) {
  await prisma.model.update({ ... }); // If this fails mid-way, DB is inconsistent
}
```

#### 2. Idempotent Design

Scripts should be safe to re-run:

```typescript
// Check if already migrated before updating
if (record.newField && record.newField.length > 0) {
  console.log('Already migrated, skipping');
  continue;
}
```

#### 3. Progress Logging with Verification

```typescript
let migrated = 0, skipped = 0, errors = 0;

// Log each operation
console.log(`✓ ${record.title} → updated`);
migrated++;

// Verify final state
const count = await prisma.model.count({ where: { newField: { not: null } } });
console.log(`\nVerification: ${count}/${total} records migrated`);
```

#### 4. Clean Exit on Errors

```typescript
if (errors > 0) {
  console.error(`${errors} errors occurred`);
  process.exit(1); // Signal failure to calling process
}
await prisma.$disconnect();
```

See `scripts/backfill-scenario-metadata.ts` and `scripts/migrate-skill-to-array.ts` for examples.

---

## Resume Context (2026-01-31)

### Current State: Pre-Handoff Cleanup COMPLETE

All code review findings (P1/P2/P3) from Ralph overnight autonomous agent work have been addressed and merged. The codebase is ready for comprehensive review and SWE handoff assessment.

### Session Summary (2026-01-31)

**Pre-Handoff Cleanup Branch** - Merged PR #37 (`50a928e`)

1. **Code Review Executed** - Multi-agent review of 12 overnight Ralph commits
2. **P1 Critical Fixes** ✅
   - Fixed path traversal vulnerability in evaluator-context and recordings download
   - Fixed API key length oracle with SHA-256 hashing
   - Added `requireSupervisor()` auth to accounts API
3. **P2 Important Fixes** ✅
   - Standardized all domain types to camelCase
   - Added missing ScenarioCategory values (sales, customer_facing, tap, supervisors)
   - Added FORBIDDEN to ApiErrorType
   - Added database indexes on transcript_turns
   - Documented WebSocket auth and CSRF patterns
4. **P3 Nice-to-Have Fixes** ✅
   - Improved blob URL cleanup with multiple mechanisms
   - Simplified WebSocket ownership check
   - Added agent-native external API endpoints:
     - `POST /api/external/assignments/[id]/evaluate`
     - `GET /api/external/assignments/[id]/transcript`

### Previous Sessions

- **2026-01-30**: Sales training scenario experiment - validated prompt override technique
- **2026-01-29**: Fixed Pre-Chat Survey bug, restored demo mode, fixed category filtering
- **2026-01-28**: Created `/api/sessions/[id]/transcript` endpoint

### Quick Start

```bash
npm run dev               # Next.js on :3003
npm run ws:dev            # WebSocket on :3004
```

### Git Status

- Latest commit: `50a928e` Pre-handoff cleanup (squash merge of PR #37)
- Branch: main (clean)

### Next Session Tasks

**IMMEDIATE**: Run these two workflows to assess production readiness:

1. **Full App Code Review**
   ```
   /review main
   ```
   Run the comprehensive code review workflow on the entire application to identify any remaining issues.

2. **Production Readiness Assessment**
   ```
   /production-ready
   ```
   Run the SME prototype readiness skill to assess if the app is ready for SWE handoff.

These two workflows will produce a complete assessment of what (if anything) remains before the prototype can be handed off to Software Engineering for production hardening.
