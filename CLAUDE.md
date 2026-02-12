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

## Compound Knowledge Base

When you encounter a problem, **search `docs/solutions/` before debugging from scratch**. Prior solutions are archived there by category:

| Situation | Search |
|-----------|--------|
| Deploying to Pi, voice not working, ngrok issues | `docs/solutions/runtime-errors/pi-deployment-runbook.md` |
| Writing new code and want to avoid known bug patterns | `docs/solutions/prevention-strategies/bug-prevention-patterns.md` |
| AI agent (Ralph) generating code autonomously | `docs/solutions/prevention-strategies/ai-code-generation-prevention-checklist.md` |
| Database migration issues, race conditions | `docs/solutions/database-issues/` |
| API contract mismatches, integration bugs | `docs/solutions/integration-issues/` |
| Security decisions, demo mode gating | `docs/solutions/security-issues/` |

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

### Bug Prevention Patterns

> **Before writing new API routes, database queries, file uploads, or Prisma schema changes**: consult `docs/solutions/prevention-strategies/bug-prevention-patterns.md` for 8 documented patterns with code examples. Patterns 5-8 cover fire-and-forget helpers, hot-reload gotchas, file pickers in modals, and Prisma client regeneration.

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

#### 5. Fire-and-Forget + Shared Helper Pattern

**Problem**: Ralph duplicated 90 lines of flag-building logic between the shared helper (`analysis.ts`) and the manual endpoint (`analyze/route.ts`).

**Prevention**: When a background task needs to be triggerable both automatically AND manually:
1. Put ALL business logic in a shared helper that returns a typed result
2. Route handlers are thin wrappers: auth + rate limit + data loading + call helper + return response
3. Fire-and-forget callers: `helper().catch(err => console.error(...))`

```typescript
// GOOD: Shared helper returns typed result
export async function analyzeSession(...): Promise<AnalyzeResult | AnalyzeSkipped> {
  // idempotency, LLM call, flag creation — ALL here
}

// Route: thin wrapper
const result = await analyzeSession(id, scenario, transcript)
return apiSuccess(result)

// Fire-and-forget: same helper
analyzeSession(id, scenario, transcript).catch(...)
```

#### 6. Dev Server Hot-Reload and Return Type Changes

**Problem**: After refactoring `analyzeSession()` from `void` to returning a result type, the dev server returned 500 errors. Restarting the dev server fixed it.

**Prevention**: When refactoring function return types that change from `void` to a concrete type, restart the dev server before E2E testing. Hot-reload doesn't always pick up structural type changes in server-side code.

#### 7. File Picker in Modal Containers

**Problem**: Programmatic `fileInputRef.current?.click()` doesn't reliably trigger the OS file dialog when the button is inside a scrollable modal (`overflow-y-auto`, `max-h-[80vh]`).

**Prevention**: Use native `<label>` wrapping a hidden `<input type="file">` instead of programmatic `.click()`:
```tsx
// GOOD: Works in any container including modals
<label className="cursor-pointer ...">
  Upload File
  <input type="file" onChange={handleFileChange} className="hidden" />
</label>

// BAD: Fails inside scrollable modal containers
<input ref={fileInputRef} type="file" className="hidden" />
<button onClick={() => fileInputRef.current?.click()}>Upload File</button>
```

#### 8. Prisma Client Regeneration After Schema Changes

**Problem**: After adding a new model to `schema.prisma` and applying the migration, the route handler returned `Unknown field 'documentReview' for include statement on model 'Session'`.

**Prevention**: After any schema change, always run `npx prisma generate` AND restart the dev server. Hot-reload does not pick up Prisma client regeneration.

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

## Resume Context (2026-02-12)

### Current State: PR #47 open — One-Time Scenario Workflow Improvements. Needs review.

**Branch:** `feature/one-time-scenario-workflow` at `3bdaf3e`
**PR:** https://github.com/brad-protocall/proto-trainer-next/pull/47
**Status:** Implemented, E2E tested (6/6 pass), type check + lint clean. Ready for code review.

### Pick Up Here: Review PR #47

Run Phase 4 (Review) from the SME prototype workflow. All 6 changes implemented and tested:

1. **API: Dedicated schema + transaction** — `createOneTimeScenarioWithAssignmentSchema` in `validators.ts`. `POST /api/scenarios` tries one-time schema first, creates scenario + assignment in `$transaction` with `assignedBy`, `accountId`, counselor validation.
2. **Move button** — "Generate from Complaint" only appears on One-Time tab.
3. **Promote to Global** — Inline button on one-time scenario cards, `window.confirm()` PII warning, `PUT` with `{ isOneTime: false }`.
4. **Extended form for one-time variant** — Learner dropdown + skills toggle chips in existing form when `formVariant === "one-time"`. "Create & Assign" button disabled until learner selected.
5. **File upload in complaint generator** — New `POST /api/scenarios/extract-text` route (PDF via `unpdf`, TXT client-side). `<label>` wrapping pattern for modal reliability.
6. **Learner picker in complaint generator** — Counselor dropdown in edit phase, "Save & Assign" button.

**E2E Results:** All 6 tests pass (global tab buttons, one-time tab buttons, create form UI, atomic transaction, file upload, promote to global).

**Pre-existing bugs found during E2E (not in PR scope):**
- `is_one_time` URL param in `loadScenarios()` doesn't match Zod `isOneTime` field — both tabs show same scenarios
- Dashboard loads External API System user by default instead of Test Supervisor

### Also Pending

1. **Deploy to Pi** — Run `npm run deploy:pi:full`. Two pending migrations: `20260211000000_add_flag_source` and `20260212000000_add_document_review`. Also need `npm install` on Pi for `unpdf` dependency.
2. **Fix `is_one_time` → `isOneTime` URL param bug** — Quick fix in `supervisor-dashboard.tsx` `loadScenarios()`. Would make one-time tab actually filter correctly.

### Backlog (deferred, not blocking)

- LiveKit Egress for server-side voice recording
- Agent transcript persistence via data channel (eliminate 30-40s feedback wait)
- Rename `/counselor` route to `/learner` (cosmetic)
- Force re-analysis param, catch `SessionAnalysisError` specifically, filter `analysis_clean` from badge count

### GitHub Issues

PR #47 open for review.

Completed: #38 (free practice), #39 (dashboard visibility), #40/PR#43 (post-session analysis), #12/PR#44 (scenario generation), PR#45 (analysis scanning), PR#46 (document consistency review)

### Previous Sessions

- **2026-02-12 (Night)**: Implemented One-Time Scenario Workflow (6 changes). E2E tested all features (6/6 pass). PR #47 created. Found pre-existing `is_one_time` URL param bug.
- **2026-02-11 (Late evening)**: Planned One-Time Scenario Workflow Improvements. 3-agent parallel review (DHH, Kieran, Simplicity). Plan v2 ready.
- **2026-02-11 (Evening)**: Document Consistency Review — PR #46 merged. CLAUDE.md trimmed, archived compound knowledge.
- **2026-02-11 (Afternoon)**: Post-Session Analysis Scanning — PR #45 merged.
- **2026-02-10 (Evening)**: Feature #12 scenario generation — PR #44 merged, deployed to Pi.
- **2026-02-09**: Voice UX fixes. Merged PR #43.
- **2026-02-08**: Browser-side voice recording. Safe Pi deploy script.
- **2026-02-07**: Pi deployment + voice debugging. Ngrok OAuth fix.
- **2026-02-06**: Pi voice fix (LiveKit URL, database password).
- **2026-02-05 and earlier**: Pi deploy, LiveKit migration, user testing, security hardening.

### P2 Items Deferred (fix before production)

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

### Git Status

- Branch `feature/one-time-scenario-workflow` at `3bdaf3e` (PR #47 open)
- Main at `dc44ef0` (PR #46 — document consistency review)
- Pi deployed 2026-02-10 with scenario generation (PR #44). Two migrations pending on Pi.

---

## Key Architecture Decisions

**Exclusive Arc on Evaluation**: `assignmentId` (nullable unique) OR `sessionId` (nullable unique). DB CHECK constraint enforces at least one non-null. `onDelete: Restrict` on session FK. P2002 catch handles concurrent requests.

**Session List API**: `type` param: `free_practice` (default) | `assigned` | `all`. `SessionListItem` type in `src/types/index.ts` for API contract.

**Unified Governance (#40)**: Evaluator prompt includes safety + consistency checks (0 additional LLM calls). `parseFlags()` extracts flags from `## Flags` section. Flags saved in same transaction as evaluation. `SessionFeedback` shared component with dark/light variants + `mode` prop. Console log + email notification on every flag.

**Post-Session Analysis (Defense-in-Depth)**: Separate LLM pass (gpt-4.1-mini) runs after every evaluation via fire-and-forget. Shared helper `src/lib/analysis.ts` used by both automatic trigger and manual `POST /api/sessions/[id]/analyze`. `source` field on SessionFlag distinguishes origin (`evaluation` | `analysis` | `user_feedback`). Idempotent + creates `analysis_clean` audit trail. Manual endpoint: supervisor-only, rate-limited (5/session/hour).

**Document Consistency Review**: Learner uploads PDF after evaluation → `unpdf` extracts text → LLM scores against transcript. `DocumentReview` model with unique session FK. Three scores (0-100) + typed gaps with severity. OpenAI `zodResponseFormat` with flat schema. PDF validation (magic bytes, 10MB limit). Transcript truncated to 30k chars (~$0.03/review). `<label>` wrapping hidden file input for modal compatibility.

---

## Pi Deployment Gotchas

> **Full runbook with decision trees, checklists, and failure mode tables**: `docs/solutions/runtime-errors/pi-deployment-runbook.md`. Consult it for any deploy, voice debugging, or LiveKit issue.

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
17. **NEVER use raw rsync to deploy**: Always use `npm run deploy:pi` / `deploy:pi:go` / `deploy:pi:full`. The script excludes `.env`, `node_modules/`, `.next/`, and other platform-specific files. Raw rsync caused outages TWICE by overwriting Pi's `.env`. See `scripts/deploy-pi.sh`.

---

## LiveKit Reference

| Resource | Value |
|----------|-------|
| Dashboard | https://cloud.livekit.io |
| Agent ID | CA_GUpZ97G5vvd3 |
| Cloud Region | US East B |
| CLI | `lk` (installed via brew, Mac only) |
| Agent logs | `lk agent logs` |
| Redeploy agent | `cd livekit-agent && lk agent deploy` |
| Agent secrets | `lk agent secrets` |
| Update secrets | `lk agent update-secrets --secrets "KEY=value"` |

### LiveKit Secrets Gotchas

**Problem**: LiveKit CLI `--secrets` flag uses commas to separate multiple KEY=VALUE pairs, which corrupts URLs containing commas or values that look like key=value pairs.

**Correct Pattern**: Use separate `--secrets` flags for each secret:
```bash
lk agent update-secrets \
  --secrets "NEXT_APP_URL=https://proto-trainer.ngrok.io" \
  --secrets "INTERNAL_SERVICE_KEY=ptg-internal-key-2026" \
  --secrets "OPENAI_API_KEY=sk-..."
```

**Warning about `--overwrite`**: This flag **removes ALL existing secrets** and replaces with only what you specify. If you forget to include `OPENAI_API_KEY`, the agent will fail silently.

**Current Required Secrets** (minimum for voice to work):
- `NEXT_APP_URL` — Where agent calls back to (e.g., `https://proto-trainer.ngrok.io`)
- `INTERNAL_SERVICE_KEY` — Must match Pi's `INTERNAL_SERVICE_KEY` env var
- `OPENAI_API_KEY` — For OpenAI Realtime API

### Voice Session Debugging

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
