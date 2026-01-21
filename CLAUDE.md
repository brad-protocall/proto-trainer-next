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
│   │   │   └── sessions/
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

---

## Resume Context (2026-01-20 Evening)

### Current State: User Testing In Progress

Most features working. One pending issue to verify.

### Session Fixes Applied

1. **Voice Training - OpenAI Connection** ✅
   - Fixed: WebSocket server wasn't reading OPENAI_API_KEY due to ES module timing
   - Solution: Changed `ws-server/realtime-session.ts` to use lazy getter functions instead of top-level constants
   - Files: `ws-server/realtime-session.ts`

2. **Voice Training - DB Session Creation** ✅
   - Fixed: Was sending `modelType: "voice"` but API expected `"phone"`
   - Solution: Changed to `modelType: "phone"` in realtime-session.ts
   - Files: `ws-server/realtime-session.ts`

3. **Voice Training - Evaluation Auth** ✅
   - Fixed: `requestEvaluation` was missing `x-user-id` header
   - Solution: Added header to fetch call
   - Files: `src/hooks/use-realtime-voice.ts`

4. **Chat Free Practice** ✅
   - Fixed: Page only checked for `assignmentId === "free"` not `"free-practice"`
   - Fixed: `useChat` hook sent old API format instead of discriminated union
   - Files: `src/app/training/chat/[assignmentId]/page.tsx`, `src/hooks/use-chat.ts`

5. **Scenario Form Fields** ✅
   - Added: Evaluator Context field with Write Text / Upload File toggle
   - Added: Organization Account dropdown
   - Added: Relevant Policy Sections field
   - Files: `src/components/supervisor-dashboard.tsx`

6. **Auth Deadlock** ✅
   - Fixed: GET `/api/users` required auth but dashboard needed user first
   - Solution: Made GET endpoint public for prototype
   - Files: `src/app/api/users/route.ts`

7. **Bulk Import Mapping** ✅
   - Fixed: Frontend sent `evaluator_context` (snake_case) but API expected `evaluatorContext`
   - Files: `src/components/bulk-import-modal.tsx`

8. **Logo Files** ✅
   - Added: `public/protocall-logo.svg` and `public/logo-main.svg`

9. **Seed Data** ✅
   - Created: `prisma/seed.ts` with 5 counselors for testing
   - Added: `npm run db:seed` command
   - Counselors: Test Counselor, Sarah Johnson, Michael Chen, Emily Rodriguez, David Kim

10. **CSV Template** ✅
    - Created: `public/scenario-import-template.csv` for bulk scenario import

### Pending Issue to Verify

**Assignment Creation** - Still showing "Validation failed"
- Changes made but not yet tested:
  - Changed frontend to send `undefined` instead of `null` for optional fields
  - Updated validator to accept `.nullable()` for dueDate and supervisorNotes
  - Added console.error logging to see actual validation error
- Files modified: `src/components/supervisor-dashboard.tsx`, `src/lib/validators.ts`, `src/app/api/assignments/route.ts`
- **Next step**: Hard refresh and try creating assignment - check server logs for specific error

### Test Status

| Feature | Status |
|---------|--------|
| Logo display | ✅ Working |
| Role toggle buttons | ✅ Working |
| Scenario creation | ✅ Working |
| Chat free practice | ✅ Working |
| Voice free practice | ✅ Working (OpenAI connects, sessions saved) |
| Voice evaluation | ✅ Fixed (needs re-test when can speak) |
| Assignment creation | ⚠️ Pending verification |
| Bulk scenario import | ✅ Template ready |

### Quick Start for Next Session

```bash
# Start servers
npm run dev      # Terminal 1 - Next.js on :3003
npm run ws:dev   # Terminal 2 - WebSocket on :3004

# If counselors missing, run seed
npm run db:seed
```

Then test assignment creation - it should work now after hard refresh.

---

## User Testing Checklist

### Prerequisites

```bash
# Start both servers
npm run dev      # Terminal 1
npm run ws:dev   # Terminal 2
```

Open http://localhost:3003

### Test Data Available

| Type | Count | Examples |
|------|-------|----------|
| Supervisor | 1 | Test Supervisor |
| Counselors | 5 | Test Counselor, Sarah Johnson, Michael Chen, Emily Rodriguez, David Kim |
| Scenarios | 5+ | Various test scenarios |

### Test Flows

#### Counselor Flow
- [x] Select "Counselor" on home page
- [x] View Free Practice section
- [x] Click "Practice by Voice" → connects to OpenAI, roleplay works
- [x] Click "Practice by Text" → chat with AI works
- [ ] Voice evaluation - needs re-test
- [ ] Chat evaluation - needs test

#### Supervisor Flow
- [x] Select "Supervisor" on home page
- [x] View Scenarios tab
- [x] Toggle Global / One-Time filter
- [x] Create a new scenario
- [ ] Create assignment for counselor - **VERIFY THIS**
- [x] Import Scenarios → template available

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Voice stuck on "Connecting..." | Restart WebSocket server: `npm run ws:dev` |
| Assignment validation failed | Hard refresh (Cmd+Shift+R), check server logs |
| No counselors in dropdown | Run `npm run db:seed` |
| No scenarios | Run seed or create via UI |

### Key Files Modified This Session

| File | Change |
|------|--------|
| `ws-server/realtime-session.ts` | Lazy env loading, modelType fix |
| `src/hooks/use-realtime-voice.ts` | Added x-user-id to evaluation |
| `src/hooks/use-chat.ts` | Fixed API request format |
| `src/components/supervisor-dashboard.tsx` | Form fields, assignment payload |
| `src/lib/validators.ts` | Made optional fields nullable |
| `prisma/seed.ts` | New file - seeds test data |
| `public/scenario-import-template.csv` | New file - CSV template |
