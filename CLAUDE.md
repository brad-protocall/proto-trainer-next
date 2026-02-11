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

# Voice training uses LiveKit Cloud (no local server needed)
# To redeploy agent: cd livekit-agent && lk agent deploy
```

## Architecture

This is a Next.js 14+ application using the App Router with TypeScript and Prisma ORM.

| Component | Stack |
|-----------|-------|
| Frontend | Next.js 14+ App Router |
| Backend | Next.js Route Handlers |
| Database | Prisma + SQLite (dev) |
| AI Chat | OpenAI Chat Completions API |
| AI Voice | LiveKit Cloud + OpenAI Realtime API |
| Styling | Tailwind CSS |

## Port Assignments

| Port | Service |
|------|---------|
| 3000 | Ralph-UI (monitoring) |
| 3001 | Basic PTG (existing legacy) |
| 3002 | Agent-Native PTG (existing) |
| **3003** | **proto-trainer-next (Next.js)** |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3003

# Database
DATABASE_URL="file:./dev.db"

# OpenAI API
OPENAI_API_KEY=sk-...

# Models (optional, have defaults)
CHAT_MODEL=gpt-4o
EVALUATOR_MODEL=gpt-4o
ANALYZER_MODEL=gpt-4.1-mini
REALTIME_MODEL=gpt-4o-realtime-preview
REALTIME_VOICE=shimmer

# LiveKit (voice training via LiveKit Cloud)
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud

# Internal Service Key (for LiveKit agent -> Next.js API calls)
INTERNAL_SERVICE_KEY=your-internal-service-key-here

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
│   │   │   ├── internal/  # Internal API (X-Internal-Service-Key auth)
│   │   │   ├── livekit/   # LiveKit token generation
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
└── livekit-agent/       # LiveKit voice AI agent (deployed to cloud)
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
| `/api/sessions/[id]/evaluate` | POST | Generate evaluation (triggers analysis fire-and-forget) |
| `/api/sessions/[id]/analyze` | POST | Manual analysis trigger (supervisor-only, idempotent) |
| `/api/livekit/token` | POST | Generate LiveKit room token for voice training |

### Internal API (X-Internal-Service-Key auth)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/internal/sessions` | POST | Create voice training session (called by LiveKit agent) |
| `/api/internal/sessions/[id]/transcript` | POST | Bulk persist transcript turns (called by LiveKit agent) |

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
| **No CSRF Protection** | All API routes | Custom `x-user-id` header provides implicit CSRF protection, but implement explicit CSRF tokens for production. |

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
npm run dev              # Start Next.js on port 3003

# Pi Deployment (run from Mac)
npm run deploy:pi        # Dry run — preview what would sync
npm run deploy:pi:go     # Actually sync files (always excludes .env)
npm run deploy:pi:full   # Sync + build + restart service on Pi

# LiveKit Agent
npm run agent:deploy     # Deploy voice agent to LiveKit Cloud

# Build
npm run build            # Production build
npm run lint             # ESLint

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

## Resume Context (2026-02-10 Late Evening)

### Current State: Post-Session Analysis Scanning — Review Fixes

**Branch:** `ralph/post-session-analysis-scanning` (review fixes in progress)
**Status:** Ralph implemented 7 user stories (Prisma migration, types, prompt, LLM function, flag sources, analyze endpoint, fire-and-forget trigger). 6-agent code review completed. Fixing P1/P2 findings before PR creation.

### What Happened This Session (2026-02-10)

1. **Ralph autonomous agent** implemented Feature #12 (Scenario Generation from Complaint) across 7 commits
2. **6-agent code review** identified 16 findings (5 P1, 7 P2, 4 P3)
3. **Fixed all 16 findings** in 3 commits (P1 → P2 → P3)
4. **Created PR #44**, merged to main, deployed to Pi
5. **Compound documentation session** — 4 parallel subagents captured lessons

### Key Files Added/Modified (Feature #12)

| File | What |
|------|------|
| `src/components/generate-scenario-modal.tsx` | **New** — two-phase modal (paste complaint → review/edit AI output) |
| `src/app/api/scenarios/generate/route.ts` | **New** — generation endpoint with rate limiting |
| `src/lib/rate-limit.ts` | **New** — in-memory sliding window rate limiter |
| `prompts/scenario-generator.txt` | **New** — system prompt for complaint-to-scenario AI |
| `src/lib/openai.ts` | Added `generateScenarioFromComplaint()` using `zodResponseFormat` |
| `src/lib/validators.ts` | Added generation schemas with `.max()` constraints |
| `src/lib/prompts.ts` | Added `getScenarioGeneratorPromptFile()` accessor + prompt caching |
| `src/app/api/sessions/[id]/evaluate/route.ts` | **Bug fix** — reads file content instead of passing path to LLM |
| `docs/solutions/process-workflow/` | **New** — compound doc for this workflow |
| `docs/solutions/prevention-strategies/ai-code-generation-prevention-checklist.md` | **New** — AI code review checklist |

### Pre-existing Bug Discovered During Review

The evaluate route was passing `evaluatorContextPath` (a file path string) directly to the LLM instead of reading the file contents. This meant evaluator context **never worked** for any scenario. Fixed in the P1 commit.

### Remaining TODO (Pick Up Here)

1. **Long-term recording** — Consider LiveKit Egress for server-side recording (deferred)
2. **Long-term feedback speed** — Have agent persist transcripts via data channel before disconnect instead of relying on shutdown callback (would eliminate 30-40s wait)
3. **Home page label** — "Learner" button still routes to `/counselor` path internally (fine for now, rename route if needed later)
4. **CLAUDE.md AI patterns** — The prevention checklist has ready-to-paste CLAUDE.md additions for AI code generation patterns (optional, do when next Ralph session is planned)

### Ngrok Auth Gotcha (NEW — 2026-02-07)

**Problem**: Voice sessions showing "Session creation failed" — LiveKit agent callbacks not reaching Pi.
**Root Cause**: ngrok had OAuth authentication enabled (`idp.ngrok.com/oauth2` redirect on all requests). The LiveKit agent makes plain HTTP callbacks and can't authenticate with ngrok's OAuth.
**Fix**: Restart ngrok without `--oauth` flag. Simple: `ngrok http --url=proto-trainer.ngrok.io http://pai-hub.local:3003`
**Detection**: `curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions` returns 302 → ngrok auth blocking. Should return 405 (Method Not Allowed) when working.

### Latency (Resolved — 2026-02-07)

Previously noticed higher latency, but testing tonight showed normal response times. Likely was transient (ngrok/network conditions or OpenAI API load). No action needed unless it recurs.

### P2 Items Deferred (10 total, fix before production)

1. No `reviewedBy` / `updatedAt` on SessionFlag (audit trail)
2. No rate limiting on flag endpoint (per-session cap)
3. No rate limiting on evaluate endpoint (LLM cost protection)
4. Composite index could include `createdAt` for query performance
5. Scenario metadata injection risk (evaluatorContext could manipulate grading)
6. No raw evaluation logging (audit trail for flag parsing)
7. P2002 catch doesn't re-validate auth after concurrent race
8. No UUID validation on `id` URL params (invalid IDs cause 500 instead of 400)
9. Unhandled JSON parse error in flag route (500 instead of 400)
10. `parseFlags()` validation now skips invalid LLM output silently — could log warnings

### Pi Deployment Gotchas (2026-02-06)

1. **Correct directory**: `~/apps/proto-trainer-next` (NOT `~/proto-trainer-next`)
2. **Must rebuild on Pi**: rsync from macOS includes `.next/` with macOS Prisma binaries — must run `npx prisma generate && npm run build` on Pi
3. **Dev deps needed for build**: `npm install` (not `--production`) — Next.js build needs `@types/papaparse`, `eslint`, etc.
4. **OpenAI client**: Lazy-initialized via Proxy to avoid crash during build without API key
5. **livekit-agent excluded from tsconfig**: Has its own eslint config that breaks build without its own devDeps
6. **`.env` not rsynced**: Must already exist on Pi with DATABASE_URL, OPENAI_API_KEY, etc.
7. **Prisma baselining**: If P3005 "schema not empty" error, baseline existing migrations with `prisma migrate resolve --applied` before `migrate deploy`
8. **sudo in SSH one-liners fails**: "Interactive authentication required" — must SSH interactively for `sudo systemctl restart`
9. **NEXT_PUBLIC_ vars require rebuild**: `NEXT_PUBLIC_*` env vars are baked into the Next.js build at compile time. Changing `.env` + restart is NOT enough — must run `npm run build` on Pi. Regular env vars (DATABASE_URL, OPENAI_API_KEY, etc.) only need a restart.
10. **Pi database password is `Protocall`**: NOT `proto_dev_2026` (which is the local dev password). Pi's `.env` has `DATABASE_URL="postgresql://proto:Protocall@..."`. There's also a systemd override at `/etc/systemd/system/proto-trainer-next.service.d/override.conf` that sets this.
11. **Don't edit Pi `.env` with values from local**: Pi and local have DIFFERENT database passwords. Be careful with nano — only edit the specific lines you intend to change.
12. **Pi LiveKit URL**: `wss://proto-trainer-next-amw48y2e.livekit.cloud` — the `kf6mbd6s` URL that was previously there is invalid/non-existent.
13. **Seed drift**: Adding users to `prisma/seed.ts` doesn't automatically add them to Pi. Must either re-run `npx prisma db seed` on Pi or INSERT directly via `sudo -u postgres psql -d proto_trainer`. Use `ON CONFLICT DO NOTHING` for idempotency.
14. **LiveKit agent stale container**: If voice shows "Waiting for agent..." but ngrok/Pi/secrets are all fine, the agent container may be stale. Fix: `cd livekit-agent && lk agent deploy`. See `docs/solutions/runtime-errors/livekit-agent-stale-container-dispatch-failure.md`.
15. **`lk` CLI is on Mac only**: The LiveKit CLI is installed on your Mac, not on Pi. All `lk agent *` commands must run from Mac terminal.
16. **ngrok OAuth blocks LiveKit agent**: If ngrok has `--oauth` enabled, all requests get 302 redirected to `idp.ngrok.com/oauth2`. The LiveKit agent can't authenticate, so callbacks fail silently. Detection: `curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions` — should return 405, not 302. Fix: restart ngrok without `--oauth`.
17. **rsync sends local `.env` to Pi**: SOLVED — use `npm run deploy:pi:full` instead of raw rsync. The deploy script (`scripts/deploy-pi.sh`) always excludes `.env` and verifies Pi credentials after sync. This caused outages TWICE before the script was created (2026-02-06 and 2026-02-07).
18. **NEVER use raw rsync to deploy**: Always use `npm run deploy:pi` / `deploy:pi:go` / `deploy:pi:full`. The script excludes `.env`, `node_modules/`, `.next/`, and other platform-specific files. See `scripts/deploy-pi.sh` for the full exclude list.

### GitHub Issues

| Issue | Title | Status | Depends On |
|-------|-------|--------|------------|
| #38 | Record and evaluate free practice sessions | **Done** (`c15a984`) | — |
| #39 | Free practice dashboard visibility | **Done** (`5640615`) | #38 (done) |
| #40 | Post-session analysis (feedback, safety, consistency) | **Done** (PR #43 merged, `bdfca2f`) | #38 (done) |
| #12 | Scenario Generation from Complaint | **Done** (PR #44 merged, `b8dab3f`) | — |
| — | Post-Session Analysis Scanning | **In Review** (branch: `ralph/post-session-analysis-scanning`) | #40 (done) |

### Previous Sessions

- **2026-02-10 (Evening)**: Feature #12 — Ralph implemented scenario generation (7 commits), 6-agent code review found 16 findings (5 P1, 7 P2, 4 P3), all fixed in 3 commits. Discovered pre-existing bug: evaluate route passed file path to LLM instead of reading content. Created PR #44, merged, deployed to Pi. Ran compound documentation session (4 parallel subagents), wrote process-workflow doc + AI code generation prevention checklist. Latest on main: `49f896c`.
- **2026-02-09 (Late Evening)**: Two UX fixes: voice readiness indicator + renamed Counselor to Learner. Merged PR #43 to main. Commit: `bdfca2f`.
- **2026-02-09 (Evening)**: Pushed voice recording fix, then user-tested on Pi. Found two UX issues: (1) feedback took ~50s because agent transcript persistence is slow (30-40s through shutdown → ngrok pipeline), (2) voice connection needed 2-3 manual attempts. Fixed with: faster transcript polling (1.5s interval, 30 retries, elapsed timer), graceful failure screen with "Back to Dashboard", and auto-retry connection (up to 3 times, no user action). Three deploys to Pi total. Commits: `196c2b4`, `9836951`.
- **2026-02-08 (Evening)**: Implemented browser-side voice recording (`9f0dbfb`) — AudioContext + MediaRecorder hook, FormData upload endpoint, P1 security fixes on download route. Short-term fix for missing voice recordings. Code review ran but session ended before resume context update.
- **2026-02-08 (Afternoon)**: Created safe Pi deploy script (`scripts/deploy-pi.sh`) — rsync wrapper that always excludes `.env`, dry run by default, post-sync verification. Fixed transcript timing race condition — 3s initial delay before first eval attempt, 8 retries (19s max), phase-aware loading messages ("Saving session..." → "Generating feedback..."). Interim work: evaluator_context support added to external scenarios API (`f2d2bb9`).
- **2026-02-07 (Late Evening)**: Pi deployment tested — fixed .env overwrite (DATABASE_URL password + missing INTERNAL_SERVICE_KEY), rebuilt on Pi, voice working. Discovered 3 critical bugs: (1) no voice recordings since LiveKit migration, (2) transcript timing race condition, (3) external API missing evaluatorContext field. Committed disconnect fix (`ed07f27`), pushed all to GitHub. PTG-generated scenario worked via external API.
- **2026-02-07 (Evening)**: Fixed voice disconnect flow — any disconnect now triggers evaluation (prevents orphaned sessions). Moved "End Session & Get Feedback" button above LiveKit controls. Discovered ngrok OAuth was blocking agent callbacks (302 redirect). Rsynced to Pi but NOT yet built/restarted. Latency investigation noted.
- **2026-02-07 (Afternoon)**: Added voice technical issue feedback option, flag console log + email notifications (nodemailer), free practice recording parity fix. All committed locally (`825ebc9`), not yet pushed.
- **2026-02-06 (Late Evening)**: Voice still failing after rebuild — agent stale container, fixed with `lk agent deploy`. Provisioned PTG users on Pi (5 users via SQL INSERT). Added Brad Pendergraft to seed.ts. Compound docs written.
- **2026-02-06 (Evening)**: Pi voice fix — wrong LiveKit URL (`kf6mbd6s` → `amw48y2e`), database password mismatch during .env edit (reset to `Protocall`), learned NEXT_PUBLIC_ vars need rebuild not just restart. App rebuilt on Pi.
- **2026-02-05 (Late Evening)**: Pi deploy completed (P3005 baseline fix), E2E tests all passed, discovered recording parity gap for free practice voice sessions
- **2026-02-05 (Afternoon)**: Chunk 4 review (2 P1 fixes), PR #43 created, Pi deployment (discovered wrong directory, OpenAI lazy-init fix, tsconfig exclusion)
- **2026-02-05 (Earlier)**: Chunked code review of #40 — chunks 1-3 reviewed, 11 P1 fixes applied
- **2026-02-04 (Late Evening)**: Fixed LiveKit secrets issue — comma-separated values corrupted URL, re-set with separate `--secrets` flags, voice now working
- **2026-02-04 (Evening)**: E2E testing, 2 bug fixes (`77b4c87`), Pi deployment, LiveKit agent deployment
- **2026-02-03 (Late Evening)**: #39 implementation + 6-agent review, all P1/P2 fixed, committed `5640615`
- **2026-02-03 (Evening)**: #38 implementation + 7-agent review, all fixes committed `c15a984`
- **2026-02-03 (Morning)**: 7-agent code review of LiveKit migration, all findings fixed, committed `af5a049`
- **2026-02-02 (Evening)**: LiveKit full migration (Phase A backend + Phase B frontend)
- **2026-02-02 (Afternoon)**: LiveKit spike - VERDICT: GO
- **2026-02-01 (Evening)**: User testing bug fixes - demo mode dropdown, counselor list auth
- **2026-01-31 (Evening)**: Security hardening sprint, multi-agent code review (18/25)
- **2026-01-31 (Morning)**: Pre-handoff cleanup - PR #37 merged
- **2026-01-30**: Sales training scenario experiment
- **2026-01-29**: Fixed Pre-Chat Survey bug, demo mode, category filtering

### Key Architecture Decisions

**Exclusive Arc on Evaluation:**
- `assignmentId` (nullable unique) OR `sessionId` (nullable unique)
- DB CHECK constraint enforces at least one non-null
- `onDelete: Restrict` on session FK prevents orphans
- P2002 catch handles concurrent evaluate requests on both paths

**Session List API (`GET /api/sessions`):**
- `type` param: `free_practice` (default) | `assigned` | `all`
- Free practice: `WHERE userId = ? AND assignmentId IS NULL`
- Assigned: `WHERE assignment.counselorId = ?`
- All: `OR` of both paths
- `SessionListItem` type in `src/types/index.ts` for API contract

**Shared Dashboard Helpers:**
- `fetchAndShowFeedback(entityId, evaluationId)` — used by both assignment and session feedback
- `fetchAndShowTranscript(sessionId, loadingKey?)` — separate loading state for session vs assignment

**Unified Governance (#40 — Implemented):**
- Evaluator prompt expanded with 5 safety + 5 consistency checks (0 additional LLM calls)
- `parseFlags()` extracts flags from `## Flags` section, `stripFlagsSection()` removes it from counselor-facing text
- Flags saved in same transaction as evaluation (`sessionFlag.createMany` inside `$transaction`)
- `POST /sessions/[id]/flag` — counselor feedback with auto-escalation (`ai_guidance_concern` → `critical`, `voice_technical_issue` → `warning`)
- `GET /api/flags` — supervisor review (pending flags, severity-ordered, includes session context)
- `SessionFeedback` shared component with dark/light variants + `mode` prop (voice sessions get "Voice agent had technical issues" option)
- Console log (`🚩`) on every flag creation; email notification via `src/lib/notifications.ts` (nodemailer, fire-and-forget)
- Supervisor dashboard: "Flags" tab with red badge count

**Post-Session Analysis Scanning (Defense-in-Depth):**
- Separate LLM pass (gpt-4.1-mini) runs misuse + consistency checks AFTER every evaluation
- Fire-and-forget: `analyzeSession().catch(...)` in evaluate route — does NOT block evaluation response
- Shared helper `src/lib/analysis.ts` used by both fire-and-forget trigger and manual `POST /api/sessions/[id]/analyze` endpoint
- `source` field on SessionFlag: `evaluation` | `analysis` | `user_feedback` — distinguishes flag origin
- Idempotent: checks for existing `source='analysis'` flags before running
- Creates `analysis_clean` flag as audit trail when no issues found
- Anti-manipulation: prompt treats transcript as DATA, not instructions; zodResponseFormat constrains output
- Env vars: `ANALYZER_MODEL` (default: gpt-4.1-mini), `SESSION_ANALYZER_PROMPT_FILE` (default: session-analyzer.txt)
- Manual endpoint: supervisor-only, rate-limited (5/session/hour)

### LiveKit Reference

| Resource | Value |
|----------|-------|
| Dashboard | https://cloud.livekit.io |
| Agent ID | CA_GUpZ97G5vvd3 |
| Cloud Region | US East B |
| CLI | `lk` (installed via brew) |
| Agent logs | `lk agent logs` |
| Redeploy agent | `cd livekit-agent && lk agent deploy` |
| Agent secrets | `lk agent secrets` |
| Update secrets | `lk agent update-secrets --secrets "KEY=value"` |

### LiveKit Secrets Gotchas (2026-02-04)

**Problem**: Voice sessions failing with `ENOTFOUND` error showing malformed hostname like `proto-trainer.ngrok.io,internal_service_key=ptg-internal-key-2026`.

**Root Cause**: LiveKit CLI `--secrets` flag uses commas to separate multiple KEY=VALUE pairs. If you pass:
```bash
# WRONG - comma interpreted as separator, corrupts the URL value
lk agent update-secrets --secrets "NEXT_APP_URL=https://example.com,INTERNAL_SERVICE_KEY=secret"
```

The CLI parses this as `NEXT_APP_URL=https://example.com` followed by garbage.

**Correct Pattern**: Use separate `--secrets` flags for each secret:
```bash
# CORRECT - each secret gets its own flag
lk agent update-secrets \
  --secrets "NEXT_APP_URL=https://proto-trainer.ngrok.io" \
  --secrets "INTERNAL_SERVICE_KEY=ptg-internal-key-2026" \
  --secrets "OPENAI_API_KEY=sk-..."
```

**Warning about `--overwrite`**: This flag **removes ALL existing secrets** and replaces with only what you specify. If you forget to include `OPENAI_API_KEY`, the agent will fail silently (no API key = no LLM responses).

**Current Required Secrets** (minimum for voice to work):
- `NEXT_APP_URL` — Where agent calls back to (e.g., `https://proto-trainer.ngrok.io`)
- `INTERNAL_SERVICE_KEY` — Must match Pi's `INTERNAL_SERVICE_KEY` env var
- `OPENAI_API_KEY` — For OpenAI Realtime API

### Voice Session Debugging (Reference)

**If voice sessions fail in future, check in this order:**

```
Voice "Waiting for agent..."
├── 1. Check Pi logs for agent callbacks:
│   ssh brad@pai-hub.local 'journalctl -u proto-trainer-next --since "10 min ago" | grep internal'
│
├── If NO log entries → Agent dispatch problem
│   ├── lk agent logs          (check agent status — run from Mac)
│   └── cd livekit-agent && lk agent deploy   (redeploy fixes stale container)
│
├── If YES log entries with errors → API problem
│   ├── P2003 foreign key → User doesn't exist in Pi DB (see gotcha #13)
│   ├── 401/403 → INTERNAL_SERVICE_KEY mismatch
│   └── 400 → Invalid request metadata
│
├── 2. Check ngrok is running:
│   curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions
│   (405 = working, 000 = ngrok not running)
│
├── 3. Check agent secrets: lk agent secrets (from Mac)
│   Need: NEXT_APP_URL, INTERNAL_SERVICE_KEY, OPENAI_API_KEY
│
└── 4. Check Pi service: ssh brad@pai-hub.local 'journalctl -u proto-trainer-next -n 50'
```

**Common failure modes:**
- "Waiting for agent..." with no Pi logs → stale agent container, redeploy (see gotcha #14)
- Malformed hostname in error → secrets set incorrectly (see "LiveKit Secrets Gotchas" above)
- "job is unresponsive" → missing `OPENAI_API_KEY`
- Session creation failed → `INTERNAL_SERVICE_KEY` mismatch or API unreachable
- Session creation failed + no Pi logs → ngrok OAuth blocking (see gotcha #16). Check: `curl` returns 302 instead of 405
- P2003 foreign key → user not in Pi database (see `docs/solutions/database-issues/pi-user-provisioning-seed-drift.md`)

### Quick Start

```bash
npm run dev               # Next.js on :3003
# Voice training uses LiveKit Cloud (no local server needed)
# To redeploy agent: cd livekit-agent && lk agent deploy
# Check agent secrets: lk agent secrets
```

### Git Status

- Latest commit on main: `49f896c` (merge of compound docs from ralph/scenario-generation-from-complaint)
- **PR #43 merged** — all 16 commits for #40 on main
- **PR #44 merged** — all 10 commits for #12 (scenario generation) + compound docs on main
- Branch: `main` (ralph/scenario-generation-from-complaint branch can be deleted)
- Pi deployed 2026-02-10 with scenario generation feature (PR #44 code, not compound docs — docs-only, no redeploy needed)
- Pi `.env` was fixed previously: DATABASE_URL password correct, INTERNAL_SERVICE_KEY present
- ngrok OAuth removed — must stay off for LiveKit agent callbacks
- Pi service may need manual restart after deploy (`sudo systemctl restart proto-trainer-next`)
